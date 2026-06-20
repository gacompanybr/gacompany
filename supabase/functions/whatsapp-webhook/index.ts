// Recebe webhook MESSAGES_UPSERT da Evolution e auto-responde via agente IA
// Apenas conversas 1-a-1 (ignora grupos). Mantém histórico em whatsapp_conversas.
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

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeInstance(payload: any, msg: any): string {
  const raw = payload.instance ?? payload.instanceName ?? payload.data?.instance ?? msg.instance ?? msg.instanceName ?? "";
  if (typeof raw === "string") return raw;
  return raw?.instanceName ?? raw?.name ?? "";
}

function getRemoteJid(msg: any): string {
  return asText(msg.key?.remoteJid) || asText(msg.remoteJid) || asText(msg.chatId) || asText(msg.from) || asText(msg.sender);
}

function getSendTargets(msg: any, remoteJid: string): string[] {
  const key = msg.key ?? {};
  const lidTargets = [
    asText(key.previousRemoteJid),
    asText(msg.previousRemoteJid),
    asText(msg.data?.key?.previousRemoteJid),
    asText(key.remoteJid).includes("@lid") ? asText(key.remoteJid) : "",
    remoteJid.includes("@lid") ? remoteJid : "",
  ].filter((value) => value.includes("@lid"));
  const jidTargets = [
    asText(key.senderPn),
    asText(key.participantPn),
    asText(key.remoteJidAlt),
    asText(msg.remoteJidAlt),
    asText(msg.data?.key?.senderPn),
    asText(msg.data?.key?.remoteJidAlt),
    !remoteJid.includes("@lid") ? remoteJid : "",
  ].filter(Boolean);
  const phoneTargets = jidTargets
    .filter((value) => value.includes("@s.whatsapp.net"))
    .map((value) => value.split("@")[0]);
  const candidates = [
    ...phoneTargets,
    ...lidTargets,
    ...jidTargets,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function getContactPhone(msg: any, remoteJid: string): string {
  const key = msg.key ?? {};
  const candidates = [asText(key.senderPn), asText(key.remoteJidAlt), asText(msg.remoteJidAlt), remoteJid]
    .filter((value) => value && !value.includes("@lid"));
  return (candidates[0] ?? remoteJid).split("@")[0];
}

function getMessageText(msg: any): string {
  return (
    asText(msg.message?.conversation) ||
    asText(msg.message?.extendedTextMessage?.text) ||
    asText(msg.message?.imageMessage?.caption) ||
    asText(msg.message?.videoMessage?.caption) ||
    asText(msg.message?.documentMessage?.caption) ||
    asText(msg.text) ||
    asText(msg.body) ||
    asText(msg.message?.text)
  ).trim();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildSystemPrompt(agent: any): string {
  const tomMap: Record<string, string> = {
    profissional: "Profissional",
    amigavel: "Amigável",
    formal: "Formal",
    descontraido: "Descontraído",
  };
  const tom = tomMap[agent.tom_de_voz] ?? "Profissional";
  const faqs = Array.isArray(agent.faqs) ? agent.faqs : [];
  const faqText = faqs
    .map((f: any, i: number) => `${i + 1}. P: ${f.pergunta}\n   R: ${f.resposta}`)
    .join("\n");
  return [
    `Você é ${agent.nome_atendente}, atendente via WhatsApp.`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `INSTRUÇÕES OBRIGATÓRIAS (siga fielmente):\n${agent.instrucoes_base}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    "\nMEMÓRIA: As mensagens anteriores desta conversa (últimas 24h) estão no histórico abaixo. SEMPRE leia e use esse histórico para lembrar o que o cliente já disse — nome, pedidos, dúvidas, contexto. Se a pessoa perguntar 'lembra do que eu te falei?', responda baseado no que está no histórico.",
    "Responda de forma curta, objetiva e em português brasileiro, como em uma conversa real de WhatsApp. Nunca diga que é uma IA.",
  ].filter(Boolean).join("\n");
}


function dentroDoHorario(agent: any): boolean {
  try {
    const dias = Array.isArray(agent.dias_semana) ? agent.dias_semana : [];
    const map = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaHoje = map[now.getDay()];
    if (dias.length && !dias.includes(diaHoje)) return false;
    if (!agent.horario_inicio || !agent.horario_fim) return true;
    const [hi, mi] = agent.horario_inicio.split(":").map(Number);
    const [hf, mf] = agent.horario_fim.split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= hi * 60 + mi && nowMin <= hf * 60 + mf;
  } catch {
    return true;
  }
}

function splitMessage(text: string): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  // Separador explícito do modelo
  if (raw.includes("|||")) {
    return raw.split("|||").map((s) => s.trim()).filter(Boolean);
  }
  // Quebra por parágrafo duplo
  const byParagraph = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (byParagraph.length > 1) return byParagraph;
  // Curta o suficiente — manda em uma única mensagem
  const lineCount = raw.split(/\n/).length;
  if (raw.length <= 250 && lineCount <= 3) return [raw];
  // Quebra por fim de frase
  const sentences = raw.match(/[^.!?\n]+[.!?\n]+/g) ?? [raw];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > 200 && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

async function sendOnce(instance: string, targets: string[], text: string): Promise<boolean> {
  const url = `${EVO_URL}/message/sendText/${instance}`;
  const headers = { apikey: EVO_KEY, "Content-Type": "application/json" };
  for (const [index, target] of targets.entries()) {
    const body = { number: target, text };
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const responseText = await r.text();
    let responseJson: any = null;
    try { responseJson = JSON.parse(responseText); } catch { /* keep text */ }
    const deliveryStatus = String(responseJson?.status ?? responseJson?.message?.status ?? "").toUpperCase();
    console.log("sendText", JSON.stringify({ instance, target, attempt: index + 1, status: r.status, ok: r.ok, deliveryStatus, response: responseText.slice(0, 500) }));
    if (r.ok) return true;
  }
  return false;
}

const SPLIT_DELAY_MS = 8000;

async function sendText(instance: string, targets: string[], text: string): Promise<{ sent: string[]; failed: string[] }> {
  const parts = splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ok = await sendOnce(instance, targets, parts[i]);
    if (ok) sent.push(parts[i]); else failed.push(parts[i]);
    if (i < parts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SPLIT_DELAY_MS));
    }
  }
  return { sent, failed };
}


  return false;
}

async function processPayload(payload: any) {
  const event = payload.event ?? payload.eventName;
  const eventName = String(event ?? "").toLowerCase();
  if (eventName.includes("connection")) return;
  if (eventName.includes("message") && eventName.includes("update")) {
    console.log("messageUpdate", JSON.stringify(payload).slice(0, 1000));
    return;
  }
  if (event && !eventName.includes("messages.upsert") && !eventName.includes("messages_upsert")) return;

  const data = payload.data ?? payload;
  const messages = Array.isArray(data.messages) ? data.messages : [data];

  for (const msg of messages) {
    if (!msg || msg.key?.fromMe || msg.fromMe || msg.messageStubType) continue;

    const instance = normalizeInstance(payload, msg);
    const remoteJid = getRemoteJid(msg);
    if (!remoteJid) continue;

    // Ignorar grupos (terminam em @g.us)
    if (remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) {
      console.log("ignorando grupo/broadcast", remoteJid);
      continue;
    }

    const text = getMessageText(msg);
    if (!text || !text.trim()) continue;

    const phone = getContactPhone(msg, remoteJid);
    const sendTargets = getSendTargets(msg, remoteJid);
    const pushName: string | null = msg.pushName ?? null;
    console.log("messageTargetContext", JSON.stringify({
      instance,
      remoteJid,
      senderPn: asText(msg.key?.senderPn),
      previousRemoteJid: asText(msg.key?.previousRemoteJid),
      remoteJidAlt: asText(msg.key?.remoteJidAlt) || asText(msg.remoteJidAlt),
      sendTargets,
    }));

    // Resolver portfolio_id pela instância
    const { data: conn } = await admin
      .from("whatsapp_connections")
      .select("portfolio_id")
      .eq("instance_name", instance)
      .maybeSingle();

    let portfolioId = conn?.portfolio_id;
    if (!portfolioId) {
      const { data: ag } = await admin
        .from("whatsapp_agents")
        .select("portfolio_id")
        .eq("instancia_id", instance)
        .maybeSingle();
      portfolioId = ag?.portfolio_id;
    }
    if (!portfolioId) {
      console.log("sem portfolio para instancia", instance);
      continue;
    }

    const { data: agent } = await admin
      .from("whatsapp_agents")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (!agent) {
      console.log("sem agent para portfolio", portfolioId);
      continue;
    }

    // Gate manual: só responde se o agente estiver explicitamente ativo
    if (agent.status !== "active") {
      console.log("agente inativo, ignorando mensagem", { portfolioId, status: agent.status });
      // Ainda salva a mensagem do usuário para histórico
      await admin.from("whatsapp_conversas").insert({
        portfolio_id: portfolioId,
        instance_name: instance,
        contato_telefone: phone,
        contato_nome: pushName,
        role: "user",
        mensagem: text,
      });
      continue;
    }

    // Salvar mensagem do usuário
    await admin.from("whatsapp_conversas").insert({
      portfolio_id: portfolioId,
      instance_name: instance,
      contato_telefone: phone,
      contato_nome: pushName,
      role: "user",
      mensagem: text,
    });

    // Fora do horário → mensagem padrão (se houver)
    if (!dentroDoHorario(agent)) {
      if (agent.fora_horario_msg) {
        const { sent, failed } = await sendText(instance, sendTargets, agent.fora_horario_msg);
        const rows = [
          ...sent.map((m) => ({ role: "assistant" as const, mensagem: m })),
          ...failed.map((m) => ({ role: "assistant" as const, mensagem: `[FALHA AO ENVIAR] ${m}` })),
        ];
        if (rows.length) {
          await admin.from("whatsapp_conversas").insert(rows.map((r) => ({
            portfolio_id: portfolioId,
            instance_name: instance,
            contato_telefone: phone,
            contato_nome: pushName,
            role: r.role,
            mensagem: r.mensagem,
          })));
        }
      }
      continue;
    }

    // Memória: últimas 24h da conversa com esse contato (até 60 mensagens)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: history } = await admin
      .from("whatsapp_conversas")
      .select("role, mensagem")
      .eq("portfolio_id", portfolioId)
      .eq("contato_telefone", phone)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(60);

    const recent = (history ?? []).reverse();

    const modelMap: Record<string, string> = {
      gemini: "google/gemini-2.5-flash",
      openai: "openai/gpt-5-mini",
    };
    const model = modelMap[agent.modelo_ia] ?? "google/gemini-2.5-flash";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(agent) },
          ...recent.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.mensagem,
          })),
        ],
        temperature: agent.temperatura ?? 0.7,
        max_tokens: Math.min(Number(agent.max_tokens ?? 400), 600),
      }),
    });

    if (!aiResp.ok) {
      console.error("AI gateway error", aiResp.status, await aiResp.text());
      continue;
    }
    const aiJson = await aiResp.json();
    const reply: string = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) continue;

    const sent = await sendText(instance, sendTargets, reply);
    await admin.from("whatsapp_conversas").insert({
      portfolio_id: portfolioId,
      instance_name: instance,
      contato_telefone: phone,
      contato_nome: pushName,
      role: "assistant",
      mensagem: sent ? reply : `[FALHA AO ENVIAR] ${reply}`,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const event = payload.event ?? payload.eventName;
    const eventName = String(event ?? "").toLowerCase();
    if (eventName.includes("connection")) return json({ ignored: "connection", state: payload.data?.state });
    if (eventName.includes("message") && eventName.includes("update")) {
      EdgeRuntime.waitUntil(processPayload(payload).catch((e) => console.error("whatsapp async error", e)));
      return json({ ok: true, event });
    }
    if (event && !eventName.includes("messages.upsert") && !eventName.includes("messages_upsert")) {
      return json({ ignored: "event", event });
    }

    EdgeRuntime.waitUntil(processPayload(payload).catch((e) => console.error("whatsapp async error", e)));

    return json({ ok: true });
  } catch (e) {
    console.error("whatsapp-webhook error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
