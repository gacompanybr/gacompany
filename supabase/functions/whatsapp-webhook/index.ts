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
const GOOGLE_CLOUD_TTS_API_KEY = Deno.env.get("GOOGLE_CLOUD_TTS_API_KEY") ?? "";
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
    `Você é ${agent.nome_atendente}, atendente humano via WhatsApp. NUNCA diga que é IA, bot ou assistente virtual. NUNCA cite a "GA Company" ou qualquer outra empresa/agência — a identidade, negócio, serviços, preços e processos que você representa vêm EXCLUSIVAMENTE das INSTRUÇÕES OBRIGATÓRIAS abaixo. Se as instruções não citarem algo, não invente.`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `INSTRUÇÕES OBRIGATÓRIAS (siga fielmente, fonte de verdade sobre identidade/negócio/serviços/preços/processos):\n${agent.instrucoes_base}` : "",
    faqText ? `\nFAQs de referência:\n${faqText}` : "",
    `\nMEMÓRIA OBRIGATÓRIA: antes de responder, LEIA todo o histórico. Continue exatamente do ponto onde parou. Se o cliente disser "isso", "aquilo" ou só o assunto, use o contexto anterior.`,

    `\n════════ REGRAS DE CONVERSA (CRÍTICAS) ════════`,
    `- SEMPRE responda de verdade usando as INSTRUÇÕES/FAQs. NUNCA devolva só "Olá! Como posso te ajudar hoje?".`,
    `- NÃO cumprimente de novo se já há histórico. Não reinicie a conversa. Não pergunte "em que posso ajudar?" se o cliente já disse o assunto.`,
    `- Português brasileiro, natural, humano, sem corporativês. Máx 1 emoji por bloco. Cada bloco: 1-3 linhas curtas.`,
    `- Por padrão envie UMA mensagem por turno. Só quebre em até 3 blocos com "|||" se as INSTRUÇÕES do negócio pedirem explicitamente. NUNCA mencione o separador ao cliente.`,
    `- Nunca invente preço/prazo/condição que não esteja nas instruções — se não souber, diga que vai confirmar com o time.`,
    `- NUNCA escreva mensagem no formato de relatório interno ("Nome: X | Empresa: Y | ..."). Isso é reservado ao grupo interno. Você fala SEMPRE com o cliente em linguagem natural de WhatsApp.`,
    `- NUNCA use placeholders entre [colchetes] ou {chaves}.`,
    `- Respostas CURTAS, como um humano digitando no WhatsApp: em geral até ~300 caracteres por turno. Só ultrapasse quando o cliente pedir detalhes (ex.: lista de preços).`,
    `- PROIBIDO markdown: nunca use **, *, listas com asterisco ou títulos #. Para listar, use no máximo uma linha por item começando com hífen.`,
    `- NUNCA repita informação que você já enviou no histórico (preços, endereço, horários, boas-vindas). Se o cliente voltar ao assunto, faça referência curta em uma linha (ex.: "como te falei, o plano livre é R$ 90").`,
    `- Responda SOMENTE a última mensagem do cliente, uma ideia por mensagem. Nunca reenvie sua resposta anterior.`,
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



const DIA_MAP = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const DIA_LABEL: Record<string, string> = {
  seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom",
};

