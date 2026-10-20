// Cron (a cada 15 min): detecta conversas com intenção real de agendamento que
// esfriaram (última mensagem foi da IA, >45 min sem resposta do cliente) e
// dispara um relatório "POSSÍVEL AGENDAMENTO — SEM RESPOSTA" para o dono.
import { createClient } from "npm:@supabase/supabase-js@2";

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

const SILENCE_MIN = 45;          // mínimo de silêncio do cliente
const MAX_AGE_HOURS = 12;        // não olha conversas antigas demais
const FOLLOWUP_TRIGGER = "followup_silence";
const LEAD_TRIGGERS = ["meeting_confirmed", "human_requested"];

type Msg = { role: string; mensagem: string; created_at: string; contato_nome: string | null };

async function aiClassifyBool(prompt: string): Promise<boolean> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        messages: [
          { role: "system", content: "Você é um classificador. Responda SOMENTE com true ou false." },
          { role: "user", content: prompt },
        ],
// temperature omitida: gpt-6-astra aceita apenas o valor padrão
        max_tokens: 5,
      }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    return /\btrue\b/.test(String(j.choices?.[0]?.message?.content ?? "").toLowerCase());
  } catch {
    return false;
  }
}

async function aiExtractShort(prompt: string): Promise<string> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        messages: [
          { role: "system", content: "Responda apenas com a frase pedida, sem explicações e sem aspas." },
          { role: "user", content: prompt },
        ],
// temperature omitida: gpt-6-astra aceita apenas o valor padrão
        max_tokens: 60,
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    const s = String(j.choices?.[0]?.message?.content ?? "").trim().replace(/^["'`]+|["'`]+$/g, "");
    return s.slice(0, 140);
  } catch {
    return "";
  }
}

function fmt(dateIso: string): string {
  return new Date(dateIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).replace(",", " às");
}

async function run() {
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("whatsapp_conversas")
    .select("portfolio_id, instance_name, contato_telefone, contato_nome, role, mensagem, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(4000);
  if (error) throw new Error(error.message);

  const convos = new Map<string, { portfolioId: string; instance: string; phone: string; msgs: Msg[] }>();
  for (const r of rows ?? []) {
    const key = `${r.portfolio_id}|${r.contato_telefone}`;
    if (!convos.has(key)) {
      convos.set(key, {
        portfolioId: r.portfolio_id as string,
        instance: r.instance_name as string,
        phone: String(r.contato_telefone),
        msgs: [],
      });
    }
    convos.get(key)!.msgs.push(r as unknown as Msg);
  }

  const results: unknown[] = [];
  const now = Date.now();

  for (const convo of convos.values()) {
    const msgs = convo.msgs;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") continue;

    const silenceMin = (now - new Date(last.created_at).getTime()) / 60000;
    if (silenceMin < SILENCE_MIN) continue;

    // 1) nome capturado
    const { data: nameRow } = await admin
      .from("whatsapp_contact_names")
      .select("name")
      .eq("portfolio_id", convo.portfolioId)
      .eq("phone", convo.phone)
      .maybeSingle();
    const nome = String(nameRow?.name ?? "").trim();
    if (!nome || /^n[aã]o informado$/i.test(nome)) continue;

    // 2) já existe relatório de lead / follow-up para essa conversa?
    const { data: dedupe } = await admin
      .from("whatsapp_report_dedupe")
      .select("trigger_type")
      .eq("portfolio_id", convo.portfolioId)
      .eq("phone", convo.phone);
    const triggers = (dedupe ?? []).map((d) => String(d.trigger_type));
    if (triggers.some((t) => LEAD_TRIGGERS.includes(t))) continue;
    if (triggers.includes(FOLLOWUP_TRIGGER)) continue;

    // 3) destinos configurados
    const { data: agentRow } = await admin
      .from("whatsapp_agents")
      .select("report_group_id, report_number, status")
      .eq("portfolio_id", convo.portfolioId)
      .maybeSingle();
    const destinations: string[] = [];
    if (agentRow?.report_group_id) destinations.push(String(agentRow.report_group_id));
    if (agentRow?.report_number) destinations.push(String(agentRow.report_number).replace(/\D/g, ""));
    if (destinations.length === 0) continue;

    const hist = msgs
      .slice(-14)
      .map((m) => `${m.role === "assistant" ? "IA" : "CLIENTE"}: ${m.mensagem}`)
      .join("\n");

    // 4) intenção real de agendamento/atendimento
    const temIntencao = await aiClassifyBool(
      `A conversa abaixo (clínica odontológica) mostra que o cliente tem intenção real de agendar/ser atendido (marcar consulta, avaliação, dor, urgência, orçamento de tratamento)?\n\n${hist}\n\nResponda apenas: true ou false`,
    );
    if (!temIntencao) continue;

    const motivo = (await aiExtractShort(
      `Em no máximo 12 palavras, diga o que a pessoa buscava nesta conversa (mesmo que incompleto):\n\n${hist}`,
    )) || "Motivo não identificado";

    const unidade = (() => {
      const falas = msgs.filter((m) => m.role === "user").map((m) => m.mensagem);
      for (let i = falas.length - 1; i >= 0; i--) {
        if (/duartina/i.test(String(falas[i]))) return "Duartina";
        if (/bauru/i.test(String(falas[i]))) return "Bauru";
      }
      return "Não informado";
    })();

    const lastUser = [...msgs].reverse().find((m) => m.role === "user");

    const text = [
      `⏳ *POSSÍVEL AGENDAMENTO — SEM RESPOSTA*`,
      ``,
      `👤 Nome: ${nome}`,
      `📍 Unidade: ${unidade}`,
      `📱 WhatsApp: +${convo.phone} — https://wa.me/${convo.phone}`,
      `📋 Motivo: ${motivo}`,
      `🕐 Última mensagem do cliente: ${lastUser ? fmt(lastUser.created_at) : "—"}`,
      `💡 Cliente demonstrou interesse mas parou de responder. Pode valer a pena entrar em contato.`,
    ].join("\n");

    await admin.from("whatsapp_report_dedupe").upsert({
      portfolio_id: convo.portfolioId,
      phone: convo.phone,
      trigger_type: FOLLOWUP_TRIGGER,
      last_sent_at: new Date().toISOString(),
    }, { onConflict: "portfolio_id,phone,trigger_type" });

    for (const dest of destinations) {
      try {
        const r = await fetch(`${EVO_URL}/message/sendText/${convo.instance}`, {
          method: "POST",
          headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ number: dest, text }),
        });
        const body = await r.json().catch(() => null);
        const ids = [body?.key?.id, body?.message?.key?.id, body?.data?.key?.id]
          .filter((v) => typeof v === "string" && v);
        if (r.ok && ids.length) {
          await admin.from("whatsapp_sent_messages_log").upsert(
            ids.map((id: string) => ({
              portfolio_id: convo.portfolioId,
              instance_name: convo.instance,
              phone: dest,
              message_id: id,
            })),
            { onConflict: "message_id", ignoreDuplicates: true },
          );
        }
        console.log("[FOLLOWUP] send", { dest, status: r.status, phone: convo.phone });
      } catch (e) {
        console.error("[FOLLOWUP] send fail", dest, (e as Error).message);
      }
    }

    results.push({ phone: convo.phone, nome, unidade, motivo, silenceMin: Math.round(silenceMin) });
  }

  return { checked: convos.size, sent: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const out = await run();
    console.log("[FOLLOWUP] done", JSON.stringify(out));
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[FOLLOWUP] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
