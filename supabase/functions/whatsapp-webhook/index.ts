// Recebe webhook MESSAGES_UPSERT da Evolution e auto-responde via agente IA
// 1-a-1: aciona o agente. Grupos: ignorados, exceto quando o grupo é origem
// de um job DUP (espelhamento de ofertas para a data table do n8n).
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAffiliateLink, isMercadoLivreUrl, parseOfferMessage } from "../_shared/ml-affiliate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const N8N_BASE = (Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/+$/, "");
const N8N_KEY = Deno.env.get("N8N_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function dupWebhookPath(jobId: string): string {
  return `dup-${String(jobId).slice(0, 8)}`;
}

async function forwardDupToN8n(payload: any, remoteJid: string) {
  const { data: job, error } = await admin
    .from("scrapper_jobs")
    .select("id, n8n_workflow_id, status")
    .eq("status", "ativo")
    .eq("plataforma", "dup")
    .eq("grupo_origem_jid", remoteJid)
    .maybeSingle();

  if (error) {
    console.error("[DUP] lookup fail", error.message);
    return { ok: false, skipped: "db error", error: error.message };
  }
  if (!job) return { ok: true, skipped: "no matching DUP job" };
  if (!N8N_BASE) return { ok: false, skipped: "N8N_BASE_URL missing", jobId: job.id };

  const n8nHost = N8N_BASE.replace(/\/api\/v\d+$/, "");
  const url = `${n8nHost}/webhook/${dupWebhookPath(job.id)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text().catch(() => "");
  console.log("[DUP] forwarded to n8n", JSON.stringify({ jobId: job.id, workflowId: job.n8n_workflow_id, status: r.status, ok: r.ok, preview: text.slice(0, 200) }));
  return { ok: r.ok, jobId: job.id, status: r.status, preview: text.slice(0, 200) };
}

// ============================================================================
// DUP — Espelhamento de grupos de origem
// ============================================================================
type DupJob = {
  id: string;
  config: any;
  n8n_datatable_id: string | null;
  data_table_name: string | null;
};

const DUP_CACHE_TTL_MS = 60_000;
const dupCache = new Map<string, { value: DupJob | null; expiresAt: number }>();

async function lookupDupJob(remoteJid: string): Promise<DupJob | null> {
  const now = Date.now();
  const cached = dupCache.get(remoteJid);
  if (cached && cached.expiresAt > now) return cached.value;
  const { data } = await admin
    .from("scrapper_jobs")
    .select("id, config, n8n_datatable_id, data_table_name")
    .eq("status", "ativo")
    .eq("plataforma", "dup")
    .eq("grupo_origem_jid", remoteJid)
    .maybeSingle();
  const value = (data ?? null) as DupJob | null;
  dupCache.set(remoteJid, { value, expiresAt: now + DUP_CACHE_TTL_MS });
  return value;
}

function extractMessageImageUrl(msg: any): string | null {
  // Não baixamos a imagem (precisaria descriptografar Whisper). Só repassa URL
  // pública/jpegThumbnail se estiver presente.
  const img = msg?.message?.imageMessage;
  if (!img) return null;
  const url = img.url || img.directPath || null;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

async function findDataTableIdByName(name: string): Promise<string | null> {
  if (!N8N_BASE || !N8N_KEY || !name) return null;
  const paths = ["/data-tables", "/data-tables?includeProject=true"];
  try {
    const projsRes = await fetch(`${N8N_BASE}/projects`, { headers: { "X-N8N-API-KEY": N8N_KEY } });
    if (projsRes.ok) {
      const projs = await projsRes.json();
      const list = (projs?.data || projs) || [];
      for (const p of list) if (p?.id) paths.push(`/projects/${p.id}/data-tables`);
    }
  } catch { /* ignore */ }
  for (const path of paths) {
    try {
      const r = await fetch(`${N8N_BASE}${path}`, { headers: { "X-N8N-API-KEY": N8N_KEY } });
      if (!r.ok) continue;
      const body = await r.json();
      const arr = (body?.data || body) || [];
      const found = (Array.isArray(arr) ? arr : []).find((t: any) => String(t?.name || "").trim() === name);
      if (found?.id) return String(found.id);
    } catch { /* ignore */ }
  }
  return null;
}

async function insertN8nRow(tableId: string, row: Record<string, unknown>): Promise<boolean> {
  if (!N8N_BASE || !N8N_KEY) return false;
  try {
    const r = await fetch(`${N8N_BASE}/data-tables/${tableId}/rows`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ data: [row] }),
    });
    if (!r.ok) {
      console.log("[DUP] insertN8nRow fail", r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.log("[DUP] insertN8nRow throw", e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function processDupMessage(msg: any, remoteJid: string, job: DupJob) {
  const text =
    (typeof msg?.message?.conversation === "string" ? msg.message.conversation : "") ||
    (typeof msg?.message?.extendedTextMessage?.text === "string" ? msg.message.extendedTextMessage.text : "") ||
    (typeof msg?.message?.imageMessage?.caption === "string" ? msg.message.imageMessage.caption : "") ||
    (typeof msg?.message?.videoMessage?.caption === "string" ? msg.message.videoMessage.caption : "") ||
    "";
  const parsed = parseOfferMessage(text);
  if (!parsed) {
    console.log("[DUP] parse fail", { jid: remoteJid, jobId: job.id, preview: String(text).slice(0, 120) });
    return;
  }

  // Resolver tableId (cache via n8n_datatable_id se já gravado, senão lookup por nome)
  let tableId = job.n8n_datatable_id ?? null;
  if (!tableId && job.data_table_name) {
    tableId = await findDataTableIdByName(job.data_table_name);
    if (tableId) {
      await admin.from("scrapper_jobs").update({ n8n_datatable_id: tableId }).eq("id", job.id);
    }
  }
  if (!tableId) {
    console.log("[DUP] sem data table id/name", { jobId: job.id });
    return;
  }

  // Gera link de afiliado se for ML
  let finalLink = parsed.offerlink;
  if (isMercadoLivreUrl(parsed.offerlink)) {
    const creds = {
      cookie: String(job.config?.ml_cookie ?? "").trim(),
      csrf: String(job.config?.ml_csrf_token ?? "").trim(),
      affiliateId: String(job.config?.ml_affiliate_id ?? job.config?.ml_affiliate_tag ?? "").trim(),
    };
    const aff = await generateAffiliateLink(parsed.offerlink, creds);
    if (aff.ok) finalLink = aff.shortUrl;
    else console.log("[DUP] affiliate fail", { jobId: job.id, reason: aff.error, detail: aff.detail });
  }

  const productname = parsed.cupom
    ? `${parsed.productname} (Cupom: ${parsed.cupom})`
    : parsed.productname;

  const row: Record<string, unknown> = {
    productname,
    price: parsed.price,
    priceoriginal: parsed.priceoriginal,
    pricediscountrate: parsed.pricediscountrate,
    shopname: parsed.shopname || "",
    offerlink: finalLink,
    imageUrl: extractMessageImageUrl(msg) ?? "",
    sending: false,
    commission_rate: 0,
    commission_value: 0,
    sales: 0,
    rating: 0,
  };
  const ok = await insertN8nRow(tableId, row);
  console.log("[DUP] mirrored", {
    jobId: job.id,
    jid: remoteJid,
    ok,
    productname: productname.slice(0, 80),
    price: parsed.price,
    cupom: parsed.cupom,
    link: finalLink,
  });
}

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

function normalizePhoneDigits(raw: unknown): string {
  const value = typeof raw === "string" ? raw : String(raw ?? "");
  if (!value || value.includes("@lid")) return "";
  const digits = value.split("@")[0].replace(/\D/g, "");
  // Telefones WhatsApp internacionais normalmente ficam entre 8 e 15 dígitos.
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function getPhoneCandidates(msg: any, remoteJid: string, phone: string, sendTargets: string[]): string[] {
  const key = msg.key ?? {};
  const values = [
    phone,
    remoteJid,
    ...sendTargets,
    asText(key.previousRemoteJid),
    asText(msg.previousRemoteJid),
    asText(msg.data?.key?.previousRemoteJid),
    asText(key.senderPn),
    asText(key.participantPn),
    asText(key.remoteJidAlt),
    asText(msg.remoteJidAlt),
    asText(msg.data?.key?.senderPn),
    asText(msg.data?.key?.remoteJidAlt),
  ];
  return Array.from(new Set(values.map(normalizePhoneDigits).filter(Boolean)));
}

function phoneSuffixes(candidates: string[]): string[] {
  return Array.from(new Set(candidates.map((phone) => phone.slice(-11)).filter((phone) => phone.length >= 8)));
}

function matchesPhone(value: unknown, suffixes: string[]): boolean {
  const digits = normalizePhoneDigits(value);
  if (!digits || !suffixes.length) return false;
  return suffixes.some((suffix) => digits.endsWith(suffix) || suffix.endsWith(digits));
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
    `Você é ${agent.nome_atendente}, CONSULTOR humano de crescimento via WhatsApp da GA Company (agência que ajuda empresas a AUMENTAR FATURAMENTO, VENDER MAIS, ESTRUTURAR/ESCALAR o negócio, FORTALECER A MARCA no digital e AUTOMATIZAR o ATENDIMENTO com IA/robôzinho). NUNCA diga que é IA, bot ou assistente virtual. NUNCA use "tráfego pago", "anúncios" ou "ads" como gancho de venda — só cite se o cliente perguntar diretamente, e mesmo assim conecte ao resultado (faturamento, escala, marca, atendimento).`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `INSTRUÇÕES OBRIGATÓRIAS (siga fielmente, fonte de verdade sobre negócio/serviços/preços/processos):\n${agent.instrucoes_base}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    `\nMEMÓRIA OBRIGATÓRIA: antes de responder, LEIA todo o histórico. Continue exatamente do ponto onde parou. Se o cliente disser "isso", "aquilo", "planos", "tráfego" ou só o segmento, use o contexto anterior.`,

    `\n════════ REGRAS DE CONVERSA (CRÍTICAS) ════════`,
    `- SEMPRE responda de verdade a pergunta usando INSTRUÇÕES/FAQs. NUNCA devolva só "Olá! Como posso te ajudar hoje?".`,
    `- NÃO cumprimente de novo se já há histórico. Não reinicie a conversa. Não pergunte "em que posso ajudar?" se o cliente já disse o assunto.`,
    `- Português brasileiro, natural, consultivo, sem corporativês. Máx 1 emoji por bloco. Cada bloco: 1-3 linhas curtas.`,
    `- Quebre em até 3 blocos com "|||" (o sistema envia cada um como mensagem separada). NUNCA mencione o separador ao cliente.`,
    `- Nunca invente preço/prazo/condição que não esteja nas instruções — se não souber, diga que vai confirmar com o time e peça o melhor horário.`,

    `\n════════ MODO CONSULTIVO DE VENDAS (SPIN + PERSUASÃO) ════════`,
    `Seu objetivo é AVANÇAR toda conversa até o próximo passo (call de 15min com especialista). Você é consultor, não recepcionista.`,
    `1) DESCOBERTA (2-3 perguntas curtas, uma por vez): segmento, tempo de mercado, o que já faz hoje de marketing, principal dor/objetivo, ticket médio ou faturamento aproximado.`,
    `2) PROBLEMA/IMPLICAÇÃO: transforme resposta do cliente em dor concreta ("então hoje você depende só do boca-a-boca — isso limita crescimento e te deixa refém da sazonalidade, faz sentido?").`,
    `3) VALOR: mostre em 1-2 frases COMO a GA Company resolve exatamente aquela dor (usar o que está nas instruções). Traga exemplo/caso quando existir nas instruções.`,
    `4) FECHAMENTO SUAVE: SEMPRE termine a mensagem com um convite claro para o próximo passo — call de 15min com especialista, escolhendo entre 2 janelas ("hoje 17h ou amanhã 10h, qual funciona melhor?").`,

    `\n════════ TRATAMENTO DE OBJEÇÕES (NÃO DESISTA) ════════`,
    `Cliente NUNCA é descartado na primeira objeção. Sempre reframe e proponha próximo passo.`,
    `- "Tá caro / não tenho verba" → "Entendo. Justamente por isso a call é gratuita: a gente mapeia se faz sentido pro seu momento antes de qualquer proposta. Topa 15min?"`,
    `- "Já tenho agência" → "Show, muita gente vem pra gente vindo de outra agência. O que hoje te incomoda no serviço atual? Talvez a gente nem seja a solução, mas vale a conversa."`,
    `- "Vou pensar / depois te falo" → "Fechado. Só pra facilitar: quer que eu já deixe pré-agendado pra terça 10h? Se não puder é só remarcar."`,
    `- "Não tenho tempo agora" → "Sem problema, são só 15min e a gente adapta pro seu horário. Manhã, tarde ou fim do dia funciona melhor pra você?"`,
    `- "Manda material / PDF" → "Prefiro te mostrar rapidinho na call porque adapto pro seu segmento — rende bem mais que um PDF genérico. Consegue 15min essa semana?"`,
    `- Silêncio/resposta seca → faça 1 pergunta aberta simpática pra reengajar; nunca finalize a conversa por conta própria.`,

    `\n════════ PROIBIÇÕES ABSOLUTAS ════════`,
    `- NUNCA escreva mensagem no formato de relatório interno ("Nome: X | Empresa: Y | Segmento: Z | O que procura: ..."). O sistema envia isso automaticamente para o grupo interno quando o lead é qualificado. Você fala SEMPRE com o cliente em linguagem natural de WhatsApp.`,
    `- NUNCA repita "somos a GA Company" ou reapresentação em cada mensagem. Apresente-se UMA vez no início e pronto.`,
    `- NUNCA desista de um lead. Se ele não responder ao CTA, faça outra pergunta consultiva mantendo a porta aberta.`,
    `- NUNCA use placeholders entre [colchetes] ou {chaves}.`,
  ].filter(Boolean).join("\n");
}