function nowSaoPaulo(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

// Janela de atendimento do dia atual. null = fechado hoje.
function janelaDoDia(agent: any, diaKey: string): { inicio: string; fim: string } | null {
  const porDia = agent?.horarios_por_dia;
  if (porDia && typeof porDia === "object" && !Array.isArray(porDia) && porDia[diaKey]) {
    const cfg = porDia[diaKey];
    if (cfg?.enabled === false) return null;
    if (cfg?.inicio && cfg?.fim) return { inicio: String(cfg.inicio), fim: String(cfg.fim) };
    return null;
  }
  // legado: dias_semana + horario_inicio/horario_fim
  const dias = Array.isArray(agent?.dias_semana) ? agent.dias_semana : [];
  if (dias.length && !dias.includes(diaKey)) return null;
  if (!agent?.horario_inicio || !agent?.horario_fim) return null;
  return { inicio: String(agent.horario_inicio), fim: String(agent.horario_fim) };
}

function toMin(hhmm: string): number {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function dentroDoHorario(agent: any): boolean {
  try {
    const now = nowSaoPaulo();
    const diaHoje = DIA_MAP[now.getDay()];
    const janela = janelaDoDia(agent, diaHoje);
    if (!janela) {
      // Sem configuração alguma (nem por dia nem legado) → não bloqueia.
      const porDia = agent?.horarios_por_dia;
      const temPorDia = porDia && typeof porDia === "object" && !Array.isArray(porDia) && Object.keys(porDia).length > 0;
      const temLegado = !!(agent?.horario_inicio && agent?.horario_fim);
      if (!temPorDia && !temLegado) return true;
      return false;
    }
    const startMin = toMin(janela.inicio);
    const endMin = toMin(janela.fim);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (startMin > endMin) {
      return nowMin >= startMin || nowMin <= endMin;
    }
    return nowMin >= startMin && nowMin <= endMin;
  } catch {
    return true;
  }
}

// Grade compacta da semana, só dias abertos. Ex.: "Seg 08:00–18:00 · Sáb 08:00–12:00"
function gradeSemana(agent: any): string {
  const partes: string[] = [];
  for (const key of ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]) {
    const j = janelaDoDia(agent, key);
    if (j) partes.push(`${DIA_LABEL[key]} ${j.inicio}–${j.fim}`);
  }
  return partes.length ? partes.join(" · ") : "não configurado";
}

function buildTimeContext(agent: any): string {
  try {
    const nomeDia = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const now = nowSaoPaulo();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const diaHoje = DIA_MAP[now.getDay()];
    const janela = janelaDoDia(agent, diaHoje);
    const dentro = dentroDoHorario(agent);
    const linhas = [
      `[CONTEXTO TEMPORAL — fuso America/Sao_Paulo]`,
      `- Agora: ${nomeDia[now.getDay()]} (${diaHoje}), ${dd}/${mo}, ${hh}:${mm}.`,
      janela
        ? `- Hoje (${nomeDia[now.getDay()]}) atendemos das ${janela.inicio} às ${janela.fim}.`
        : `- Hoje (${nomeDia[now.getDay()]}) NÃO há atendimento (estabelecimento fechado).`,
      `- Grade da semana (somente dias com atendimento): ${gradeSemana(agent)}. NUNCA prometa horário em dia que não está nessa grade.`,
      dentro
        ? `- ESTAMOS DENTRO do horário de atendimento agora. Você pode oferecer atendimento/agendamento para HOJE.`
        : `- ESTAMOS FORA do horário de atendimento agora. NUNCA diga "atendemos ainda hoje", "conseguimos te atender agora" ou prometa horário para hoje. Ofereça o próximo dia com atendimento na grade acima e deixe claro que a equipe confirma no próximo expediente.`,
    ];
    return linhas.join("\n");
  } catch {
    return "";
  }
}


// ============================================================
// IDENTIFICAÇÃO DE NOME DO CONTATO
// Regra: só existe nome se o cliente responder DIRETAMENTE à pergunta do nome.
// Nunca extrair de conteúdo livre, nunca usar pushName do WhatsApp.
// ============================================================

// Detecta se a mensagem do robô foi uma pergunta de nome
const NAME_QUESTION_PATTERNS = [
  /qual\s+(?:é\s+)?o?\s*seu\s+nome/i,
  /como\s+(?:você|vc|voce)\s+se\s+chama/i,
  /com\s+quem\s+(?:eu\s+)?(?:tô|to|estou|falo)\s+falando/i,
  /pode\s+me\s+(?:passar|dizer|informar)\s+(?:o\s+)?seu\s+nome/i,
  /me\s+diz\s+seu\s+nome/i,
  /seu\s+nome,?\s+por\s+favor/i,
];

function isNameQuestion(text: string | null | undefined): boolean {
  const s = (text ?? "").toString();
  if (!s) return false;
  return NAME_QUESTION_PATTERNS.some((re) => re.test(s));
}

// ---- Filtro determinístico de "não é nome" (roda antes de qualquer IA) ----

// minúsculas, sem acento, sem pontuação, espaços colapsados
function normLoose(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cumprimentos / cortesias / palavras comuns — tolerante a letra repetida e falta de espaço
const GREETING_RE =
  /^(bo+m+\s*di+a+|boa+\s*(tarde+|noite+)|oi+|ola+|opa+|e+\s*a+e+|eae+|alo+|salve|tudo\s*(bem|bom|certo|joia)|blz|beleza|obrigad[oa]*|agradecid[oa]|de\s*nada|por\s*favor|pfv|pf|desculpa|ok+|okay|certo|sim|nao|nunca|talvez|entendi|valeu|vlw|bom|boa|prazer|ai|aqui|eu|vc|voce|tu|quem|isso|claro|so|ta|tah|ata|hum+|kk+|ha+|rs+)$/;

const COMMON_WORD_RE =
  /^(preciso|precisando|to|tô|estou|tou|quero|queria|gostaria|pode|poderia|consegue|tem|teria|quanto|quanta|qual|como|onde|quando|porque|porq|pq|ajuda|ajudar|informacao|informacoes|atendimento|agendar|agendamento|marcar|consulta|dentista|orcamento|preco|valor|horario|dia|hoje|amanha|urgente|dor|dente|dentes|moca|mocinha|senhor|senhora|senhorita|amig[oa]|querid[oa]|gente|dr|dra|doutor|doutora|voces|voce|obrigad[oa]*)$/;

function looksLikeNotAName(candidate: string): boolean {
  const n = normLoose(candidate);
  if (!n) return true;
  if (/\d/.test(n)) return true;
  if (String(candidate).trim().endsWith("?")) return true;
  if (GREETING_RE.test(n)) return true;
  const words = n.split(" ");
  // Qualquer palavra comum/cumprimento no candidato invalida (ex.: "tô precisando", "boa noite moça")
  if (words.some((w) => COMMON_WORD_RE.test(w) || GREETING_RE.test(w))) return true;
  // frases de cortesia com mais palavras: "boa tarde tudo bem", "tudo bem?"
  const semCumprimento = stripGreeting(n);
  if (!semCumprimento) return true;
  return false;
}

// Tira cumprimentos/cortesias do começo (e o "sou/meu nome é") — devolve o resto
function stripGreeting(normalized: string): string {
  let s = normalized;
  let prev = "";
  const LEAD =
    /^(bo+m+\s*di+a+|boa+\s*(tarde+|noite+)|oi+|ola+|opa+|e+\s*a+e+|eae+|alo+|salve|tudo\s*(bem|bom|certo|joia)|blz|beleza|obrigad[oa]*|por\s*favor|pfv|entao|ai|e|ah|ok+)\b\s*/;
  const SELF =
    /^(me\s*chamo|meu\s*nome\s*(e|eh)?|sou\s*(o|a|os)?|aqui\s*(e|eh)?\s*(o|a)?|pode\s*me\s*chamar\s*de|quem\s*fala\s*(e|eh)?\s*(o|a)?)\s*/;
  while (s !== prev) {
    prev = s;
    s = s.replace(LEAD, "").replace(SELF, "").trim();
  }
  return s.trim();
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => (w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Extrai o nome de uma RESPOSTA à pergunta do nome. Retorna null se inválida.
function parseNameAnswer(raw: string | null | undefined): string | null {
  let s = (raw ?? "").toString().trim();
  if (!s) return null;
  if (/\d/.test(s)) return null;
  if (s.endsWith("?")) return null;
  // remove emojis e pontuação de borda
  s = s.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").trim();
  s = s.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").trim();
  if (!s) return null;
  if (s.length > 60) return null;

  // prefixos comuns: "meu nome é X", "sou o X", "me chamo X"
  const m = s.match(
    /(?:me\s*chamo|meu\s*nome\s*[éeh]|sou\s*[oa]?|aqui\s*[éeh]\s*[oa]?|pode\s*me\s*chamar\s*de)\s+(.+)$/i,
  );
  if (m && m[1]) s = m[1].trim();

  // Descola cumprimento do nome: "Bom dia, Ana" → "Ana"
  const restoNorm = stripGreeting(normLoose(s));
  if (!restoNorm) return null;
  // Reconstrói mantendo acentos: pega as últimas N palavras do original
  const origWords = s.replace(/[,.;:!]+/g, " ").split(/\s+/).filter(Boolean);
  const nWords = restoNorm.split(" ").length;
  let candidate = origWords.slice(Math.max(0, origWords.length - nWords)).join(" ").trim();
  if (!candidate) candidate = s;

  if (looksLikeNotAName(candidate)) return null;

  // só letras, espaços, apóstrofo e hífen
  if (!/^[\p{L}][\p{L}'\-]*(?:\s+[\p{L}][\p{L}'\-]*){0,2}$/u.test(candidate)) return null;
  const letters = candidate.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return null;

  return normalizeName(candidate);
}


type ResolvedName = { name: string | null; source: "informado_pelo_cliente" | null };

// Correção EXPLÍCITA de nome: só isso pode sobrescrever um nome já salvo.
// Ex.: "não, meu nome não é X, é Wanderley", "na verdade me chamo Wanderley"
const NAME_CORRECTION_PATTERNS = [
  /(?:n[ãa]o[,\s]+)?meu\s+nome\s+n[ãa]o\s+[éeh][^,.;]*[,.;]?\s*(?:[éeh]|e sim)\s+(.+)$/i,
  /n[ãa]o\s+(?:me\s+chamo|sou)\s+[^,.;]+[,.;]?\s*(?:me\s+chamo|sou|[éeh])\s+(.+)$/i,
  /(?:na\s+verdade|corrigindo|corrige)[,\s]+(?:meu\s+nome\s+[éeh]|me\s+chamo|sou\s+[oa]?)\s+(.+)$/i,
  /(?:n[ãa]o|nao)[,\s]+(?:pode\s+me\s+chamar\s+de|me\s+chame\s+de)\s+(.+)$/i,
];

function parseNameCorrection(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  for (const re of NAME_CORRECTION_PATTERNS) {
    const m = s.match(re);
    if (m && m[1]) {
      const parsed = parseNameAnswer(m[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

async function saveContactName(portfolioId: string, storagePhone: string, name: string) {
  try {
    await admin.from("whatsapp_contact_names").upsert({
      portfolio_id: portfolioId,
      phone: storagePhone,
      name,
      source: "informado_pelo_cliente",
      updated_at: new Date().toISOString(),
    }, { onConflict: "portfolio_id,phone" });
  } catch (e) {
    console.error("[NAME] upsert fail", e);
  }
}

// Uma única checagem por IA (barata), só no momento de salvar o nome pela 1ª vez.
// Fail-safe: qualquer falha/timeout → false (não salva).
async function aiIsPersonName(candidate: string): Promise<boolean> {
  try {
    const p = Promise.race([
      aiClassifyBool(
        `"${candidate}" é um nome próprio de pessoa? Responda apenas true ou false. Cumprimentos (bom dia, oi), frases e palavras comuns não são nomes.`,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    return await p;
  } catch {
    return false;
  }
}

async function resolveContactName(
  portfolioId: string,
  storagePhone: string,
  lastAssistantText: string | null,
  currentText: string,
): Promise<ResolvedName> {
  // 1) Nome já salvo para esse contato → TRAVADO.
  //    Exceções: correção explícita do cliente, ou nome salvo inválido (cumprimento) → limpa.
  try {
    const { data: saved } = await admin
      .from("whatsapp_contact_names")
      .select("name")
      .eq("portfolio_id", portfolioId)
      .eq("phone", storagePhone)
      .maybeSingle();
    if (saved?.name) {
      const corrected = parseNameCorrection(currentText);
      if (corrected && corrected.toLowerCase() !== String(saved.name).toLowerCase()) {
        console.log("[NAME] correção explícita", { de: saved.name, para: corrected });
        await saveContactName(portfolioId, storagePhone, corrected);
        return { name: corrected, source: "informado_pelo_cliente" };
      }
      // Auto-correção do banco contaminado: "Bom dia", "Oi", etc.
      if (looksLikeNotAName(String(saved.name))) {
        console.log("[NAME] nome salvo inválido, descartando", { nome: saved.name, storagePhone });
        try {
          await admin.from("whatsapp_contact_names")
            .delete()
            .eq("portfolio_id", portfolioId)
            .eq("phone", storagePhone);
        } catch (e) {
          console.error("[NAME] delete inválido fail", e);
        }
      } else {
        return { name: saved.name, source: "informado_pelo_cliente" };
      }
    }
  } catch (e) {
    console.error("[NAME] lookup fail", e);
  }


  // 2) A mensagem atual é resposta direta à pergunta do nome?
  if (isNameQuestion(lastAssistantText)) {
    const parsed = parseNameAnswer(currentText);
    if (parsed) {
      const ok = await aiIsPersonName(parsed);
      if (!ok) {
        console.log("[NAME] IA rejeitou candidato, não salva", { candidato: parsed });
        return { name: null, source: null };
      }
      await saveContactName(portfolioId, storagePhone, parsed);
      return { name: parsed, source: "informado_pelo_cliente" };
    }
  }

  // 3) Sem nome confiável
  return { name: null, source: null };
}

/**
 * Fallback SÓ para relatórios: se não há nome resolvido/salvo, tenta recuperar
 * o nome que já apareceu na conversa (inclusive quando a própria IA já chamou
 * o cliente pelo nome). Valida com os mesmos filtros + IA e salva se aprovado.
 */
async function recoverNameFromConversation(
  portfolioId: string,
  storagePhone: string,
  hist: string,
): Promise<string | null> {
  try {
    const raw = await aiExtractShort(
      `Leia a conversa abaixo e responda SOMENTE o primeiro nome (ou nome e sobrenome) da PESSOA que está falando como CLIENTE. ` +
      `O nome pode ter sido dito pelo cliente ou usado pela IA ao se dirigir a ele. ` +
      `Se não houver nenhum nome de pessoa na conversa, responda exatamente: NENHUM.\n\n${hist}`,
    );
    const cand = String(raw ?? "").trim();
    if (!cand || /^nenhum$/i.test(cand)) return null;
    const parsed = parseNameAnswer(cand);
    if (!parsed) return null;
    if (!(await aiIsPersonName(parsed))) return null;
    await saveContactName(portfolioId, storagePhone, parsed);
    console.log("[NAME] recuperado da conversa para relatório", { parsed, storagePhone });
    return parsed;
  } catch (e) {
    console.error("[NAME] recover fail", e);
    return null;
  }
}



// Remove markdown e normaliza formatação antes de quebrar a mensagem.
function sanitizeReplyFormatting(text: string): string {
  let out = (text ?? "");
  out = out.replace(/\*\*(.*?)\*\*/gs, "$1").replace(/__(.*?)__/gs, "$1");
  out = out.replace(/\*\*/g, "").replace(/__/g, "");
  out = out.replace(/^[ \t]*[*-][ \t]+/gm, "- ");
  out = out.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// Normalização usada para detectar repetição de conteúdo já enviado.
function normalizeForRepeat(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForRepeat(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeForRepeat(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
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
    return raw.split("|||").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  }
  // Quebra por parágrafo duplo
  const byParagraph = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (byParagraph.length > 1) return byParagraph.slice(0, 3);
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
  return chunks.filter(Boolean).slice(0, 3);
}

type SendCtx = { portfolioId?: string | null; phone?: string | null };

// Registra o key.id de toda mensagem enviada PELO SISTEMA, para depois
// diferenciar de mensagens digitadas manualmente pela equipe no aparelho.
async function logSystemSentMessage(ids: string[], instance: string, ctx?: SendCtx) {
  if (!ctx?.portfolioId || !ids.length) return;
  try {
    await admin.from("whatsapp_sent_messages_log").upsert(
      ids.map((id) => ({
        portfolio_id: ctx.portfolioId,
        instance_name: instance,
        phone: ctx.phone ?? "",
        message_id: id,
      })),
      { onConflict: "message_id", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[SENT-LOG] falha ao registrar id", (e as Error).message);
  }
}

function extractSentMessageIds(responseJson: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { const s = asText(v); if (s) out.push(s); };
  push(responseJson?.key?.id);
  push(responseJson?.message?.key?.id);
  push(responseJson?.data?.key?.id);
  push(responseJson?.id);
  return Array.from(new Set(out));
}

// Classificação binária via IA leve (flash-lite). Retorna false em qualquer falha.
async function aiClassifyBool(prompt: string): Promise<boolean> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Você é um classificador. Responda SOMENTE com true ou false." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 5,
    }),
  });
  if (!r.ok) {
    console.error("[AI-CLS] gateway erro", r.status, (await r.text()).slice(0, 200));
    return false;
  }
  const j = await r.json();
  const out = String(j.choices?.[0]?.message?.content ?? "").toLowerCase();
  return /\btrue\b/.test(out);
}

// Extração de uma frase curta via IA leve.
async function aiExtractShort(prompt: string): Promise<string> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Responda apenas com a frase pedida, sem explicações e sem aspas." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 60,
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    const s = String(j.choices?.[0]?.message?.content ?? "").trim().replace(/^["'`]+|["'`]+$/g, "");
    return s.length > 140 ? s.slice(0, 140) + "…" : s;
  } catch {
    return "";
  }
}

async function sendOnce(instance: string, targets: string[], text: string, ctx?: SendCtx): Promise<boolean> {
  const url = `${EVO_URL}/message/sendText/${instance}`;
  const headers = { apikey: EVO_KEY, "Content-Type": "application/json" };
  for (const [index, target] of targets.entries()) {
    const body = { number: target, text };
    // 1 retry automático com pequeno atraso se a Evolution rejeitar o envio.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const responseText = await r.text();
      let responseJson: any = null;
      try { responseJson = JSON.parse(responseText); } catch { /* keep text */ }
      const deliveryStatus = String(responseJson?.status ?? responseJson?.message?.status ?? "").toUpperCase();
      console.log("sendText", JSON.stringify({ instance, target, targetIdx: index + 1, attempt, status: r.status, ok: r.ok, deliveryStatus, response: responseText.slice(0, 500) }));
      if (r.ok) {
        await logSystemSentMessage(extractSentMessageIds(responseJson), instance, { ...ctx, phone: ctx?.phone ?? target });
        return true;
      }
      if (attempt < 2) await new Promise((res) => setTimeout(res, 1200));
    }
  }
  return false;
}

async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!GOOGLE_CLOUD_TTS_API_KEY || !text.trim()) return null;
  try {
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(GOOGLE_CLOUD_TTS_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: text.trim() },
        voice: { languageCode: "pt-BR", name: "pt-BR-Neural2-B" },
        audioConfig: { audioEncoding: "OGG_OPUS", speakingRate: 1.04, pitch: 0 },
      }),
    });
    if (!response.ok) {
      console.error("[TTS] Google fail", response.status, (await response.text()).slice(0, 300));
      return null;
    }
    const body = await response.json();
    return typeof body?.audioContent === "string" && body.audioContent ? body.audioContent : null;
  } catch (e) {
    console.error("[TTS] Google exception", e);
    return null;
  }
}

async function sendAudioOnce(instance: string, targets: string[], text: string, ctx?: SendCtx): Promise<boolean> {
  const audio = await synthesizeSpeech(text);
  if (!audio) return false;
  for (const target of targets) {
    const response = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: target, audio: `data:audio/ogg;codecs=opus;base64,${audio}` }),
    });
    const responseText = await response.text();
    let responseJson: any = null;
    try { responseJson = JSON.parse(responseText); } catch { /* keep text */ }
    console.log("sendAudio", JSON.stringify({ instance, target, status: response.status, ok: response.ok }));
    if (response.ok) {
      await logSystemSentMessage(extractSentMessageIds(responseJson), instance, { ...ctx, phone: ctx?.phone ?? target });
      return true;
    }
    console.error("sendAudio fail", response.status, responseText.slice(0, 300));
  }
  return false;
}


