import { summarySimilarity } from "./agent-safe-policy.ts";
import { nextAgentOpening, safeWithinHours } from "./agent-safe-context.ts";
export function formatTeamHandoff(agent: any, phone: string, tipo: string, resumo: string, turns: { role: string; mensagem: string }[], name?: string | null, at = new Date()) {
  const within = safeWithinHours(agent, at);
  return [`${tipo === "atualizacao" ? "ATUALIZAÇÃO" : "ENCAMINHAMENTO"} — ${agent.business_name ?? agent.nome}`,
    `Tipo: ${tipo}`, `Cliente: ${name ?? "não informado"}`, `WhatsApp: +${phone} — https://wa.me/${phone}`,
    `O que precisa: ${resumo.slice(0, 300)}`, "Últimas mensagens:",
    ...turns.filter(t => t.role === "user").slice(-3).map(t => t.mensagem.slice(0, 200)),
    `Recebido em ${at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    within ? "Dentro do horário" : `FORA do horário: responder quando a loja abrir (${nextAgentOpening(agent, at) ?? "horário não informado"})`,
  ].join("\n");
}
export async function enqueueTeamHandoff(admin: any, agent: any, phone: string, tipo: string, resumo: string, turns: any[], name?: string | null) {
  const { data: recent, error } = await admin.from("whatsapp_handoffs").select("id,resumo,status")
    .eq("agent_id", agent.id).eq("phone", phone).eq("tipo", tipo).gte("created_at", new Date(Date.now() - 30 * 60000).toISOString());
  if (error) throw new Error("Não foi possível registrar o encaminhamento");
  const duplicate = recent?.find((row: any) => summarySimilarity(row.resumo, resumo) >= 0.8);
  if (duplicate) return duplicate;
  // Same exact topic shares a unique key within its 30-minute arrival bucket.
  const normalized = resumo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\W+/).filter(Boolean).sort().join(" ");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${phone}|${tipo}|${normalized}|${Math.floor(Date.now() / 1800000)}`));
  const key = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const { data, error: saveError } = await admin.from("whatsapp_handoffs").insert({
    portfolio_id: agent.portfolio_id, agent_id: agent.id, phone, tipo, resumo: resumo.slice(0, 300), dedupe_key: key,
    fora_do_horario: !safeWithinHours(agent), payload: { text: formatTeamHandoff(agent, phone, tipo, resumo, turns, name), deliveries: {} },
  }).select("*").single();
  if (saveError?.code === "23505") {
    const { data: prior } = await admin.from("whatsapp_handoffs").select("*").eq("agent_id", agent.id).eq("dedupe_key", key).single();
    return prior;
  }
  if (saveError) throw new Error("Falha ao salvar encaminhamento");
  return data;
}
export async function dispatchTeamHandoff(admin: any, agent: any, id: string, evoUrl: string, evoKey: string, transport: typeof fetch = fetch) {
  const token = crypto.randomUUID();
  const { data, error } = await admin.rpc("claim_agent_handoff", { _id: id, _token: token });
  if (error) throw new Error("Falha ao reservar encaminhamento");
  const handoff = data?.[0];
  if (!handoff) return { status: "not_claimed" };
  const { data: current, error: configError } = await admin.from("whatsapp_agents").select("instancia_id,report_group_id,report_number").eq("id", agent.id).single();
  const destinations = [current?.report_group_id, current?.report_number?.replace(/\D/g, "")].filter(Boolean);
  const save = async (status: string, reason?: string, payload = handoff.payload, messageId?: string) => {
    const { error } = await admin.from("whatsapp_handoffs").update({ status, error: reason ?? null, payload, message_id: messageId ?? handoff.message_id,
      next_attempt_at: new Date(Date.now() + handoff.attempts * 60000).toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("claim_token", token).eq("status", "sending");
    if (error) throw new Error("Falha ao registrar entrega do encaminhamento");
    return { status, error: reason };
  };
  if (configError || !current?.instancia_id || !destinations.length) return save("failed", "Destino de encaminhamento não configurado");
  const deliveries = { ...(handoff.payload?.deliveries ?? {}) };
  for (const target of destinations) {
    if (deliveries[target]?.status === "accepted") continue;
    if (deliveries[target]?.status === "uncertain") return save("uncertain", "Entrega precisa de verificação manual", { ...handoff.payload, deliveries });
    try {
      const response = await transport(`${evoUrl}/message/sendText/${current.instancia_id}`, {
        method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: target, text: handoff.payload.text }), signal: AbortSignal.timeout(12000),
      });
      const raw = await response.text();
      if (!response.ok) {
        const uncertain = response.status >= 500 || response.status === 408;
        deliveries[target] = { status: uncertain ? "uncertain" : "rejected" };
        return save(uncertain ? "uncertain" : handoff.attempts >= 5 || response.status !== 429 ? "failed" : "pending", `WhatsApp recusou ou não confirmou (${response.status})`, { ...handoff.payload, deliveries });
      }
      const result = JSON.parse(raw), messageId = result.key?.id ?? result.data?.key?.id;
      if (!messageId || result.error) throw new Error("Envio sem confirmação");
      deliveries[target] = { status: "accepted", message_id: messageId };
      // Persist each accepted destination before the next send; never repeat it.
      const { error: persistError } = await admin.from("whatsapp_handoffs").update({ payload: { ...handoff.payload, deliveries }, message_id: messageId }).eq("id", id).eq("claim_token", token);
      if (persistError) throw new Error("Aceitação sem registro durável");
      await admin.from("whatsapp_sent_messages_log").upsert({ portfolio_id: agent.portfolio_id, instance_name: current.instancia_id, phone: target, message_id: messageId }, { onConflict: "message_id", ignoreDuplicates: true });
    } catch (error) {
      deliveries[target] = { status: "uncertain" };
      return save("uncertain", error instanceof Error ? error.message : "Entrega incerta", { ...handoff.payload, deliveries });
    }
  }
  return save("accepted", undefined, { ...handoff.payload, deliveries }, Object.values(deliveries).map((d: any) => d.message_id).filter(Boolean).at(-1));
}