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
    agent.instrucoes_base ? `Instruções: ${agent.instrucoes_base}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    "\nResponda de forma curta, objetiva e em português brasileiro, como em uma conversa real de WhatsApp.",
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

async function sendText(instance: string, to: string, text: string) {
  const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: to, text }),
  });
  if (!r.ok) console.error("sendText failed", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const event = payload.event ?? payload.eventName;
    if (event && !String(event).toLowerCase().includes("messages.upsert") && !String(event).toLowerCase().includes("messages_upsert")) {
      return json({ ignored: "event", event });
    }

    const instance = payload.instance ?? payload.instanceName ?? payload.data?.instance;
    const data = payload.data ?? payload;
    const messages = Array.isArray(data.messages) ? data.messages : [data];

    for (const msg of messages) {
      if (!msg || msg.key?.fromMe) continue;

      const remoteJid: string = msg.key?.remoteJid ?? "";
      if (!remoteJid) continue;

      // Ignorar grupos (terminam em @g.us)
      if (remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) {
        console.log("ignorando grupo/broadcast", remoteJid);
        continue;
      }

      const text: string =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        msg.message?.imageMessage?.caption ??
        msg.message?.videoMessage?.caption ??
        "";
      if (!text || !text.trim()) continue;

      const phone = remoteJid.split("@")[0];
      const pushName: string | null = msg.pushName ?? null;

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
          await sendText(instance, phone, agent.fora_horario_msg);
          await admin.from("whatsapp_conversas").insert({
            portfolio_id: portfolioId,
            instance_name: instance,
            contato_telefone: phone,
            contato_nome: pushName,
            role: "assistant",
            mensagem: agent.fora_horario_msg,
          });
        }
        continue;
      }

      // Carregar últimas 20 mensagens (memória)
      const { data: history } = await admin
        .from("whatsapp_conversas")
        .select("role, mensagem")
        .eq("portfolio_id", portfolioId)
        .eq("contato_telefone", phone)
        .order("created_at", { ascending: false })
        .limit(20);

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
          max_tokens: agent.max_tokens ?? 500,
        }),
      });

      if (!aiResp.ok) {
        console.error("AI gateway error", aiResp.status, await aiResp.text());
        continue;
      }
      const aiJson = await aiResp.json();
      const reply: string = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
      if (!reply) continue;

      await sendText(instance, phone, reply);
      await admin.from("whatsapp_conversas").insert({
        portfolio_id: portfolioId,
        instance_name: instance,
        contato_telefone: phone,
        contato_nome: pushName,
        role: "assistant",
        mensagem: reply,
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error("whatsapp-webhook error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