// Delay aleatório entre 0.8 e 1.5 segundos para parecer humano sem travar
function randomSplitDelayMs(): number {
  return 800 + Math.floor(Math.random() * 700);
}

async function sendText(instance: string, targets: string[], text: string | string[], ctx?: SendCtx): Promise<{ sent: string[]; failed: string[] }> {
  const parts = Array.isArray(text)
    ? text.map((p) => (p ?? "").trim()).filter(Boolean).slice(0, 3)
    : splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ok = await sendOnce(instance, targets, parts[i], ctx);
    if (ok) sent.push(parts[i]); else failed.push(parts[i]);
    if (i < parts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, randomSplitDelayMs()));
    }
  }
  return { sent, failed };
}

async function sendSdrReply(
  instance: string,
  targets: string[],
  parts: string[],
  campaign: any,
  ctx?: SendCtx,
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];
  const threshold = Number(campaign?.audio_long_message_threshold ?? 420);
  const fullText = parts.join(" ").trim();
  const shouldUseAudio = campaign?.audio_enabled === true && campaign?.audio_on_long_message === true && fullText.length >= threshold;
  if (shouldUseAudio) {
    const audioOk = await sendAudioOnce(instance, targets, fullText, ctx);
    if (audioOk) return { sent: [`[ÁUDIO] ${fullText}`], failed };
    return sendText(instance, targets, parts, ctx);
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const ok = await sendOnce(instance, targets, part, ctx);
    if (ok) sent.push(part);
    else failed.push(part);
    if (i < parts.length - 1) await new Promise((resolve) => setTimeout(resolve, randomSplitDelayMs()));
  }
  return { sent, failed };
}

