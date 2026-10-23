import { safeAgentEnabled, handoffEnabled, stopRequested } from "./agent-safe-policy.ts";
import { safeWithinHours } from "./agent-safe-context.ts";
import { generateSafeAgentResponse } from "./agent-safe-response.ts";
import { fetchProductCatalog } from "./product-catalog.ts";
import { enqueueTeamHandoff, dispatchTeamHandoff } from "./team-handoff.ts";
import { usesHumanTakeoverPause } from "./human-takeover-policy.ts";
import { usesCommercialOrderFlow } from "./order-report-scope.ts";
import { processConversationOrder } from "./order-report.ts";
import { normalizeSearchText } from "./catalog-search.ts";
export type InboundServices = { admin: any; apiKey: string; evoUrl: string; evoKey: string };
export async function processInboundMessage(services: InboundServices, row: any, agent: any, recovery = false) {
  const { admin, apiKey, evoUrl, evoKey } = services;
  if (!safeAgentEnabled(agent) || row.sdr_lead_id) return;
  const start = Date.now(), timings: Record<string, number> = {};
  let token = crypto.randomUUID(), claimed = false, sending = false;
  const save = async (state: string, reason?: string, extras: Record<string, unknown> = {}) => {
    let query = admin.from("whatsapp_conversas").update({ reply_state: state, reply_state_reason: reason ?? null, reply_timings: { ...timings, total_ms: Date.now() - start }, ...extras }).eq("id", row.id);
    if (claimed) query = query.eq("reply_token", token);
    const { error } = await query;
    if (error) throw new Error("Falha ao registrar estado da resposta");
  };
  const allowed = async () => {
    const { data: latestAgent, error: agentError } = await admin.from("whatsapp_agents").select("*").eq("id", agent.id).single();
    if (agentError || !latestAgent) throw new Error("Falha ao verificar estado do agente");
    agent = latestAgent;
    if (!safeAgentEnabled(agent) || agent.status !== "active") { await save("skipped_inactive", "Agente inativo ou melhorias desativadas"); return false; }
    if (stopRequested(row.mensagem)) { await save("skipped_stop", "Contato pediu para parar"); return false; }
    if (!safeWithinHours(agent) && agent.fora_horario_modo !== "responder") { await save("skipped_hours", "Fora do horário; modo silêncio"); return false; }
    if (usesHumanTakeoverPause(agent.portfolio_id)) {
      const { data: paused, error } = await admin.from("whatsapp_paused_contacts").select("phone,paused_until").eq("portfolio_id", row.portfolio_id).gt("paused_until", new Date().toISOString());
      if (error) throw new Error("Não foi possível verificar pausa humana");
      if (paused?.some((p: any) => p.phone.replace(/\D/g, "").slice(-11) === row.contato_telefone.replace(/\D/g, "").slice(-11))) { await save("skipped_paused", "Equipe humana atendendo o contato"); return false; }
    }
    const { data: newer, error } = await admin.from("whatsapp_conversas").select("id,role").eq("portfolio_id", row.portfolio_id).eq("contato_telefone", row.contato_telefone).gt("created_at", row.created_at).in("role", ["user", "assistant", "human"]).limit(1);
    if (error) throw new Error("Não foi possível verificar resposta posterior");
    if (newer?.length) { await save("skipped_superseded", "Outra mensagem ou resposta posterior assumiu o atendimento"); return false; }
    return true;
  };
  try {
    if (!await allowed()) return;
    const catalogPromise = agent.catalogo_url?.trim() ? fetchProductCatalog(agent.catalogo_url).then(data => ({ data, failed: false }), () => ({ data: undefined, failed: true })) : Promise.resolve({ data: undefined, failed: false });
    if (!recovery) await new Promise(resolve => setTimeout(resolve, 6000));
    timings.debounce_ms = Date.now() - start;
    if (!await allowed()) return;
    const { data: reservations, error: claimError } = await admin.rpc("claim_agent_reply", { _id: row.id, _token: token, _recovery: recovery });
    if (claimError) throw new Error("Reserva de resposta indisponível");
    if (!reservations?.length) return;
    claimed = true;
    const { data: history, error: historyError } = await admin.from("whatsapp_conversas").select("role,mensagem,created_at")
      .eq("portfolio_id", row.portfolio_id).eq("contato_telefone", row.contato_telefone).lte("created_at", row.created_at).order("created_at", { ascending: false }).limit(60);
    if (historyError) throw new Error("Histórico indisponível");
    const turns = (history ?? []).reverse();
    const catalogStart = Date.now(), catalog = await catalogPromise;
    timings.catalog_wait_ms = Date.now() - catalogStart;
    let orderResult: Awaited<ReturnType<typeof processConversationOrder>> = null;
    if (usesCommercialOrderFlow(agent.portfolio_id, agent.catalogo_url ?? "") && catalog.data) {
      const orderStart = Date.now();
      orderResult = await processConversationOrder(admin, agent, row.contato_telefone, turns, catalog.data, apiKey, evoUrl, evoKey);
      timings.order_ms = Date.now() - orderStart;
    }
    if (!await allowed()) return;
    agent = { ...agent, _orderResult: orderResult };
    const logSearch = (consulta: string, result: any) => {
      admin.from("catalog_search_logs").insert({ portfolio_id: row.portfolio_id, agent_id: agent.id, telefone: row.contato_telefone, consulta, consulta_normalizada: normalizeSearchText(consulta), camada: result.camada, total_encontrado: result.total, retornados: result.produtos?.length ?? 0 }).then(({ error }: any) => { if (error) console.warn("[SAFE_SEARCH] log failed", row.id); });
    };
    const aiStart = Date.now();
    let result = await generateSafeAgentResponse(agent, turns, apiKey, catalog.data, catalog.failed, logSearch);
    timings.ai_ms = Date.now() - aiStart;
    // An identical prior answer is regenerated only once; never suppress all output.
    const previous = turns.filter((t: any) => t.role === "assistant").slice(-6).map((t: any) => normalizeSearchText(t.mensagem));
    if (!result.fallback && previous.includes(normalizeSearchText(result.text)) && Date.now() - start < 60000) {
      result = await generateSafeAgentResponse({ ...agent, _replyInstruction: "O cliente insistiu ou repetiu. Responda de outro jeito, mais curto, retomando o ponto sem reiniciar." }, turns, apiKey, catalog.data, catalog.failed, logSearch);
    }
    if (result.gatewayError && [402, 403].includes(result.gatewayError.status)) await admin.from("whatsapp_agents").update({ ai_paused_reason: result.gatewayError.message }).eq("id", agent.id);
    if (result.fallback && !safeWithinHours(agent) && agent.fora_horario_msg?.trim()) result = { ...result, text: agent.fora_horario_msg, parts: [agent.fora_horario_msg] };
    if (!await allowed()) return;
    if (result.handoff && handoffEnabled(agent)) {
      const { data: portfolio } = await admin.from("portfolios").select("name").eq("id", row.portfolio_id).single();
      const handoffAgent = { ...agent, business_name: portfolio?.name ?? agent.nome };
      const handoff = await enqueueTeamHandoff(admin, handoffAgent, row.contato_telefone, result.handoff.tipo, result.handoff.resumo, turns, row.contato_nome);
      if (handoff?.id && handoff.status === "pending") await dispatchTeamHandoff(admin, handoffAgent, handoff.id, evoUrl, evoKey);
    }
    if (!await allowed()) return;
    // Atomic state transition before the transport prevents overlapping recovery.
    const { data: sendClaim, error: sendClaimError } = await admin.from("whatsapp_conversas").update({ reply_state: "sending", fallback_used: result.fallback })
      .eq("id", row.id).eq("reply_token", token).eq("reply_state", "processing").select("id");
    if (sendClaimError || !sendClaim?.length) return;
    sending = true;
    const targets = Array.isArray(row.send_targets) && row.send_targets.length ? row.send_targets : [row.remote_jid ?? row.contato_telefone];
    for (let i = 0; i < result.parts.length; i++) {
      // Recheck the selected token before every bubble; no retry for ambiguous delivery.
      const { data: owned, error } = await admin.from("whatsapp_conversas").select("reply_state,reply_token").eq("id", row.id).single();
      if (error || owned?.reply_token !== token || owned?.reply_state !== "sending") return;
      const response = await fetch(`${evoUrl}/message/sendText/${row.instance_name}`, { method: "POST", headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: targets[0], text: result.parts[i].replace(/\*\*/g, "").replace(/^#+\s*/gm, "") }), signal: AbortSignal.timeout(12000) });
      const raw = await response.text();
      if (!response.ok) { await save(response.status >= 500 || response.status === 408 ? "uncertain" : "failed", `Envio não confirmado (${response.status})`); return; }
      const receipt = JSON.parse(raw), messageId = receipt.key?.id ?? receipt.data?.key?.id;
      if (!messageId || receipt.error) { await save("uncertain", "WhatsApp sem confirmação de aceitação"); return; }
      await admin.from("whatsapp_sent_messages_log").upsert({ portfolio_id: row.portfolio_id, instance_name: row.instance_name, phone: row.contato_telefone, message_id: messageId }, { onConflict: "message_id", ignoreDuplicates: true });
      const { error: persistError } = await admin.from("whatsapp_conversas").insert({ portfolio_id: row.portfolio_id, instance_name: row.instance_name, contato_telefone: row.contato_telefone, contato_nome: row.contato_nome, role: "assistant", mensagem: result.parts[i] });
      if (persistError) { await save("uncertain", "Mensagem aceita; histórico não confirmado"); return; }
      if (i < result.parts.length - 1) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));
    }
    await save("replied", result.fallback ? "Mensagem de segurança enviada; confirmação humana pendente" : undefined, { fallback_used: result.fallback });
    console.log("[AGENT_REPLY]", JSON.stringify({ id: row.id, agentId: agent.id, timings, fallback: result.fallback, state: "replied" }));
  } catch (error) {
    console.error("[AGENT_REPLY_ERROR]", JSON.stringify({ id: row.id, stage: sending ? "sending" : "processing", reason: error instanceof Error ? error.message : "Falha no atendimento" }));
    await save(sending ? "uncertain" : "failed", sending ? "Envio interrompido; verificar antes de reenviar" : error instanceof Error ? error.message : "Falha de processamento").catch(() => {});
  }
}