function messageLooksLikeGreeting(value: string): boolean {
  const text = value.trim().toLowerCase();
  return /^(ol[áa]|oi|opa|bom dia|boa tarde|boa noite|e ai|e aí)[!,.\s]*$/.test(text);
}

function buildConversationState(recent: { role: string; mensagem: string }[], currentText: string): string {
  const assistantCount = recent.filter((m) => m.role === "assistant").length;
  const userCount = recent.filter((m) => m.role !== "assistant").length;
  const greeted = assistantCount > 0;
  const lastUserBeforeCurrent = [...recent]
    .reverse()
    .find((m) => m.role !== "assistant" && m.mensagem !== currentText)?.mensagem ?? "";
  const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant")?.mensagem ?? "";

  return [
    `ESTADO DA CONVERSA:`,
    `- Mensagens anteriores do cliente: ${Math.max(userCount - 1, 0)}. Respostas anteriores suas: ${assistantCount}.`,
    `- Cliente já foi cumprimentado: ${greeted ? "sim" : "não"}.`,
    greeted ? `- Não comece com saudação. Continue o contexto.` : `- Se a mensagem for só cumprimento, cumprimente brevemente e puxe o próximo passo.`,
    messageLooksLikeGreeting(currentText) && greeted ? `- A mensagem atual é só cumprimento; responda curto e retome o assunto anterior, sem reiniciar.` : "",
    lastUserBeforeCurrent ? `- Última mensagem anterior do cliente: ${lastUserBeforeCurrent}` : "",
    lastAssistant ? `- Sua última resposta: ${lastAssistant}` : "",
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
  let raw = (text ?? "").trim();
  if (!raw) return [];
  raw = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\n?\s*\|\|\|\s*\n?/g, " ||| ")
    .replace(/\s+\|\|\|\s+/g, " ||| ")
    .trim();
  // Separador explícito do modelo
  if (raw.includes("|||")) {
    return raw.split("|||").map((s) => s.trim()).filter(Boolean).slice(0, 4);
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
  return chunks.filter(Boolean).slice(0, 4);
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
    // Se a Evolution aceitou (r.ok), a mensagem entrou na fila — para aqui.
    // Tentar outro alvo (JID alternativo) causava mensagem duplicada quando
    // a sessão realmente entregava. PENDING é normal enquanto a socket
    // aguarda confirmação de entrega — não é falha.
    if (r.ok) return true;
  }
  return false;
}

