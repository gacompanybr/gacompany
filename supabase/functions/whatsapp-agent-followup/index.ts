// Cron: follow-up automático do agente de IA (fluxo reativo do whatsapp-webhook).
// Regra: se a última mensagem da conversa foi do agente e o contato ficou 24h sem
// responder -> 1º follow-up. Se continuar sem responder por mais 48h -> 2º e ÚLTIMO.
// Nunca mais que 2. Se o contato responder, o ciclo é zerado.
// Não toca em nada do SDR (conversas com sdr_lead_id são ignoradas).
import { createClient } from "npm:@supabase/supabase-js@2";
import { canSendContactFollowup } from "../_shared/contact-followup-policy.ts";
import { runScheduledContactFollowups } from "../_shared/scheduled-contact-followup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const FIRST_DELAY_H = 24;   // silêncio do contato antes do 1º follow-up
const SECOND_DELAY_H = 48;  // silêncio após o 1º follow-up antes do 2º
const MAX_FOLLOWUPS = 2;
const LOOKBACK_DAYS = 14;   // janela de conversas consideradas

type Row = {
  portfolio_id: string;
  instance_name: string;
  contato_telefone: string;
  contato_nome: string | null;
  role: string;
  mensagem: string;
  created_at: string;
  sdr_lead_id: string | null;
};

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function sanitize(text: string): string {
  return String(text)
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 400);
}

