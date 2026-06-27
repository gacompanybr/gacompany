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

  return [
    `Você é ${agent.nome_atendente || "o(a) atendente"}, atendente humano via WhatsApp. NUNCA diga que é IA, bot ou assistente virtual.`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `INSTRUÇÕES OBRIGATÓRIAS (fonte principal de verdade sobre o negócio, serviços e processos — siga fielmente):\n${agent.instrucoes_base}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    `\nCOMO RESPONDER (CRÍTICO):`,
    `- SEMPRE responda a pergunta do usuário de verdade, usando as INSTRUÇÕES OBRIGATÓRIAS e FAQs acima.`,
    `- NUNCA devolva apenas "Olá! Como posso te ajudar hoje?" como resposta. Saudação genérica só na PRIMEIRA mensagem do dia.`,
    `- Se o usuário perguntar sobre um serviço (ex.: tráfego pago), explique o que a empresa faz em 2-4 frases curtas e termine com UMA pergunta de qualificação (ex.: "qual seu segmento?" / "já investe hoje?").`,
    `- Se o usuário disser que veio de um anúncio ou perguntar quem somos, apresente a empresa em 1-2 frases concretas e puxe o próximo passo.`,
    `- Português brasileiro, natural, direto. Máximo 1 emoji por mensagem. Curto: 2-4 linhas.`,
    `- Para enviar duas mensagens em sequência, separe com ||| (três pipes). Máximo 2 partes.`,
    `- Nunca invente preço, prazo ou condição fora das instruções/FAQs — diga que vai confirmar com o time.`,
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
  maxTokens: number;
  temperature: number;
  evoUrl: string;
  dupDispatcherUrl: string;
  dupSecret: string;
}) {
  const { name, webhookPath, systemPrompt, model, temperature, maxTokens, evoUrl, dupDispatcherUrl, dupSecret } = opts;


  const filterCode = `
const raw = $input.first().json;
const body = raw.body || raw;
const eventName = String(body.event || body.eventName || '').toLowerCase();
if (eventName.includes('connection')) return [];
if (eventName.includes('message') && eventName.includes('update')) return [];
if (eventName && !eventName.includes('messages.upsert') && !eventName.includes('messages_upsert')) return [];

const asText = (value) => typeof value === 'string' ? value : '';
const data = body.data || {};
const msg = Array.isArray(data.messages) ? data.messages[0] : data;
const key = msg.key || {};
if (!msg || key.fromMe || msg.fromMe || msg.messageStubType) return [];

const jid = asText(key.remoteJid) || asText(msg.remoteJid) || asText(msg.chatId) || asText(msg.from) || asText(msg.sender);
if (!jid || jid.endsWith('@g.us') || jid.includes('@broadcast')) return [];

const text = (asText(msg.message?.conversation)
  || asText(msg.message?.extendedTextMessage?.text)
  || asText(msg.message?.imageMessage?.caption)
  || asText(msg.message?.videoMessage?.caption)
  || asText(msg.message?.documentMessage?.caption)
  || asText(msg.text)
  || asText(msg.body)
  || asText(msg.message?.text)).trim();
if (!text) return [];

const lidTargets = [
  asText(key.previousRemoteJid),
  asText(msg.previousRemoteJid),
  asText(msg.data?.key?.previousRemoteJid),
  asText(key.remoteJid).includes('@lid') ? asText(key.remoteJid) : '',
  jid.includes('@lid') ? jid : '',
].filter((value) => value.includes('@lid'));
const jidTargets = [
  asText(key.senderPn),
  asText(key.participantPn),
  asText(key.remoteJidAlt),
  asText(msg.remoteJidAlt),
  asText(msg.data?.key?.senderPn),
  asText(msg.data?.key?.remoteJidAlt),
  !jid.includes('@lid') ? jid : '',
].filter(Boolean);
const phoneTargets = jidTargets
  .filter((value) => value.includes('@s.whatsapp.net'))
  .map((value) => value.split('@')[0]);
const numericTargets = jidTargets
  .filter((value) => /^\\d{10,15}$/.test(value));
const sendTargets = Array.from(new Set([...phoneTargets, ...numericTargets, ...lidTargets, ...jidTargets]));
const phone = (phoneTargets[0] || numericTargets[0] || jid).split('@')[0];
const instanceRaw = body.instance || body.instanceName || data.instance || msg.instance || msg.instanceName || raw.instance || '';
const instance = typeof instanceRaw === 'string' ? instanceRaw : (instanceRaw?.instanceName || instanceRaw?.name || '');
return [{ json: { phone, jid, text, instance, pushName: msg.pushName || '', sendTargets } }];
`.trim();

  const prepareSendCode = `
const ai = $input.first().json;
const source = $('Filtrar mensagem').item.json;
const reply = (ai.choices && ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content)
  || 'Desculpe, não consegui responder agora.';
const normalizeTarget = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@s.whatsapp.net')) return trimmed.split('@')[0];
  return trimmed;
};
const targets = Array.isArray(source.sendTargets) && source.sendTargets.length ? source.sendTargets : [source.phone];
return Array.from(new Set(targets.map(normalizeTarget).filter(Boolean))).map((number) => ({
  json: { instance: source.instance, number, text: reply }
}));
`.trim();

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
        authentication: "none",
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
      parameters: { jsCode: prepareSendCode },
      id: "node-prepare-send",
      name: "Preparar envio",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 300],
    },
    {
      parameters: {
        method: "POST",
        authentication: "none",
        url: `=${evoUrl}/chat/whatsappNumbers/{{ encodeURIComponent($json.instance) }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: EVO_KEY },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ numbers: [String($json.number).replace(/\\D/g,'')] }) }}`,
        options: {},
      },
      id: "node-resolve",
      name: "Resolver JID",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1100, 300],
    },
    {
      parameters: {
        jsCode: `