// Delay aleatório entre 2.5 e 4.5 segundos para parecer humano sem demorar demais
function randomSplitDelayMs(): number {
  return 2500 + Math.floor(Math.random() * 2001);
}

async function sendText(instance: string, targets: string[], text: string): Promise<{ sent: string[]; failed: string[] }> {
  const parts = splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ok = await sendOnce(instance, targets, parts[i]);
    if (ok) sent.push(parts[i]); else failed.push(parts[i]);
    if (i < parts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, randomSplitDelayMs()));
    }
  }
  return { sent, failed };
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

    // Mensagens de grupo: se o grupo for origem de um DUP ativo, encaminha
    // direto para o webhook do workflow DUP no n8n. Assim funciona mesmo
    // quando a Evolution está apontada para este webhook local do sistema.
    if (remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) {
      if (remoteJid.endsWith("@g.us")) {
        await forwardDupToN8n(payload, remoteJid);
      } else {
        console.log("ignorando grupo/broadcast", remoteJid);
      }
      continue;
    }


    const text = getMessageText(msg);
    if (!text || !text.trim()) continue;

    const phone = getContactPhone(msg, remoteJid);
    const sendTargets = getSendTargets(msg, remoteJid);
    const phoneCandidates = getPhoneCandidates(msg, remoteJid, phone, sendTargets);
    const phoneSuffixList = phoneSuffixes(phoneCandidates);
    const storagePhone = phoneCandidates[0] || normalizePhoneDigits(phone) || phone;
    const pushName: string | null = msg.pushName ?? null;
    console.log("messageTargetContext", JSON.stringify({
      instance,
      remoteJid,
      senderPn: asText(msg.key?.senderPn),
      previousRemoteJid: asText(msg.key?.previousRemoteJid),
      remoteJidAlt: asText(msg.key?.remoteJidAlt) || asText(msg.remoteJidAlt),
      sendTargets,
      phoneCandidates,
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

    // === SDR lookup: telefone pertence a um lead ativo? ===
    let sdrLead: any = null;
    let sdrMatchReason: string = "not_found";
    console.log("[SDR-MATCH] start", JSON.stringify({
      portfolioId,
      instance,
      remoteJid,
      phoneCandidates,
      phoneSuffixList,
    }));
    if (phoneSuffixList.length) {
      const { data: leads } = await admin
        .from("sdr_leads")
        .select("*, sdr_campaigns!inner(status)")
        .eq("portfolio_id", portfolioId)
        .not("status", "in", "(sem_resposta,rejeitou)")
        .order("ultima_mensagem_em", { ascending: false })
        .limit(50);
      console.log("[SDR-MATCH] status_lookup", JSON.stringify({
        leadsFound: (leads ?? []).length,
        leadTelefones: (leads ?? []).map((l: any) => l.telefone),
      }));
      sdrLead = (leads ?? []).find((l: any) => {
        return matchesPhone(l.telefone, phoneSuffixList) && ["draft", "running", "paused", "finished"].includes(l.sdr_campaigns?.status);
      }) ?? null;
      if (sdrLead) sdrMatchReason = "matched_by_status_lookup";
    } else {
      console.log("[SDR-MATCH] skipped_no_suffixes");
    }

    // Fallback essencial: se a conversa já tem vínculo SDR salvo, usa esse vínculo mesmo
    // quando o WhatsApp chega por @lid ou com outro formato de telefone.
    if (!sdrLead && phoneSuffixList.length) {
      const { data: linkedConversations } = await admin
        .from("whatsapp_conversas")
        .select("sdr_lead_id, contato_telefone, created_at")
        .eq("portfolio_id", portfolioId)
        .not("sdr_lead_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(250);
      console.log("[SDR-MATCH] conversation_fallback_scan", JSON.stringify({
        linkedConversations: (linkedConversations ?? []).length,
        sampleTelefones: (linkedConversations ?? []).slice(0, 10).map((r: any) => r.contato_telefone),
      }));
      const linked = (linkedConversations ?? []).find((row: any) => matchesPhone(row.contato_telefone, phoneSuffixList));
      if (linked?.sdr_lead_id) {
        const { data: leadByConversation } = await admin
          .from("sdr_leads")
          .select("*, sdr_campaigns(status)")
          .eq("id", linked.sdr_lead_id)
          .maybeSingle();
        sdrLead = leadByConversation ?? null;
        if (sdrLead) sdrMatchReason = "matched_by_conversation_fallback";
      }
    }

    console.log("[SDR-MATCH] result", JSON.stringify({
      portfolioId,
      remoteJid,
      phoneSuffixList,
      reason: sdrMatchReason,
      sdrLeadId: sdrLead?.id ?? null,
      sdrLeadTelefone: sdrLead?.telefone ?? null,
      sdrLeadStatus: sdrLead?.status ?? null,
      sdrCampaignStatus: sdrLead?.sdr_campaigns?.status ?? null,
    }));


    // Gate manual: só responde se o agente estiver explicitamente ativo
    if (agent.status !== "active") {
      console.log("agente inativo, ignorando mensagem", { portfolioId, status: agent.status });
      await admin.from("whatsapp_conversas").insert({
        portfolio_id: portfolioId,
        instance_name: instance,
        contato_telefone: storagePhone,
        contato_nome: pushName,
        role: "user",
        mensagem: text,
        sdr_lead_id: sdrLead?.id ?? null,
      });
      continue;
    }

    // === DEDUPE DE ENTREGA (Evolution reenvia webhook às vezes) ===
    // Se o mesmo texto do mesmo telefone chegou nos últimos 15s, ignora esta entrega
    // — evita a IA responder 2x a mesma mensagem.
    {
      const dedupeCutoff = new Date(Date.now() - 15000).toISOString();
      const { data: dupe } = await admin
        .from("whatsapp_conversas")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("role", "user")
        .eq("contato_telefone", storagePhone)
        .eq("mensagem", text)
        .gte("created_at", dedupeCutoff)
        .limit(1);
      if (dupe && dupe.length > 0) {
        console.log("[DEDUPE] entrega duplicada ignorada", { storagePhone, preview: text.slice(0, 60) });
        continue;
      }
    }

    // Salvar mensagem do usuário (com vínculo SDR se aplicável)
    const { data: insertedUserMsg } = await admin.from("whatsapp_conversas").insert({
      portfolio_id: portfolioId,
      instance_name: instance,
      contato_telefone: storagePhone,
      contato_nome: pushName,
      role: "user",
      mensagem: text,
      sdr_lead_id: sdrLead?.id ?? null,
    }).select("id, created_at").maybeSingle();

    // === DEBOUNCE ANTI-BURST ===
    // Se o cliente manda várias mensagens seguidas ("oi", "opa", "call?"),
    // cada webhook chamava a IA e respondia 3x cada = enxurrada de bolhas.
    // Aqui esperamos 7s: se chegou outra mensagem do mesmo contato nesse
    // intervalo, ESTA execução para e deixa a próxima responder por todas.
    const DEBOUNCE_MS = 3000;
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    {
      const phonesForCheck = Array.from(new Set([
        storagePhone,
        ...phoneCandidates,
      ].filter(Boolean))).slice(0, 20);
      const cutoff = insertedUserMsg?.created_at ?? new Date(Date.now() - DEBOUNCE_MS).toISOString();
      if (phonesForCheck.length) {
        const { data: newer } = await admin
          .from("whatsapp_conversas")
          .select("id")
          .eq("portfolio_id", portfolioId)
          .eq("role", "user")
          .in("contato_telefone", phonesForCheck)
          .gt("created_at", cutoff)
          .limit(1);
        if (newer && newer.length > 0) {
          console.log("[DEBOUNCE] skip — chegou mensagem mais nova", {
            portfolioId, storagePhone, thisId: insertedUserMsg?.id,
          });
          continue;
        }
      }
    }

    // Se é lead SDR: atualiza status (primeira resposta vira "respondeu") e métricas
    if (sdrLead) {
      const patch: Record<string, unknown> = {
        ultima_mensagem_em: new Date().toISOString(),
        mensagens_trocadas: (sdrLead.mensagens_trocadas ?? 0) + 1,
      };
      if (sdrLead.status === "enviado") patch.status = "respondeu";
      await admin.from("sdr_leads").update(patch).eq("id", sdrLead.id);
      sdrLead = { ...sdrLead, ...patch };
    }


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
            contato_telefone: storagePhone,
            contato_nome: pushName,
            role: r.role,
            mensagem: r.mensagem,
            sdr_lead_id: sdrLead?.id ?? null,
          })));
        }
      }
      continue;
    }

    // Memória: últimas 36h da MESMA conversa (por lead SDR ou por telefone equivalente).
    const MEMORY_WINDOW_HOURS = 36;
    const memoryCutoffIso = new Date(Date.now() - MEMORY_WINDOW_HOURS * 3600 * 1000).toISOString();
    let history: { role: string; mensagem: string; created_at?: string; contato_telefone?: string }[] | null = null;
    if (sdrLead) {
      const { data } = await admin
        .from("whatsapp_conversas")
        .select("role, mensagem, created_at")
        .eq("portfolio_id", portfolioId)
        .eq("sdr_lead_id", sdrLead.id)
        .gte("created_at", memoryCutoffIso)
        .order("created_at", { ascending: false })
        .limit(100);
      history = data;
    } else {
      const exactPhones = Array.from(new Set([
        ...phoneCandidates,
        storagePhone,
        normalizePhoneDigits(phone),
        remoteJid,
      ].filter(Boolean))).slice(0, 25);

      let exactRows: any[] = [];
      if (exactPhones.length) {
        const { data } = await admin
          .from("whatsapp_conversas")
          .select("role, mensagem, contato_telefone, created_at")
          .eq("portfolio_id", portfolioId)
          .in("contato_telefone", exactPhones)
          .gte("created_at", memoryCutoffIso)
          .order("created_at", { ascending: false })
          .limit(200);
        exactRows = data ?? [];
      }

      // Fallback para conversas do mesmo número salvas com outro formato (@lid/9º dígito/DDI), ainda dentro da janela.
      let fallbackRows: any[] = [];
      if (phoneSuffixList.length && exactRows.length < 20) {
        const { data } = await admin
          .from("whatsapp_conversas")
          .select("role, mensagem, contato_telefone, created_at")
          .eq("portfolio_id", portfolioId)
          .gte("created_at", memoryCutoffIso)
          .order("created_at", { ascending: false })
          .limit(1000);
        fallbackRows = (data ?? []).filter((row: any) => matchesPhone(row.contato_telefone, phoneSuffixList));
      }

      const seen = new Set<string>();
      history = [...exactRows, ...fallbackRows]
        .filter((row: any) => {
          const key = `${row.created_at}|${row.role}|${row.mensagem}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 160);
    }


    const recent = (history ?? []).reverse();

    const modelMap: Record<string, string> = {
      gemini: "google/gemini-2.5-pro",
      openai: "openai/gpt-5-mini",
    };
    const model = modelMap[agent.modelo_ia] ?? "openai/gpt-5-mini";

    // Mantém memória suficiente para retomar conversas do dia anterior sem estourar tokens.
    const trimmedRecent = recent.slice(-60);

    // System prompt: tag explícita do MODO + estado + (se SDR) contexto isolado do lead.
    let systemPrompt = buildSystemPrompt(agent);
    const modeLine = sdrLead ? `MODO: SDR` : `MODO: RECEPTIVO`;
    systemPrompt = [`[${modeLine}]`, systemPrompt, "", buildConversationState(trimmedRecent, text)].join("\n");
    if (sdrLead) {
      systemPrompt = [
        systemPrompt,
        ``,
        `[CONTEXTO DO LEAD — ISOLADO POR CONVERSA, NÃO MISTURAR COM OUTROS CONTATOS]`,
        `Nome: ${sdrLead.nome_resolvido ?? sdrLead.nome ?? "você"}`,
        `Nicho: ${sdrLead.nicho}`,
        ...(sdrLead.cidade ? [`Cidade do estabelecimento: ${sdrLead.cidade} (use como referência local — cite bairros/mercado da região quando fizer sentido, mas NUNCA invente dados que não conhece).`] : []),
        `Motivo de contato (registro interno — NUNCA assumir que o lead já aceitou ou respondeu nada): ${sdrLead.motivo_contato}`,
        `Status atual do lead: ${sdrLead.status}.`,
        `Mensagens trocadas até agora: ${sdrLead.mensagens_trocadas ?? 0}.`,
        `Seu objetivo nesta conversa é vender o serviço da GA Company e conduzir até o agendamento de uma call de 15 minutos.`,
        `VOCÊ iniciou o contato (prospecção ativa). As mensagens "assistant" no histórico foram enviadas por VOCÊ mesmo — leia tudo, lembre exatamente o que você já disse e CONTINUE de onde parou.`,
        `NUNCA escreva frases como "que bom que você topou", "obrigado pelo aceite", "confirmando seu interesse" ou qualquer outra que assuma uma resposta que o lead AINDA não deu — a menos que o histórico acima mostre explicitamente essa resposta dele.`,
        `Se o lead responder com objeção, desinteresse ou dúvida, trate a objeção usando o contexto anterior e tente manter a oportunidade viva com uma pergunta curta ou CTA para call.`,
      ].join("\n");
    } else {
      systemPrompt = [
        systemPrompt,
        ``,
        `[MODO RECEPTIVO]`,
        `O contato chegou até você espontaneamente (não é uma prospecção). Apenas responda o que ele perguntar; não faça follow-up ativo nem cobre resposta.`,
      ].join("\n");
    }


    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: "Responda agora a ÚLTIMA mensagem do cliente. Use o histórico como memória; não trate mensagens antigas como nova pergunta." },
          ...trimmedRecent.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.mensagem })),
        ],
        temperature: agent.temperatura ?? 0.7,
        max_tokens: Math.min(Math.max(Number(agent.max_tokens ?? 500), 200), 2000),
      }),
    });

    if (!aiResp.ok) {
      console.error("AI gateway error", aiResp.status, await aiResp.text());
      continue;
    }

    const aiJson = await aiResp.json();
    let reply: string = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) continue;

    // === SANITIZAÇÃO: bloqueia mensagem-relatório vazando pro contato ===
    // A IA às vezes tentava enviar o card "Nome: X | Empresa: Y | Segmento: Z"
    // como resposta pro cliente. Esse formato é reservado ao grupo interno.
    const looksLikeLeadCard =
      /(^|\n)\s*(nome|empresa\s*\/?\s*segmento|whatsapp|o que procura|n[íi]vel de urg[êe]ncia|observa[çc][ãa]o relevante)\s*[:\-]/i.test(reply) &&
      /(empresa|segmento|whatsapp|urg[êe]ncia)/i.test(reply);
    if (looksLikeLeadCard) {
      console.warn("[SANITIZE] IA tentou enviar card de lead pro contato — substituindo", { preview: reply.slice(0, 200) });
      reply = "Perfeito! Já anotei aqui suas informações. Vou passar pro nosso especialista e ele te chama em instantes pra alinhar os próximos passos. Enquanto isso, tem algum horário que funciona melhor pra você hoje ou amanhã?";
    }

    const { sent, failed } = await sendText(instance, sendTargets, reply);
    // Só persistimos no histórico o que foi REALMENTE entregue. Mensagens
    // falhadas poluíam o contexto da próxima resposta (a IA "lia" como se
    // já tivesse falado aquilo). Falhas viram só log.
    if (failed.length) {
      console.warn("whatsapp send fail", JSON.stringify({
        instance, portfolioId, remoteJid,
        failedParts: failed.length,
        sample: failed[0]?.slice(0, 120),
      }));
    }
    if (sent.length) {
      await admin.from("whatsapp_conversas").insert(sent.map((m) => ({
        portfolio_id: portfolioId,
        instance_name: instance,
        contato_telefone: storagePhone,
        contato_nome: pushName,
        role: "assistant" as const,
        mensagem: m,
        sdr_lead_id: sdrLead?.id ?? null,
      })));
    }

    // === Detecção de gatilhos (funciona para SDR e conversas RECEPTIVAS) ===
    if (sent.length) {
      const userLower = text.toLowerCase();
      const replyLower = reply.toLowerCase();
      let newStatus: string | null = null;
      let trigger: "meeting_confirmed" | "human_requested" | null = null;

      // 1) Regex robusta — só sobre a FALA DO USUÁRIO (evita falso positivo da IA)
      const meetingRegex = /(pode (marcar|ser|agendar|confirmar)|vamos (marcar|fechar|agendar)|bora (marcar|fechar)|combinad|fechad|fechou|t[aá] fechado|t[aá] marcado|t[aá] combinado|t[oô] dentro|topo|aceito|quero (contratar|fechar|marcar|agendar)|manda o (link|convite)|me manda o (link|convite)|pode mandar (o )?link|confirmo|confirmad[oa]|ok pode ser|beleza pode|amanh[ãa].{0,20}(h|hora|:)|segunda.{0,20}(h|hora|:)|ter[çc]a.{0,20}(h|hora|:)|quarta.{0,20}(h|hora|:)|quinta.{0,20}(h|hora|:)|sexta.{0,20}(h|hora|:)|\bhoje\b.{0,20}(h|hora|:))/i;
      const humanRegex = /(falar com (humano|pessoa|atendente|respons[aá]vel|gerente|vendedor|dono|algu[eé]m|voc[eê]s)|quero (humano|atendente|falar com algu[eé]m)|atendimento humano|passa pra algu[eé]m|chama (o|a) (respons[aá]vel|gerente|dono|vendedor)|prefiro falar com (uma )?pessoa)/i;
      const rejectRegex = /(n[aã]o (tenho|temos)?\s*interesse|n[aã]o quero|n[aã]o me interessa|parar de receber|n[aã]o entre em contato|remove(r)? meu (n[uú]mero|contato))/i;

      if (meetingRegex.test(userLower)) {
        trigger = "meeting_confirmed";
        newStatus = "reuniao_confirmada";
      } else if (humanRegex.test(userLower)) {
        trigger = "human_requested";
        newStatus = "aguardando_humano";
      } else if (rejectRegex.test(userLower)) {
        newStatus = "rejeitou";
      }

      // 2) Classificador de IA (fallback rápido) — só roda se a regex NÃO pegou nada.
      //    Muito mais robusto em variação de nicho ("firmei", "vamos nessa", "manda o Zoom", etc).
      if (!trigger && !newStatus) {
        try {
          const lastTurns = trimmedRecent.slice(-6).map((m) => `${m.role === "assistant" ? "IA" : "CLIENTE"}: ${m.mensagem}`).join("\n");
          const clsResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content:
                    "Você classifica a ÚLTIMA mensagem do CLIENTE em uma conversa de vendas por WhatsApp. " +
                    "Responda APENAS em JSON válido com o formato: {\"meeting_confirmed\":bool,\"human_requested\":bool,\"rejected\":bool}. " +
                    "meeting_confirmed=true quando o cliente aceita agendar/marcar/fechar reunião, confirma horário, pede o link da call, ou diz que topa avançar. " +
                    "human_requested=true quando pede pra falar com uma pessoa/atendente/gerente/vendedor. " +
                    "rejected=true quando recusa explicitamente ou pede pra parar de receber contato. " +
                    "Se nenhum se aplica, retorne todos false. NÃO explique.",
                },
                {
                  role: "user",
                  content: `Histórico recente:\n${lastTurns}\n\nÚLTIMA mensagem do CLIENTE: "${text}"\nResposta que a IA acabou de mandar: "${reply}"`,
                },
              ],
              temperature: 0,
              max_tokens: 60,
            }),
          });
          if (clsResp.ok) {
            const clsJson = await clsResp.json();
            const raw = clsJson.choices?.[0]?.message?.content ?? "{}";
            const match = raw.match(/\{[\s\S]*\}/);
            const parsed = match ? JSON.parse(match[0]) : {};
            if (parsed.meeting_confirmed === true) {
              trigger = "meeting_confirmed";
              newStatus = "reuniao_confirmada";
            } else if (parsed.human_requested === true) {
              trigger = "human_requested";
              newStatus = "aguardando_humano";
            } else if (parsed.rejected === true) {
              newStatus = "rejeitou";
            }
          }
        } catch (e) {
          console.error("classifier fail", e);
        }
      }

      // Detecção de IA do outro lado
      const isLikelyBot = /(sou (uma )?intelig[eê]ncia artificial|sou um (bot|assistente virtual|rob[oô])|assistente virtual)/i.test(userLower);
      if (isLikelyBot && sdrLead) {
        await admin.from("sdr_leads")
          .update({ status: "ia_detectada", cooldown_ate: new Date(Date.now() + 2 * 3600 * 1000).toISOString() })
          .eq("id", sdrLead.id);
      } else if (newStatus && sdrLead) {
        await admin.from("sdr_leads").update({ status: newStatus }).eq("id", sdrLead.id);
      }

      // Dispara o relatório no grupo — SDR ou RECEPTIVO
      if (trigger) {
        const { data: agentRow } = await admin
          .from("whatsapp_agents")
          .select("report_group_id, report_group_name")
          .eq("portfolio_id", portfolioId)
          .maybeSingle();
        if (agentRow?.report_group_id) {
          const triggerLabel = trigger === "meeting_confirmed" ? "✅ Reunião confirmada" : "🙋 Solicitou falar com humano";
          const leadNome = sdrLead?.nome_resolvido ?? sdrLead?.nome ?? pushName ?? "—";
          const leadFone = sdrLead?.telefone ?? storagePhone;
          const linhas = [
            `📋 *NOVO LEAD — GA COMPANY*`,
            `_${triggerLabel}_`,
            ``,
            `👤 *Lead:* ${leadNome}`,
            `📱 *WhatsApp:* +${leadFone}`,
          ];
          if (sdrLead) {
            linhas.push(`🏢 *Empresa:* ${sdrLead.nome ?? "—"}`);
            linhas.push(`📂 *Segmento:* ${sdrLead.nicho}`);
            if (sdrLead.cidade) linhas.push(`📍 *Cidade:* ${sdrLead.cidade}`);
            linhas.push(`🎯 *Motivo de contato:* ${sdrLead.motivo_contato}`);
            linhas.push(`💬 *Mensagens trocadas:* ${(sdrLead.mensagens_trocadas ?? 0) + sent.length}`);
            if (sdrLead.instagram) linhas.push(`📷 *Instagram:* ${sdrLead.instagram}`);
          } else {
            linhas.push(`📨 *Origem:* conversa receptiva (cliente iniciou o contato)`);
            const ultimaFala = text.length > 240 ? text.slice(0, 240) + "…" : text;
            linhas.push(`💬 *Última mensagem do cliente:* "${ultimaFala}"`);
          }
          const reportText = linhas.filter(Boolean).join("\n");
          fetch(`${EVO_URL}/message/sendText/${instance}`, {
            method: "POST",
            headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ number: agentRow.report_group_id, text: reportText }),
          }).catch((e) => console.error("send-report fail", e));
        } else {
          console.log("gatilho detectado mas nenhum report_group_id configurado", { portfolioId, trigger });
        }
      }
    }

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