const HUMAN_PAUSE_HOURS = 3;

async function resolvePortfolioByInstance(instance: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("whatsapp_connections")
    .select("portfolio_id")
    .eq("instance_name", instance)
    .maybeSingle();
  if (conn?.portfolio_id) return conn.portfolio_id;
  const { data: ag } = await admin
    .from("whatsapp_agents")
    .select("portfolio_id")
    .eq("instancia_id", instance)
    .maybeSingle();
  return ag?.portfolio_id ?? null;
}

// Mensagem com fromMe=true: se o key.id NÃO estiver no log de envios do sistema,
// foi um humano da equipe digitando no aparelho → pausa a IA 3h para esse contato.
async function handleOutgoingMessage(payload: any, msg: any) {
  try {
    const remoteJid = getRemoteJid(msg);
    if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) return;
    const msgId = asText(msg.key?.id) || asText(msg.id);
    if (!msgId) return;

    const instance = normalizeInstance(payload, msg);

    // O webhook fromMe da própria IA pode chegar ANTES do log do envio ser gravado.
    // Tenta duas vezes, com uma pequena espera, antes de considerar humano.
    const isKnownSystemId = async () => {
      const { data } = await admin
        .from("whatsapp_sent_messages_log")
        .select("id")
        .eq("message_id", msgId)
        .maybeSingle();
      return !!data;
    };
    if (await isKnownSystemId()) return; // foi o próprio sistema
    await new Promise((r) => setTimeout(r, 2500));
    if (await isKnownSystemId()) return;

    const portfolioId = await resolvePortfolioByInstance(instance);
    if (!portfolioId) return;

    const phoneFromJid = normalizePhoneDigits(remoteJid.split("@")[0]) || remoteJid.split("@")[0];
    // Rede de segurança extra: se o sistema enviou algo para este contato nos
    // últimos 60s, a mensagem fromMe é da própria IA (id pode não bater em
    // @lid / reenvios da Evolution) — não pausar.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recentes } = await admin
      .from("whatsapp_sent_messages_log")
      .select("phone")
      .eq("portfolio_id", portfolioId)
      .gte("created_at", since)
      .limit(50);
    const suffixes = phoneSuffixes([phoneFromJid]);
    if ((recentes ?? []).some((r: any) => matchesPhone(r.phone, suffixes))) return;

    const phone = phoneFromJid;
    const pausedUntil = new Date(Date.now() + HUMAN_PAUSE_HOURS * 60 * 60 * 1000).toISOString();
    await admin.from("whatsapp_paused_contacts").upsert({
      portfolio_id: portfolioId,
      phone,
      paused_until: pausedUntil,
      reason: "manual_human_message",
      updated_at: new Date().toISOString(),
    }, { onConflict: "portfolio_id,phone" });
    console.log("[HUMAN-TAKEOVER] IA pausada", { portfolioId, phone, pausedUntil });
  } catch (e) {
    console.error("[HUMAN-TAKEOVER] erro", (e as Error).message);
  }
}

