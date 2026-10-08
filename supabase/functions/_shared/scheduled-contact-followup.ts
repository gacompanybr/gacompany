import { scheduledFollowupAllowed } from "./contact-followup-policy.ts";

type Generate = (history: string, nome: string | null, attempt: number, agentName: string | null, tone: string | null) => Promise<string>;

// Uses the existing two-hour agent job; a claim is never retried after ambiguous delivery.
export async function runScheduledContactFollowups(admin: any, agents: Map<string, any>, generate: Generate, evoUrl: string, evoKey: string) {
  if (!agents.size) return { sent: 0 };
  const { data: due, error } = await admin.from("whatsapp_contact_preferences")
    .select("portfolio_id, phone, scheduled_followup_at, scheduled_followup_token")
    .in("portfolio_id", [...agents.keys()]).eq("scheduled_followup_status", "pending")
    .eq("followup_disabled", false).eq("customer_status", "lead")
    .lte("scheduled_followup_at", new Date().toISOString()).order("scheduled_followup_at").limit(100);
  if (error) throw error;
  let sent = 0;
  for (const row of due ?? []) {
    const token = row.scheduled_followup_token;
    if (!token) continue;
    const scope = (query: any) => query.eq("portfolio_id", row.portfolio_id).eq("phone", row.phone);
    let claimed = false;
    let dispatchStarted = false;
    try {
      const { data: paused, error: pauseError } = await scope(admin.from("whatsapp_paused_contacts").select("paused_until")).maybeSingle();
      if (pauseError) throw pauseError;
      if (paused?.paused_until && Date.parse(paused.paused_until) > Date.now()) continue;
      const { data: connection, error: connectionError } = await admin.from("whatsapp_connections")
        .select("instance_name, status").eq("portfolio_id", row.portfolio_id).maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection?.instance_name || connection.status !== "connected") continue;
      const { data: messages, error: historyError } = await admin.from("whatsapp_conversas")
        .select("role, mensagem, contato_nome, sdr_lead_id").eq("portfolio_id", row.portfolio_id)
        .eq("contato_telefone", row.phone).order("created_at", { ascending: false }).limit(20);
      if (historyError) throw historyError;
      if (!messages?.length) continue;
      const { data: claim, error: claimError } = await scope(admin.from("whatsapp_contact_preferences")
        .update({ scheduled_followup_status: "processing" })).eq("scheduled_followup_token", token)
        .eq("scheduled_followup_status", "pending").select("phone").maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;
      claimed = true;
      const agent = agents.get(row.portfolio_id);
      const history = [...messages].reverse().map((m: any) => `${m.role === "assistant" ? "ATENDENTE" : "CLIENTE"}: ${m.mensagem}`).join("\n");
      const text = await generate(history, messages[0]?.contato_nome ?? null, 1, agent?.nome_atendente, agent?.tom_de_voz);
      const { data: fresh, error: freshError } = await scope(admin.from("whatsapp_contact_preferences")
        .select("followup_disabled, customer_status, scheduled_followup_at, scheduled_followup_status, scheduled_followup_token, invalidated_before")).maybeSingle();
      if (freshError) throw freshError;
      if (!scheduledFollowupAllowed(fresh, token)) continue;
      const { data: currentPause, error: currentPauseError } = await scope(admin.from("whatsapp_paused_contacts").select("paused_until")).maybeSingle();
      if (currentPauseError) throw currentPauseError;
      if (currentPause?.paused_until && Date.parse(currentPause.paused_until) > Date.now()) {
        await scope(admin.from("whatsapp_contact_preferences").update({ scheduled_followup_status: "pending" })).eq("scheduled_followup_token", token);
        continue;
      }
      dispatchStarted = true;
      const response = await fetch(`${evoUrl}/message/sendText/${connection.instance_name}`, {
        method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: row.phone, text, delay: 1200, linkPreview: false }),
      });
      if (!response.ok) throw new Error(`scheduled_send_${response.status}`);
      const body = await response.json().catch(() => null);
      await scope(admin.from("whatsapp_contact_preferences").update({ scheduled_followup_status: "sent" }))
        .eq("scheduled_followup_token", token).eq("scheduled_followup_status", "processing");
      const id = body?.key?.id ?? body?.message?.key?.id ?? body?.data?.key?.id;
      if (typeof id === "string" && id) await admin.from("whatsapp_sent_messages_log").upsert({
        portfolio_id: row.portfolio_id, instance_name: connection.instance_name, phone: row.phone, message_id: id,
      }, { onConflict: "message_id", ignoreDuplicates: true });
      await admin.from("whatsapp_conversas").insert({ portfolio_id: row.portfolio_id,
        instance_name: connection.instance_name, contato_telefone: row.phone,
        contato_nome: messages[0]?.contato_nome ?? null, role: "assistant", mensagem: text,
        sdr_lead_id: messages.find((m: any) => m.sdr_lead_id)?.sdr_lead_id ?? null });
      sent += 1;
    } catch (error) {
      if (claimed) await scope(admin.from("whatsapp_contact_preferences")
        .update({ scheduled_followup_status: dispatchStarted ? "failed" : "pending" }))
        .eq("scheduled_followup_token", token).eq("scheduled_followup_status", "processing");
      console.error("[SCHEDULED-FOLLOWUP]", error instanceof Error ? error.message : "failed");
    }
  }
  return { sent };
}