async function generateFollowup(
  history: string,
  nome: string | null,
  attempt: number,
  agentName: string | null,
  tone: string | null,
): Promise<string> {
  const system = [
    `Você é ${agentName || "o atendente"} no WhatsApp.`,
    tone ? `Tom de voz: ${tone}.` : "",
    "Escreva UMA mensagem curta de follow-up (no máximo 300 caracteres) retomando EXATAMENTE o assunto da conversa abaixo.",
    "Regras: sem markdown, sem emojis em excesso, sem saudação formal longa, sem repetir tudo que já foi dito,",
    "sem inventar informação nova, sem pedir desculpas exageradas. Soe humano e natural.",
    attempt === 1
      ? "Este é o primeiro retorno após ~1 dia de silêncio: retome o ponto onde a conversa parou e faça uma pergunta simples."
      : "Este é o último contato após vários dias de silêncio: seja breve, deixe a porta aberta e não pressione.",
    nome ? `O contato se chama ${nome} — pode usar o primeiro nome uma vez.` : "Não use nome nenhum, você não sabe o nome do contato.",
    "Responda somente com o texto da mensagem.",
  ].filter(Boolean).join("\n");

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Histórico da conversa:\n\n${history}` },
      ],
// temperature omitida: gpt-6-astra aceita apenas o valor padrão
      max_tokens: 200,
    }),
  });
  if (r.status === 429) throw new Error("ai_rate_limited");
  if (r.status === 402) throw new Error("ai_credits_exhausted");
  if (!r.ok) throw new Error(`ai_error_${r.status}`);
  const j = await r.json();
  const text = sanitize(String(j.choices?.[0]?.message?.content ?? ""));
  if (!text) throw new Error("ai_empty");
  return text;
}

async function run() {
  // 1) agentes ativos
  const { data: agents, error: aerr } = await admin
    .from("whatsapp_agents")
    .select("portfolio_id, nome_atendente, tom_de_voz, status, followup_enabled")
    .eq("status", "active");
  if (aerr) throw new Error(aerr.message);
  const agentByPortfolio = new Map<string, any>();
  for (const a of agents ?? []) agentByPortfolio.set(String(a.portfolio_id), a);
  const scheduled = await runScheduledContactFollowups(admin, agentByPortfolio, generateFollowup, EVO_URL, EVO_KEY);
  for (const [id, agent] of agentByPortfolio) if (!agent.followup_enabled) agentByPortfolio.delete(id);
  if (agentByPortfolio.size === 0) return { portfolios: 0, sent: 0, scheduled, results: [] };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: rows, error: cerr } = await admin
    .from("whatsapp_conversas")
    .select("portfolio_id, instance_name, contato_telefone, contato_nome, role, mensagem, created_at, sdr_lead_id")
    .in("portfolio_id", [...agentByPortfolio.keys()])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20000);
  if (cerr) throw new Error(cerr.message);

  // 2) agrupa por portfolio + telefone (nunca mistura contatos/clientes)
  const convos = new Map<string, { portfolioId: string; instance: string; phone: string; msgs: Row[]; isSdr: boolean }>();
  for (const r of (rows ?? []) as Row[]) {
    const phone = String(r.contato_telefone ?? "").replace(/\D/g, "");
    if (!phone) continue;
    const key = `${r.portfolio_id}|${phone}`;
    if (!convos.has(key)) {
      convos.set(key, {
        portfolioId: String(r.portfolio_id),
        instance: String(r.instance_name ?? ""),
        phone,
        msgs: [],
        isSdr: false,
      });
    }
    const c = convos.get(key);
    if (!c) continue;
    c.instance = String(r.instance_name ?? c.instance);
    if (r.sdr_lead_id) c.isSdr = true;
    c.msgs.push(r);
  }

  const results: unknown[] = [];

  for (const convo of convos.values()) {
    if (convo.isSdr) continue; // follow-up do SDR é responsabilidade do sdr-worker
    const msgs = convo.msgs;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") continue;

    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) continue; // nunca houve interação real do contato
    // The source is the user cycle, not a follow-up sent by an already running worker.
    if (!await canSendContactFollowup(admin, convo.portfolioId, convo.phone, lastUser.created_at)) continue;

    // estado atual do ciclo
    const { data: state } = await admin
      .from("whatsapp_agent_followups")
      .select("id, followups_sent, last_agent_message_at, last_followup_at")
      .eq("portfolio_id", convo.portfolioId)
      .eq("phone", convo.phone)
      .maybeSingle();

    let sentCount = Number(state?.followups_sent ?? 0);

    // 4) contato respondeu depois do último follow-up -> zera o ciclo
    if (state?.last_followup_at && new Date(lastUser.created_at) > new Date(state.last_followup_at)) {
      await admin.from("whatsapp_agent_followups").update({
        followups_sent: 0,
        last_followup_at: null,
        last_agent_message_at: last.created_at,
      }).eq("id", state.id);
      sentCount = 0;
    }

    if (sentCount >= MAX_FOLLOWUPS) continue; // 3) nunca mais que 2

    const silenceH = hoursSince(last.created_at);
    if (sentCount === 0) {
      if (silenceH < FIRST_DELAY_H) continue;
    } else {
      const ref = state?.last_followup_at ?? last.created_at;
      if (hoursSince(ref) < SECOND_DELAY_H) continue;
    }

    // respeita pausa por atendimento humano
    const { data: paused } = await admin
      .from("whatsapp_paused_contacts")
      .select("paused_until")
      .eq("portfolio_id", convo.portfolioId)
      .eq("phone", convo.phone)
      .maybeSingle();
    if (paused?.paused_until && new Date(paused.paused_until) > new Date()) continue;

    // instância conectada do portfólio
    const { data: conn } = await admin
      .from("whatsapp_connections")
      .select("instance_name, status")
      .eq("portfolio_id", convo.portfolioId)
      .maybeSingle();
    const instance = conn?.instance_name ?? convo.instance;
    if (!instance) continue;

    // 5) reserva o envio ANTES de mandar (à prova de duplicidade)
    const attempt = sentCount + 1;
    const nowIso = new Date().toISOString();
    if (state?.id) {
      const { data: claimed } = await admin
        .from("whatsapp_agent_followups")
        .update({ followups_sent: attempt, last_followup_at: nowIso, last_agent_message_at: last.created_at })
        .eq("id", state.id)
        .eq("followups_sent", sentCount)
        .select("id")
        .maybeSingle();
      if (!claimed) continue; // outra execução já pegou
    } else {
      const { error: insErr } = await admin.from("whatsapp_agent_followups").insert({
        portfolio_id: convo.portfolioId,
        phone: convo.phone,
        followups_sent: attempt,
        last_followup_at: nowIso,
        last_agent_message_at: last.created_at,
      });
      if (insErr) continue; // conflito na unique = outra execução já enviou
    }

    const agent = agentByPortfolio.get(convo.portfolioId);
    const nomeRow = await admin
      .from("whatsapp_contact_names")
      .select("name")
      .eq("portfolio_id", convo.portfolioId)
      .eq("phone", convo.phone)
      .maybeSingle();
    const nomeRaw = String(nomeRow.data?.name ?? "").trim();
    const nome = nomeRaw && !/^n[aã]o informado$/i.test(nomeRaw) ? nomeRaw.split(/\s+/)[0] : null;

    const history = msgs
      .slice(-20)
      .map((m) => `${m.role === "assistant" ? "ATENDENTE" : "CLIENTE"}: ${m.mensagem}`)
      .join("\n");

    let text: string;
    try {
      text = await generateFollowup(history, nome, attempt, agent?.nome_atendente ?? null, agent?.tom_de_voz ?? null);
    } catch (e) {
      // não conseguiu gerar: libera a tentativa para a próxima rodada (nada solto/genérico é enviado)
      await admin.from("whatsapp_agent_followups").update({
        followups_sent: sentCount,
        last_followup_at: state?.last_followup_at ?? null,
      }).eq("portfolio_id", convo.portfolioId).eq("phone", convo.phone);
      console.error("[AGENT-FOLLOWUP] ai fail", convo.phone, (e as Error).message);
      continue;
    }

    try {
      if (!await canSendContactFollowup(admin, convo.portfolioId, convo.phone, lastUser.created_at)) continue;
      const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: convo.phone, text, delay: 1200, linkPreview: false }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`evo_${r.status}: ${JSON.stringify(body).slice(0, 200)}`);

      const ids = [body?.key?.id, body?.message?.key?.id, body?.data?.key?.id]
        .filter((v) => typeof v === "string" && v);
      if (ids.length) {
        await admin.from("whatsapp_sent_messages_log").upsert(
          ids.map((id: string) => ({
            portfolio_id: convo.portfolioId,
            instance_name: instance,
            phone: convo.phone,
            message_id: id,
          })),
          { onConflict: "message_id", ignoreDuplicates: true },
        );
      }

      await admin.from("whatsapp_conversas").insert({
        portfolio_id: convo.portfolioId,
        instance_name: instance,
        contato_telefone: convo.phone,
        contato_nome: last.contato_nome ?? (nomeRaw || null),
        role: "assistant",
        mensagem: text,
      });

      results.push({ phone: convo.phone, portfolioId: convo.portfolioId, attempt, silenceH: Math.round(silenceH) });
      console.log("[AGENT-FOLLOWUP] sent", JSON.stringify({ phone: convo.phone, attempt, instance }));
    } catch (e) {
      // falha de envio: devolve o contador para tentar novamente na próxima rodada
      await admin.from("whatsapp_agent_followups").update({
        followups_sent: sentCount,
        last_followup_at: state?.last_followup_at ?? null,
      }).eq("portfolio_id", convo.portfolioId).eq("phone", convo.phone);
      console.error("[AGENT-FOLLOWUP] send fail", convo.phone, (e as Error).message);
    }
  }

  return { portfolios: agentByPortfolio.size, checked: convos.size, sent: results.length, scheduled, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const out = await run();
    console.log("[AGENT-FOLLOWUP] done", JSON.stringify(out));
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[AGENT-FOLLOWUP] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
