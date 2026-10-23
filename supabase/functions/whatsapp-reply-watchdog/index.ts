import { createClient } from "npm:@supabase/supabase-js@2";
import { processInboundMessage } from "../_shared/agent-inbound-processor.ts";
import { dispatchTeamHandoff } from "../_shared/team-handoff.ts";
import { safeWithinHours } from "../_shared/agent-safe-context.ts";
import { safeAgentEnabled } from "../_shared/agent-safe-policy.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("LOVABLE_API_KEY"), evoUrl = Deno.env.get("EVOLUTION_API_URL"), evoKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!url || !key || !apiKey || !evoUrl || !evoKey) return json({ error: "Serviço não configurado" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("X-Agent-Recovery-Key");
    let cronAuthorized = false;
    if (token) {
      const { data } = await admin.from("whatsapp_recovery_config").select("callback_token").eq("id", true).single();
      cronAuthorized = !!data && data.callback_token === token;
    }
    if (!cronAuthorized) {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth, error } = await admin.auth.getUser(bearer);
      if (error || !auth.user) return json({ error: "Não autenticado" }, 401);
      if (body.action !== "resume" || typeof body.agentId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.agentId)) return json({ error: "Ação não permitida" }, 403);
      const { data: agent } = await admin.from("whatsapp_agents").select("portfolio_id,melhorias_enabled").eq("id", body.agentId).single();
      if (!agent || !safeAgentEnabled(agent)) return json({ error: "Agente não habilitado" }, 400);
      const { data: access } = await admin.rpc("has_portfolio_access", { _user_id: auth.user.id, _portfolio_id: agent.portfolio_id });
      if (!access) return json({ error: "Sem acesso ao cliente" }, 403);
      const { error: saveError } = await admin.from("whatsapp_agents").update({ ai_paused_reason: null }).eq("id", body.agentId);
      return saveError ? json({ error: "Falha ao retomar" }, 500) : json({ ok: true });
    }
    const { data: agents, error } = await admin.from("whatsapp_agents").select("*").eq("melhorias_enabled", true);
    if (error) throw error;
    let recovered = 0, dispatched = 0;
    for (const agent of agents ?? []) {
      if (!safeAgentEnabled(agent)) continue;
      if (agent.watchdog_enabled && agent.status === "active") {
        const cutoff = new Date(Date.now() - Math.max(90, agent.recovery_after_seconds ?? 90) * 1000).toISOString();
        const { data: rows, error: rowError } = await admin.from("whatsapp_conversas").select("*").eq("agent_id", agent.id).eq("role", "user")
          .is("sdr_lead_id", null).is("recovered_at", null).in("reply_state", ["received", "processing", "failed", "sending"])
          .lt("created_at", cutoff).gt("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).order("created_at", { ascending: false }).limit(10);
        if (rowError) throw rowError;
        for (const row of rows ?? []) {
          // The model may still be streaming: prefer no duplicate over unsafe replay.
          if (row.reply_state === "sending") {
            if (Date.now() - Date.parse(row.processing_started_at ?? row.created_at) > 5 * 60000) {
              await admin.from("whatsapp_conversas").update({ reply_state: "uncertain", reply_state_reason: "Envio interrompido; verificar entrega antes de reenviar" }).eq("id", row.id).eq("reply_state", "sending").eq("reply_token", row.reply_token).eq("processing_started_at", row.processing_started_at);
            }
            continue;
          }
          await processInboundMessage({ admin, apiKey, evoUrl, evoKey }, row, agent, true);
          recovered++;
        }
      }
      if (agent.status === "active" && agent.handoff_enabled && agent.report_profile === "generico") {
        const { data: stale } = await admin.from("whatsapp_handoffs").select("id").eq("agent_id", agent.id).eq("status", "sending").lt("updated_at", new Date(Date.now() - 5 * 60000).toISOString());
        for (const row of stale ?? []) await admin.from("whatsapp_handoffs").update({ status: "uncertain", error: "Envio interrompido; verificar antes de reenviar" }).eq("id", row.id).eq("status", "sending");
        const { data: pending } = await admin.from("whatsapp_handoffs").select("id").eq("agent_id", agent.id).eq("status", "pending").lt("attempts", 5).lte("next_attempt_at", new Date().toISOString()).limit(10);
        for (const row of pending ?? []) { await dispatchTeamHandoff(admin, agent, row.id, evoUrl, evoKey); dispatched++; }
      }
      // Persist alert reservations before sending: ambiguous alerts are never retried blindly.
      const { data: waiting } = await admin.from("whatsapp_conversas").select("id,reply_state_reason").eq("agent_id", agent.id).in("reply_state", ["failed", "uncertain", "processing", "received"])
        .lt("created_at", new Date(Date.now() - 5 * 60000).toISOString()).gt("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).limit(10);
      const { data: failedHandoffs } = await admin.from("whatsapp_handoffs").select("id,error").eq("agent_id", agent.id).in("status", ["failed", "uncertain"]).gt("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).limit(10);
      const alerts = [...(safeWithinHours(agent) ? waiting ?? [] : []).map((r: any) => ({ id: `reply:${r.id}`, reason: r.reply_state_reason ?? "Conversa sem resposta há mais de cinco minutos" })), ...(failedHandoffs ?? []).map((r: any) => ({ id: `handoff:${r.id}`, reason: r.error ?? "Encaminhamento não confirmado" }))];
      for (const alert of alerts) {
        const { data: saved, error: saveError } = await admin.from("whatsapp_agent_alerts").insert({ portfolio_id: agent.portfolio_id, agent_id: agent.id, dedupe_key: alert.id, reason: alert.reason, status: agent.alert_number ? "sending" : "no_destination" }).select("id").single();
        if (saveError || !saved || !agent.alert_number || !agent.instancia_id) continue;
        try {
          const response = await fetch(`${evoUrl}/message/sendText/${agent.instancia_id}`, { method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" }, body: JSON.stringify({ number: agent.alert_number.replace(/\D/g, ""), text: `ALERTA — ${agent.nome}\n${alert.reason}\nVerifique a aba Saúde ou Encaminhamentos.` }), signal: AbortSignal.timeout(12000) });
          const receipt = await response.json().catch(() => null);
          const accepted = response.ok && receipt?.key?.id;
          await admin.from("whatsapp_agent_alerts").update({ status: accepted ? "accepted" : "uncertain" }).eq("id", saved.id);
          if (accepted) await admin.from("whatsapp_sent_messages_log").upsert({ portfolio_id: agent.portfolio_id, instance_name: agent.instancia_id, phone: agent.alert_number, message_id: receipt.key.id }, { onConflict: "message_id", ignoreDuplicates: true });
        } catch { await admin.from("whatsapp_agent_alerts").update({ status: "uncertain" }).eq("id", saved.id); }
      }
    }
    const { error: drainError } = await admin.rpc("drain_agent_recovery");
    if (drainError) throw drainError;
    return json({ recovered, dispatched });
  } catch (error) {
    console.error("[REPLY_WATCHDOG]", error instanceof Error ? error.message : "Falha de recuperação");
    return json({ error: "Falha na recuperação de respostas" }, 500);
  }
});