// Provisiona/atualiza um workflow n8n por agente WhatsApp.
// Fluxo: Evolution → Webhook n8n → Code (filtra) → HTTP Lovable AI → HTTP Evolution sendText.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") || "").replace(/\/+$/, "");
const N8N_API_KEY = Deno.env.get("N8N_API_KEY")!;
const EVOLUTION_N8N_CREDENTIAL_ID = Deno.env.get("EVOLUTION_N8N_CREDENTIAL_ID") || "";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function n8n(path: string, init: RequestInit = {}) {
  const r = await fetch(`${N8N_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep */ }
  return { ok: r.ok, status: r.status, body };
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
  const faqText = faqs.map((f: any, i: number) => `${i + 1}. P: ${f.pergunta}\n   R: ${f.resposta}`).join("\n");

  const dias = Array.isArray(agent.dias_semana) ? agent.dias_semana.join(", ") : "";
  const horario = agent.horario_inicio && agent.horario_fim
    ? `Horário de atendimento: ${agent.horario_inicio} às ${agent.horario_fim} (${dias}).`
    : "";

  return [
    `Você é ${agent.nome_atendente || "o(a) atendente"}, atendente via WhatsApp.`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `Instruções: ${agent.instrucoes_base}` : "",
    horario,
    agent.mensagem_boas_vindas ? `Mensagem de boas-vindas padrão: ${agent.mensagem_boas_vindas}` : "",
    agent.fora_horario_msg ? `Se estiver fora do horário, responda: ${agent.fora_horario_msg}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    "\nResponda de forma curta, objetiva e em português brasileiro, como em uma conversa real de WhatsApp. Nunca cite que é uma IA.",
  ].filter(Boolean).join("\n");
}

function modelFor(agent: any): string {
  return agent.modelo_ia === "openai" ? "openai/gpt-5-mini" : "google/gemini-2.5-flash";
}

function buildWorkflow(opts: {
  name: string;
  webhookPath: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  evoUrl: string;
}) {
  const { name, webhookPath, systemPrompt, model, temperature, maxTokens, evoUrl } = opts;

  const filterCode = `
const raw = $input.first().json;
const body = raw.body || raw;
const event = body.event || '';
if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return [];
const data = body.data || {};
const key = data.key || {};
if (key.fromMe) return [];
const jid = key.remoteJid || '';
if (!jid || jid.endsWith('@g.us') || jid.includes('@broadcast')) return [];
const text = data.message?.conversation
  || data.message?.extendedTextMessage?.text
  || data.message?.imageMessage?.caption
  || '';
if (!text || !text.trim()) return [];
const phone = jid.split('@')[0];
const instance = body.instance || body.instanceName || raw.instance || '';
return [{ json: { phone, jid, text: text.trim(), instance, pushName: data.pushName || '' } }];
`.trim();

  const evoCred = EVOLUTION_N8N_CREDENTIAL_ID
    ? {
        credentials: {
          httpHeaderAuth: { id: EVOLUTION_N8N_CREDENTIAL_ID, name: "Evolution API" },
        },
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
      }
    : {
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "apikey", value: EVO_KEY }] },
      };

  const nodes: any[] = [
    {
      parameters: {
        httpMethod: "POST",
        path: webhookPath,
        responseMode: "onReceived",
        options: {},
      },
      id: "node-webhook",
      name: "Evolution Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [240, 300],
      webhookId: webhookPath,
    },
    {
      parameters: { jsCode: filterCode },
      id: "node-filter",
      name: "Filtrar mensagem",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        method: "POST",
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: `Bearer ${LOVABLE_API_KEY}` },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  model: "${model}",
  temperature: ${temperature},
  max_tokens: ${maxTokens},
  messages: [
    { role: "system", content: ${JSON.stringify(systemPrompt)} },
    { role: "user", content: $json.text }
  ]
}) }}`,
        options: { response: { response: { responseFormat: "json" } } },
      },
      id: "node-ai",
      name: "Lovable AI",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [720, 300],
    },
    {
      parameters: {
        method: "POST",
        url: `=${evoUrl}/message/sendText/{{ $('Filtrar mensagem').item.json.instance }}`,
        ...evoCred,
        sendHeaders: !EVOLUTION_N8N_CREDENTIAL_ID,
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  number: $('Filtrar mensagem').item.json.phone,
  text: ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || 'Desculpe, não consegui responder agora.'
}) }}`,
        options: {},
      },
      id: "node-send",
      name: "Evolution sendText",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, 300],
    },
  ];

  const connections = {
    "Evolution Webhook": { main: [[{ node: "Filtrar mensagem", type: "main", index: 0 }]] },
    "Filtrar mensagem": { main: [[{ node: "Lovable AI", type: "main", index: 0 }]] },
    "Lovable AI": { main: [[{ node: "Evolution sendText", type: "main", index: 0 }]] },
  };

  return {
    name,
    nodes,
    connections,
    settings: { executionOrder: "v1" },
  };
}