const prev = $('Preparar envio').item.json;
const resp = $input.first().json;
const arr = Array.isArray(resp) ? resp : (resp.body || resp.data || []);
const hit = arr.find((r) => r && (r.exists === true || r.exists === 'true')) || arr[0];
let number = String(prev.number).replace(/\\D/g,'');
if (hit && hit.jid) number = String(hit.jid).split('@')[0];
return [{ json: { instance: prev.instance, number, text: prev.text } }];
`.trim(),
      },
      id: "node-pick-jid",
      name: "Usar JID resolvido",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1260, 300],
    },
    {
      parameters: {
        method: "POST",
        authentication: "none",
        url: `=${evoUrl}/message/sendText/{{ encodeURIComponent($json.instance) }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: EVO_KEY },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ number: $json.number, text: $json.text, delay: 1200, linkPreview: false }) }}`,
        options: {},
      },
      id: "node-send",
      name: "Enviar WhatsApp",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1420, 300],
    },
  ];

  // Nó paralelo: encaminha mensagens de grupo (@g.us) para o dup-dispatcher
  // que decide se aquele grupo é origem de um job DUP ativo e roteia para o
  // workflow DUP correto. Sempre retorna [] (terminal).
  const fanOutCode = `
const raw = $input.first().json;
const body = raw.body || raw;
const eventName = String(body.event || body.eventName || '').toLowerCase();
if (eventName && !eventName.includes('messages.upsert') && !eventName.includes('messages_upsert')) return [];
const data = body.data || {};
const msg = Array.isArray(data.messages) ? data.messages[0] : data;
const key = (msg && msg.key) || {};
const jid = String(key.remoteJid || msg.remoteJid || msg.chatId || '');
if (!jid.endsWith('@g.us')) return [];
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: ${JSON.stringify(dupDispatcherUrl)},
    headers: { 'Content-Type': 'application/json', 'x-dup-secret': ${JSON.stringify(dupSecret)} },
    body: raw, json: true,
  });
} catch (e) { /* swallow — dispatcher loga */ }
return [];
`.trim();

  nodes.push({
    parameters: { jsCode: fanOutCode },
    id: "node-dup-fanout",
    name: "Fan-out DUP",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [480, 520],
  });

  const connections = {
    "Evolution Webhook": { main: [[
      { node: "Filtrar mensagem", type: "main", index: 0 },
      { node: "Fan-out DUP", type: "main", index: 0 },
    ]] },
    "Filtrar mensagem": { main: [[{ node: "Lovable AI", type: "main", index: 0 }]] },
    "Lovable AI": { main: [[{ node: "Preparar envio", type: "main", index: 0 }]] },
    "Preparar envio": { main: [[{ node: "Resolver JID", type: "main", index: 0 }]] },
    "Resolver JID": { main: [[{ node: "Usar JID resolvido", type: "main", index: 0 }]] },
    "Usar JID resolvido": { main: [[{ node: "Enviar WhatsApp", type: "main", index: 0 }]] },
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

    const dupDispatcherUrl = `${SUPABASE_URL}/functions/v1/dup-dispatcher`;
    const dupSecret = Deno.env.get("SCRAPPER_API_SECRET") ?? "";
    const wf = buildWorkflow({
      name: workflowName,
      webhookPath,
      systemPrompt: buildSystemPrompt(agent),
      model: modelFor(agent),
      temperature: Number(agent.temperatura ?? 0.7),
      maxTokens: Number(agent.max_tokens ?? 500),
      evoUrl: EVO_URL,
      dupDispatcherUrl,
      dupSecret,
    });


    let workflowId = agent.n8n_workflow_id as string | null;
    let exists = false;
    if (workflowId) {
      const check = await n8n(`/workflows/${workflowId}`);
      exists = check.ok;
      if (!exists) workflowId = null;
    }

    if (workflowId) {
      const upd = await n8n(`/workflows/${workflowId}`, {
        method: "PUT",
        body: JSON.stringify(wf),
      });
      if (!upd.ok) {
        console.error("n8n update failed", upd.status, JSON.stringify(upd.body).slice(0, 500));
        return json({ error: "Falha ao atualizar workflow n8n", detail: upd.body }, 502);
      }
    } else {
      const create = await n8n(`/workflows`, {
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

    // Ativa ou desativa conforme o status do agente (controle manual da IA)
    const shouldBeActive = agent.status === "active";
    const activate = await n8n(
      `/workflows/${workflowId}/${shouldBeActive ? "activate" : "deactivate"}`,
      { method: "POST" },
    );
    if (!activate.ok) {
      console.warn("n8n activate/deactivate failed", activate.status, JSON.stringify(activate.body).slice(0, 300));
    }

    // Aponta Evolution para o webhook do n8n (URL de produção)
    const N8N_HOST = N8N_BASE_URL.replace(/\/api\/v\d+$/, "");
    const webhookUrl = `${N8N_HOST}/webhook/${webhookPath}`;
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