async function isContactPaused(portfolioId: string, suffixes: string[]): Promise<string | null> {
  if (!suffixes.length) return null;
  const { data: rows } = await admin
    .from("whatsapp_paused_contacts")
    .select("phone, paused_until")
    .eq("portfolio_id", portfolioId)
    .gt("paused_until", new Date().toISOString())
    .limit(200);
  const hit = (rows ?? []).find((r: any) => matchesPhone(r.phone, suffixes));
  return hit ? hit.paused_until : null;
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
    if (!msg || msg.messageStubType) continue;
    if (msg.key?.fromMe || msg.fromMe) {
      // Enviada pela própria instância: pode ter sido o sistema (ok) ou um
      // humano da equipe digitando no aparelho (→ pausa a IA 3h nesse chat).
      await handleOutgoingMessage(payload, msg);
      continue;
    }


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
        .select("*, sdr_campaigns!inner(status, audio_enabled, audio_on_intro, audio_on_long_message, audio_long_message_threshold)")
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
          .select("*, sdr_campaigns(status, audio_enabled, audio_on_intro, audio_on_long_message, audio_long_message_threshold)")
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

    // Fora do expediente: o robô fica invisível — sem leitura, sem resposta, sem banco.
    if (!dentroDoHorario(agent)) {
      const _diaHoje = DIA_MAP[nowSaoPaulo().getDay()];
      const _janelaHoje = janelaDoDia(agent, _diaHoje);
      console.log("[HORARIO] fora do expediente, ignorando mensagem", {
        portfolioId, remoteJid, dia: _diaHoje,
        janela: _janelaHoje ? `${_janelaHoje.inicio}-${_janelaHoje.fim}` : "fechado",
        grade: gradeSemana(agent),
      });
      continue;
    }

    // Atendimento humano em andamento: alguém da equipe respondeu manualmente
    // nesse chat. A IA fica 100% silenciosa (sem leitura, sem resposta, sem
    // relatório) até o paused_until passar. Não afeta outros contatos.
    {
      const pausedUntil = await isContactPaused(portfolioId, phoneSuffixList);
      if (pausedUntil) {
        console.log("[HUMAN-TAKEOVER] contato pausado, ignorando", { portfolioId, storagePhone, pausedUntil });
        continue;
      }
    }



    // Agente ativo: marca a mensagem recebida como lida no WhatsApp.
    // Quando inativo (bloco acima), NÃO marca — deixa a equipe humana ver que chegou algo novo.
    try {
      const msgId = asText(msg.key?.id) || asText(msg.id);
      const readJid = asText(msg.key?.remoteJid) || remoteJid;
      if (msgId && readJid) {
        const readRes = await fetch(`${EVO_URL}/chat/markMessageAsRead/${instance}`, {
          method: "POST",
          headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            readMessages: [{ remoteJid: readJid, fromMe: false, id: msgId }],
          }),
        });
        if (!readRes.ok) {
          console.log("[READ] falhou", { status: readRes.status, msgId });
        }
      }
    } catch (e) {
      console.log("[READ] erro", (e as Error).message);
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
    // Aqui esperamos 6s: se chegou outra mensagem do mesmo contato nesse
    // intervalo, ESTA execução para e deixa a próxima responder por todas.
    const DEBOUNCE_MS = 6000;
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const phonesForCheck = Array.from(new Set([
      storagePhone,
      ...phoneCandidates,
    ].filter(Boolean))).slice(0, 20);
    {
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
      gemini: "google/gemini-2.5-flash",
      openai: "openai/gpt-5-mini",
    };
    const model = modelMap[agent.modelo_ia] ?? "openai/gpt-5-mini";
    // Mantém memória suficiente para retomar conversas do dia anterior sem estourar tokens.
    const trimmedRecent = recent.slice(-60);

    // === RESOLUÇÃO DE NOME DO CONTATO (só pergunta direta) ===
    const lastAssistantText = [...trimmedRecent].reverse().find((m) => m.role === "assistant")?.mensagem ?? null;
    let resolvedName = await resolveContactName(portfolioId, storagePhone, lastAssistantText, text);
    // Quantas vezes o robô já perguntou o nome nesta conversa (máx. 2 perguntas)
    const nameAsks = trimmedRecent.filter((m) => m.role === "assistant" && isNameQuestion(m.mensagem)).length;
    const stopAskingName = nameAsks >= 2;
    console.log("[NAME] resolved", { portfolioId, storagePhone, name: resolvedName.name, source: resolvedName.source, nameAsks });

    // System prompt: tag explícita do MODO + estado + (se SDR) contexto isolado do lead.
    let systemPrompt = buildSystemPrompt(agent);
    const modeLine = sdrLead ? `MODO: SDR` : `MODO: RECEPTIVO`;
    const nameBlock = resolvedName.name
      ? [
          `[NOME DO CONTATO]`,
          `O contato se chama: ${resolvedName.name}.`,
          `Use esse nome com naturalidade quando fizer sentido. NUNCA pergunte o nome de novo.`,
        ].join("\n")
      : stopAskingName
      ? [
          `[NOME DO CONTATO]`,
          `Você NÃO sabe o nome do contato. NUNCA invente, NUNCA deduza a partir do que a pessoa escreveu e NUNCA use nome de perfil do WhatsApp.`,
          `Você já perguntou o nome duas vezes e não obteve resposta. NÃO pergunte de novo. Trate a pessoa por "você" e siga o atendimento normalmente.`,
        ].join("\n")
      : [
          `[NOME DO CONTATO]`,
          `Você NÃO sabe o nome do contato. NUNCA invente, NUNCA deduza a partir do que a pessoa escreveu e NUNCA use nome de perfil do WhatsApp.`,
          `OBRIGATÓRIO: nesta resposta, responda primeiro o que a pessoa perguntou e, no final, inclua uma pergunta curta e natural pedindo o nome — ex.: "Claro, consigo verificar pra você. Só me confirma seu nome, por favor?".`,
          `NUNCA envie uma mensagem só com "qual seu nome?" — a pergunta do nome vem sempre junto com a resposta do assunto.`,
          `Enquanto não souber o nome, trate a pessoa sem nome (ex.: "você"), nunca com um nome inventado.`,
        ].join("\n");

    systemPrompt = [`[${modeLine}]`, systemPrompt, "", buildTimeContext(agent), "", nameBlock, "", buildConversationState(trimmedRecent, text)].join("\n");

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
        `Seu objetivo nesta conversa é seguir fielmente as INSTRUÇÕES OBRIGATÓRIAS do negócio (acima) e conduzir o lead ao próximo passo definido nelas (agendamento, avaliação, call — o que as instruções disserem).`,
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


    // max_tokens: mínimo 500, padrão 1200, teto 3000.
    // Modelos de raciocínio (Gemini 2.5 Pro etc.) consomem parte do orçamento
    // "pensando" internamente antes de escrever — valores baixos cortam a
    // resposta visível no meio da frase.
    const maxTokens = Math.min(Math.max(Number(agent.max_tokens ?? 1200), 500), 3000);

    async function callAi(mt: number) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          max_tokens: mt,
        }),
      });
    }

    let aiResp = await callAi(maxTokens);
    if (!aiResp.ok) {
      console.error("AI gateway error", aiResp.status, await aiResp.text());
      continue;
    }

    let aiJson = await aiResp.json();
    let reply: string = aiJson.choices?.[0]?.message?.content?.trim() ?? "";

    // Detecta resposta cortada: finish_reason=length ou texto sem pontuação final.
    const finishReason = String(aiJson.choices?.[0]?.finish_reason ?? "").toLowerCase();
    const endsProperly = (t: string) => /[.!?…\)\]\"'”’)]\s*$/.test(t) || /[:;]\s*$/.test(t);
    const looksTruncated = reply.length > 0 && (finishReason === "length" || !endsProperly(reply));
    if (looksTruncated && maxTokens < 3000) {
      const retryTokens = Math.min(3000, Math.max(maxTokens * 2, 2000));
      console.warn("[TRUNCATED] resposta parece cortada — refazendo com max_tokens maior", { finishReason, was: maxTokens, retry: retryTokens, preview: reply.slice(-80) });
      const retry = await callAi(retryTokens);
      if (retry.ok) {
        const retryJson = await retry.json();
        const retryReply: string = retryJson.choices?.[0]?.message?.content?.trim() ?? "";
        const retryFinish = String(retryJson.choices?.[0]?.finish_reason ?? "").toLowerCase();
        if (retryReply && (retryFinish !== "length" && endsProperly(retryReply))) {
          reply = retryReply;
          aiJson = retryJson;
        } else if (retryReply.length > reply.length) {
          reply = retryReply;
          aiJson = retryJson;
        }
      }
    }

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

    // Remove markdown / normaliza formatação antes de quebrar em blocos.
    reply = sanitizeReplyFormatting(reply);
    if (!reply) continue;

    // === ANTI-CONCORRÊNCIA (evita resposta obsoleta e duplicada) ===
    const raceCutoff = insertedUserMsg?.created_at ?? null;
    if (raceCutoff && phonesForCheck.length) {
      const { data: newerUser } = await admin
        .from("whatsapp_conversas")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("role", "user")
        .in("contato_telefone", phonesForCheck)
        .gt("created_at", raceCutoff)
        .limit(1);
      if (newerUser && newerUser.length > 0) {
        console.log("[RACE] abortando envio — mensagem mais nova do cliente", { portfolioId, storagePhone });
        continue;
      }
      const { data: newerAssistant } = await admin
        .from("whatsapp_conversas")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("role", "assistant")
        .in("contato_telefone", phonesForCheck)
        .gt("created_at", raceCutoff)
        .limit(1);
      if (newerAssistant && newerAssistant.length > 0) {
        console.log("[RACE] abortando envio — outra execução já respondeu", { portfolioId, storagePhone });
        continue;
      }
    }

    // === ANTI-REPETIÇÃO DE CONTEÚDO ===
    let partsToSend = splitMessage(reply);
    if (phonesForCheck.length) {
      const repeatCutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const { data: lastAssistant } = await admin
        .from("whatsapp_conversas")
        .select("mensagem")
        .eq("portfolio_id", portfolioId)
        .eq("role", "assistant")
        .in("contato_telefone", phonesForCheck)
        .gte("created_at", repeatCutoff)
        .order("created_at", { ascending: false })
        .limit(6);
      const previous = (lastAssistant ?? []).map((m: any) => String(m.mensagem ?? "")).filter(Boolean);
      if (previous.length) {
        partsToSend = partsToSend.filter((part) => {
          const repeated = previous.some((prev) => tokenSimilarity(part, prev) >= 0.9);
          if (repeated) console.log("[REPEAT] bloco repetido descartado", { preview: part.slice(0, 80) });
          return !repeated;
        });
      }
    }
    if (!partsToSend.length) {
      console.log("[REPEAT] nada novo a enviar — execução encerrada", { portfolioId, storagePhone });
      continue;
    }

    const { sent, failed } = sdrLead
      ? await sendSdrReply(instance, sendTargets, partsToSend, sdrLead.sdr_campaigns, { portfolioId, phone: storagePhone })
      : await sendText(instance, sendTargets, partsToSend, { portfolioId, phone: storagePhone });
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
      // Insere um a um com created_at explícito (+1s por parte) para que a
      // leitura do histórico preserve a ordem real de envio.
      const baseTs = Date.now();
      for (let i = 0; i < sent.length; i++) {
        await admin.from("whatsapp_conversas").insert({
          portfolio_id: portfolioId,
          instance_name: instance,
          contato_telefone: storagePhone,
          contato_nome: pushName,
          role: "assistant" as const,
          mensagem: sent[i],
          sdr_lead_id: sdrLead?.id ?? null,
          created_at: new Date(baseTs + i * 1000).toISOString(),
        });
      }
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

      // Detecta "promessa de repasse" via classificação por IA (mais robusto
      // que lista fixa de palavras-chave — pega variações de frase).
      let promiseTriggered = false;
      if (!trigger && reply.trim()) {
        try {
          promiseTriggered = await aiClassifyBool(
            `A mensagem abaixo, enviada por uma assistente de atendimento, comunica ao cliente que um profissional ou a equipe vai retornar o contato dele em algum momento futuro (seja porque está fora do horário, seja porque precisa confirmar algo com a equipe, agendamento pendente, etc)?\n\nMensagem: "${reply}"\n\nResponda apenas: true ou false`,
          );
        } catch (e) {
          console.error("[PROMISE] classificação falhou", (e as Error).message);
        }
        if (promiseTriggered) {
          trigger = "human_requested";
          if (!newStatus) newStatus = "aguardando_humano";
        }
      }

      // Dispara o relatório — SDR ou RECEPTIVO
      if (trigger) {
        const { data: agentRow } = await admin
          .from("whatsapp_agents")
          .select("report_group_id, report_group_name, report_number")
          .eq("portfolio_id", portfolioId)
          .maybeSingle();

        const destinations: string[] = [];
        if (agentRow?.report_group_id) destinations.push(agentRow.report_group_id);
        if (agentRow?.report_number) destinations.push(String(agentRow.report_number).replace(/\D/g, ""));

        if (destinations.length === 0) {
          console.log("gatilho detectado mas nenhum destino de relatório configurado", { portfolioId, trigger });
        } else {
          // CORREÇÃO 2: só dispara "promessa de repassar" se conversa tiver >=3 msgs do cliente
          const userMsgsCount =
            trimmedRecent.filter((m) => m.role === "user").length + 1; // +1 = msg atual
          if (promiseTriggered && userMsgsCount < 3) {
            console.log("relatório suprimido — conversa curta demais", { userMsgsCount, trigger });
          } else {
          // CORREÇÃO 3: dedupe persistente no banco, 60min por telefone+trigger
          const DEDUPE_WINDOW_MIN = 60;
          const { data: lastReport } = await admin
            .from("whatsapp_report_dedupe")
            .select("last_sent_at")
            .eq("portfolio_id", portfolioId)
            .eq("phone", storagePhone)
            .eq("trigger_type", trigger)
            .maybeSingle();
          const lastMs = lastReport?.last_sent_at ? new Date(lastReport.last_sent_at).getTime() : 0;
          const nowMs = Date.now();
          if (lastMs && nowMs - lastMs < DEDUPE_WINDOW_MIN * 60 * 1000) {
            console.log("relatório suprimido por dedupe DB", {
              portfolioId, storagePhone, trigger, ageMin: Math.round((nowMs - lastMs) / 60000),
            });
          } else {
            const leadFone = sdrLead?.telefone ?? storagePhone;

            // Nome do lead: hierarquia resolvida no turno; se vazio, tenta recuperar
            // o nome que já apareceu na conversa antes de reportar "Não identificado".
            const histParaMotivo = [...trimmedRecent, { role: "user" as const, mensagem: text }, { role: "assistant" as const, mensagem: reply }]
              .slice(-12)
              .map((m) => `${m.role === "assistant" ? "IA" : "CLIENTE"}: ${m.mensagem}`)
              .join("\n");

            const nomeRecuperado = resolvedName.name
              ?? (await recoverNameFromConversation(portfolioId, storagePhone, histParaMotivo));
            const leadNome = nomeRecuperado ?? "Não identificado";
            if (!resolvedName.name && nomeRecuperado) {
              resolvedName = { name: nomeRecuperado, source: "informado_pelo_cliente" };
            }

            // === Unidade (Bauru / Duartina) — extraída da conversa ===
            const unidade = (() => {
              const falasCliente = [...trimmedRecent.filter((m) => m.role === "user").map((m) => m.mensagem), text];
              for (let i = falasCliente.length - 1; i >= 0; i--) {
                const f = String(falasCliente[i] ?? "");
                if (/duartina/i.test(f)) return "Duartina";
                if (/bauru/i.test(f)) return "Bauru";
              }
              return "Não informado";
            })();

            // === Motivo real + checagem "é mesmo um paciente?" via IA leve ===
            let motivoReal = "Motivo não identificado";
            let ehPaciente: boolean | null = null;
            let assuntoDetectado = "";
            try {
              const motResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: "Você analisa conversas de WhatsApp de uma clínica odontológica e responde SOMENTE com JSON válido." },
                    { role: "user", content: `Analise o histórico abaixo e responda um JSON com as chaves:\n` +
                      `- "is_patient": true APENAS se a pessoa é um paciente/lead buscando atendimento odontológico (agendar, avaliação, dor, orçamento de tratamento). Use false se o assunto for aluguel de sala, fornecedor, parceria comercial, cobrança, currículo/funcionário, ou qualquer assunto administrativo/comercial.\n` +
                      `- "subject": 2 a 5 palavras descrevendo o assunto real da conversa.\n` +
                      `- "motivo": frase curta (máx 10 palavras) com o motivo real do contato, específico. Se não der pra saber, use "Motivo não identificado".\n\n` +
                      `Histórico:\n${histParaMotivo}` },
                  ],
                  temperature: 0.1,
                  max_tokens: 120,
                }),
              });
              if (motResp.ok) {
                const motJson = await motResp.json();
                const rawTxt = String(motJson.choices?.[0]?.message?.content ?? "");
                const m = rawTxt.match(/\{[\s\S]*\}/);
                const parsed = m ? JSON.parse(m[0]) : {};
                if (typeof parsed.is_patient === "boolean") ehPaciente = parsed.is_patient;
                if (parsed.subject) assuntoDetectado = String(parsed.subject).slice(0, 80);
                const mot = String(parsed.motivo ?? "").trim().replace(/^["'`]+|["'`]+$/g, "");
                if (mot) motivoReal = mot.length > 140 ? mot.slice(0, 140) + "…" : mot;
              }
            } catch (e) {
              console.error("motivo-extract fail", e);
            }

            // === TRAVA DE VALIDAÇÃO — nome + unidade + motivo real + é paciente ===
            const FALLBACK_RE = /^(n[aã]o\s+informado|n[aã]o\s+identificad[oa]|desconhecid[oa]|sem\s+nome|cliente|contato|—|-)?$/i;
            const GENERIC_MOTIVO_RE = /^(motivo n[aã]o identificad[oa]|contato|d[uú]vida|informa[cç][õo]es?|atendimento|conversa|outro assunto|n[aã]o informado)\.?$/i;
            const NAO_PACIENTE_RE = /(aluguel|alugar|locat[aá]ri[oa]|sala\b|fornecedor|parceria|representante|cobran[cç]a|boleto em aberto|curr[ií]culo|vaga de emprego|funcion[aá]ri[oa]|nota fiscal)/i;

            const conversaTexto = histParaMotivo.toLowerCase();
            const falhas: string[] = [];

            // Nome ausente só bloqueia enquanto o robô ainda pode perguntar (menos de 2 perguntas).
            if ((!resolvedName.name || FALLBACK_RE.test(String(leadNome).trim())) && !stopAskingName) falhas.push("nome_ausente");
            if (unidade !== "Bauru" && unidade !== "Duartina") falhas.push("unidade_ausente");
            if (!motivoReal || GENERIC_MOTIVO_RE.test(motivoReal.trim()) || motivoReal.trim().length < 8) falhas.push("motivo_generico");
            if (ehPaciente === false) falhas.push("nao_e_paciente");
            else if (ehPaciente === null && NAO_PACIENTE_RE.test(conversaTexto)) falhas.push("assunto_nao_odontologico");

            if (falhas.length > 0) {
              console.log("[REPORT-BLOCK] relatório bloqueado pela validação", {
                portfolioId, storagePhone, trigger, falhas, leadNome, unidade, motivoReal, assuntoDetectado,
              });
              await admin.from("leads_incompletos").insert({
                portfolio_id: portfolioId,
                phone: storagePhone,
                trigger_type: trigger,
                motivo_falha: falhas.join(","),
                nome_capturado: resolvedName.name ?? null,
                unidade_capturada: unidade === "Não informado" ? null : unidade,
                motivo_capturado: motivoReal,
                contexto: { assunto: assuntoDetectado, is_patient: ehPaciente, name_source: resolvedName.source ?? null },
              }).then(({ error }) => { if (error) console.error("leads_incompletos insert fail", error); });
            } else {
            await admin.from("whatsapp_report_dedupe").upsert({
              portfolio_id: portfolioId,
              phone: storagePhone,
              trigger_type: trigger,
              last_sent_at: new Date(nowMs).toISOString(),
            }, { onConflict: "portfolio_id,phone,trigger_type" });

            const nowSP = new Date().toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            }).replace(",", " às");

            let reportText: string;
            if (promiseTriggered) {
              reportText = [
                `🔔 *Novo contato fora do horário*`,
                ``,
                `👤 Nome: ${leadNome}`,
                `📍 Unidade: ${unidade}`,
                `📱 Número: +${leadFone}`,
                `🔗 WhatsApp: https://wa.me/${leadFone}`,
                `📋 Motivo: ${motivoReal}`,
                `🕐 Data/hora: ${nowSP}`,
              ].join("\n");
            } else {
              const triggerLabel = trigger === "meeting_confirmed" ? "✅ Reunião confirmada" : "🙋 Solicitou falar com humano";
              const linhas = [
                `📋 *NOVO LEAD*`,
                `_${triggerLabel}_`,
                ``,
                `👤 *Nome:* ${leadNome}`,
                `📍 *Unidade:* ${unidade}`,
                `📱 *WhatsApp:* +${leadFone} — https://wa.me/${leadFone}`,
                `📋 *Motivo:* ${motivoReal}`,
              ];

              if (sdrLead) {
                linhas.push(`🏢 *Empresa:* ${sdrLead.nome ?? "—"}`);
                linhas.push(`📂 *Segmento:* ${sdrLead.nicho}`);
                if (sdrLead.cidade) linhas.push(`📍 *Cidade:* ${sdrLead.cidade}`);
                linhas.push(`💬 *Mensagens trocadas:* ${(sdrLead.mensagens_trocadas ?? 0) + sent.length}`);
                if (sdrLead.instagram) linhas.push(`📷 *Instagram:* ${sdrLead.instagram}`);
              }
              linhas.push(`🕐 *Data/hora:* ${nowSP}`);
              reportText = linhas.filter(Boolean).join("\n");
            }

            // Envio não-bloqueante para cada destino
            for (const dest of destinations) {
              fetch(`${EVO_URL}/message/sendText/${instance}`, {
                method: "POST",
                headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ number: dest, text: reportText }),
              })
                .then(async (r) => {
                  console.log("send-report", { dest, status: r.status, ok: r.ok, trigger });
                  if (r.ok) {
                    const body = await r.json().catch(() => null);
                    await logSystemSentMessage(extractSentMessageIds(body), instance, { portfolioId, phone: dest });
                  }
                  return r;
                })
                .catch((e) => console.error("send-report fail", { dest, err: String(e) }));
            }
            }
          }
          }

        }
      }

      // ==========================================================
      // RELATÓRIO INDEPENDENTE — Pagamento / comprovante recebido
      // ==========================================================
      try {
        const isPayment = await aiClassifyBool(
          `A mensagem abaixo do cliente indica que ele fez ou está enviando comprovante de um pagamento (PIX, transferência, boleto pago, etc)?\n\nMensagem: "${text}"\n\nResponda apenas: true ou false`,
        );
        if (isPayment) {
          const { data: agentRow2 } = await admin
            .from("whatsapp_agents")
            .select("report_group_id, report_number")
            .eq("portfolio_id", portfolioId)
            .maybeSingle();
          const destPay: string[] = [];
          if (agentRow2?.report_group_id) destPay.push(agentRow2.report_group_id);
          if (agentRow2?.report_number) destPay.push(String(agentRow2.report_number).replace(/\D/g, ""));

          if (destPay.length === 0) {
            console.log("[PAYMENT] detectado mas sem destino configurado", { portfolioId });
          } else {
            const PAY_TRIGGER = "payment_received";
            const { data: lastPay } = await admin
              .from("whatsapp_report_dedupe")
              .select("last_sent_at")
              .eq("portfolio_id", portfolioId)
              .eq("phone", storagePhone)
              .eq("trigger_type", PAY_TRIGGER)
              .maybeSingle();
            const lastPayMs = lastPay?.last_sent_at ? new Date(lastPay.last_sent_at).getTime() : 0;
            if (lastPayMs && Date.now() - lastPayMs < 60 * 60 * 1000) {
              console.log("[PAYMENT] suprimido por dedupe 60min", { portfolioId, storagePhone });
            } else {
              const histPay = [...trimmedRecent, { role: "user" as const, mensagem: text }]
                .slice(-12)
                .map((m) => `${m.role === "assistant" ? "IA" : "CLIENTE"}: ${m.mensagem}`)
                .join("\n");
              const referente = await aiExtractShort(
                `Com base no histórico abaixo de uma clínica odontológica, responda em uma frase curta (máx 12 palavras) A QUE SE REFERE O PAGAMENTO que o cliente acabou de informar (ex: "Pagamento de parcela do tratamento ortodôntico", "PIX referente à consulta de avaliação"). Se não der pra saber, responda "Pagamento não especificado".\n\nHistórico:\n${histPay}`,
              ) || "Pagamento não especificado";

              const unidadePay = (() => {
                const falas = [...trimmedRecent.filter((m) => m.role === "user").map((m) => m.mensagem), text];
                for (let i = falas.length - 1; i >= 0; i--) {
                  const f = String(falas[i] ?? "");
                  if (/duartina/i.test(f)) return "Duartina";
                  if (/bauru/i.test(f)) return "Bauru";
                }
                return "Não informado";
              })();

              const nomePay = resolvedName.name
                ?? (await recoverNameFromConversation(portfolioId, storagePhone, histPay));
              if (!resolvedName.name && nomePay) {
                resolvedName = { name: nomePay, source: "informado_pelo_cliente" };
              }

              const nowSP2 = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              }).replace(",", " às");

              const payText = [
                `💰 *PAGAMENTO RECEBIDO*`,
                ``,
                `👤 Nome: ${nomePay ?? "Não identificado"}`,
                `📍 Unidade: ${unidadePay}`,
                `📱 WhatsApp: +${storagePhone} — https://wa.me/${storagePhone}`,
                `📋 Referente a: ${referente}`,
                `🕐 Data/hora: ${nowSP2}`,
              ].join("\n");

              await admin.from("whatsapp_report_dedupe").upsert({
                portfolio_id: portfolioId,
                phone: storagePhone,
                trigger_type: PAY_TRIGGER,
                last_sent_at: new Date().toISOString(),
              }, { onConflict: "portfolio_id,phone,trigger_type" });

              for (const dest of destPay) {
                fetch(`${EVO_URL}/message/sendText/${instance}`, {
                  method: "POST",
                  headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
                  body: JSON.stringify({ number: dest, text: payText }),
                })
                  .then(async (r) => {
                    console.log("send-report", { dest, status: r.status, ok: r.ok, trigger: PAY_TRIGGER });
                    if (r.ok) {
                      const body = await r.json().catch(() => null);
                      await logSystemSentMessage(extractSentMessageIds(body), instance, { portfolioId, phone: dest });
                    }
                  })
                  .catch((e) => console.error("send-report fail", { dest, err: String(e) }));
              }
            }
          }
        }
      } catch (e) {
        console.error("[PAYMENT] classificação falhou", (e as Error).message);
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