async function ensureEvolutionWebhook(instanceName: string, webhookUrl: string) {
  const r = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhook_by_events: false,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhook_by_events: false,
      base64: false,
      byEvents: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    }),
  });
  const text = await r.text();
  console.log("evo webhook->n8n", r.status, text.slice(0, 200));
  return { ok: r.ok, status: r.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!N8N_BASE_URL || !N8N_API_KEY) return json({ error: "N8N_BASE_URL/N8N_API_KEY ausente" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { portfolioId } = await req.json();
    if (!portfolioId) return json({ error: "portfolioId obrigatório" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: hasAccess } = await admin.rpc("has_portfolio_access", {
      _user_id: user.id, _portfolio_id: portfolioId,
    });
    if (!hasAccess) return json({ error: "Sem acesso" }, 403);

    const { data: agent, error: agErr } = await admin
      .from("whatsapp_agents").select("*").eq("portfolio_id", portfolioId).maybeSingle();
    if (agErr || !agent) return json({ error: "Agente não encontrado" }, 404);

    const { data: conn } = await admin
      .from("whatsapp_connections").select("*").eq("portfolio_id", portfolioId).maybeSingle();
    const instanceName = conn?.instance_name || agent.instancia_id;
    if (!instanceName) return json({ error: "Sem instância conectada" }, 409);

    const webhookPath = agent.n8n_webhook_path || `wa-${portfolioId}`;
    const workflowName = `WhatsApp Agent — ${agent.nome_atendente || agent.nome || portfolioId.slice(0, 8)}`;

    const wf = buildWorkflow({
      name: workflowName,
      webhookPath,
      systemPrompt: buildSystemPrompt(agent),
      model: modelFor(agent),
      temperature: Number(agent.temperatura ?? 0.7),
      maxTokens: Number(agent.max_tokens ?? 500),
      evoUrl: EVO_URL,
    });

    let workflowId = agent.n8n_workflow_id as string | null;
    let exists = false;
    if (workflowId) {
      const check = await n8n(`/api/v1/workflows/${workflowId}`);
      exists = check.ok;
      if (!exists) workflowId = null;
    }

    if (workflowId) {
      const upd = await n8n(`/api/v1/workflows/${workflowId}`, {
        method: "PUT",
        body: JSON.stringify(wf),
      });
      if (!upd.ok) {
        console.error("n8n update failed", upd.status, JSON.stringify(upd.body).slice(0, 500));
        return json({ error: "Falha ao atualizar workflow n8n", detail: upd.body }, 502);
      }
    } else {
      const create = await n8n(`/api/v1/workflows`, {
        method: "POST",
        body: JSON.stringify(wf),
      });
      if (!create.ok) {
        console.error("n8n create failed", create.status, JSON.stringify(create.body).slice(0, 500));
        return json({ error: "Falha ao criar workflow n8n", detail: create.body }, 502);
      }
      workflowId = create.body?.id || create.body?.data?.id;
      if (!workflowId) return json({ error: "Workflow criado sem id", detail: create.body }, 502);
    }

    // Ativa
    const activate = await n8n(`/api/v1/workflows/${workflowId}/activate`, { method: "POST" });
    if (!activate.ok) {
      console.warn("n8n activate failed", activate.status, JSON.stringify(activate.body).slice(0, 300));
    }

    // Aponta Evolution para o webhook do n8n (URL de produção)
    const webhookUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`;
    const wh = await ensureEvolutionWebhook(instanceName, webhookUrl);

    await admin.from("whatsapp_agents").update({
      n8n_workflow_id: workflowId,
      n8n_webhook_path: webhookPath,
    }).eq("id", agent.id);

    return json({
      ok: true,
      workflowId,
      webhookPath,
      webhookUrl,
      activated: activate.ok,
      evolutionWebhook: wh,
    });
  } catch (e) {
    console.error("whatsapp-n8n-sync error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
