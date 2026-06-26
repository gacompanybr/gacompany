// n8n-sync: cria, ativa, pausa e deleta workflows no n8n para cada robô
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildMlScrapperWorkflow } from "../_shared/ml-scrapper-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_BASE = (Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/$/, "");
const N8N_KEY = Deno.env.get("N8N_API_KEY")!;
const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function n8nFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${N8N_BASE}${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": N8N_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`n8n ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function evolutionFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${EVO_URL}${path}`, {
    ...init,
    headers: {
      apikey: EVO_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep */ }
  return { ok: res.ok, status: res.status, body };
}

async function ensureDupEvolutionCapture(admin: any, portfolioId: string) {
  const { data: conn } = await admin
    .from("whatsapp_connections")
    .select("instance_name")
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  let instanceName = conn?.instance_name ?? "";
  if (!instanceName) {
    const { data: agent } = await admin
      .from("whatsapp_agents")
      .select("instancia_id")
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    instanceName = agent?.instancia_id ?? "";
  }
  if (!instanceName) return { ok: false, skipped: "no whatsapp instance" };

  const settings = await evolutionFetch(`/settings/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      rejectCall: false,
      msgCall: "",
      groupsIgnore: false,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
      syncFullHistory: false,
    }),
  });

  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const webhook = await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhook_by_events: false,
        byEvents: false,
        base64: false,
        webhookBase64: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"],
      },
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhook_by_events: false,
      webhookBase64: false,
      webhook_base64: false,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"],
    }),
  });

  console.log("DUP evolution capture", JSON.stringify({ instanceName, settings: settings.status, webhook: webhook.status }));
  return { ok: settings.ok && webhook.ok, instanceName, settings: settings.status, webhook: webhook.status };
}

const MARKETPLACE_PREFIX: Record<string, string> = {
  shopee: "SHOPEE",
  mercadolivre: "ML",
  amazon: "AMZ",
  dup: "DUP",
};

// Gera um nome legível para o workflow no n8n, incluindo o nome dado pelo
// usuário no painel + plataforma, mantendo o ID técnico ao final.
function friendlyWorkflowName(kind: "ROBO" | "SCRAPPER" | "DISPARO", entity: any) {
  const nome = String(entity?.nome ?? "").trim();
  const plat = String(entity?.plataforma ?? "").trim();
  const platLabel = plat ? (MARKETPLACE_PREFIX[plat.toLowerCase()] ?? plat.toUpperCase()) : "";
  const tag = [nome, platLabel].filter(Boolean).join(" · ");
  const idShort = String(entity?.id ?? "").slice(0, 8);
  return tag ? `[${kind}] ${tag} — ${idShort}` : `${kind}_${entity?.id ?? ""}`;
}

const DEFAULT_TEMPLATE = `*{frase}*

{productname}

De ~R$ {priceoriginal}~ ❌
Por *R$ {price}* ✅ ({pricediscountrate}% OFF)

🏪 {shopname}

👉 {offerlink}`;

function extractAssignedString(input: string, names: string[]): string | null {
  for (const name of names) {
    const idx = input.search(new RegExp(`\\b${name}\\b`, "i"));
    if (idx < 0) continue;
    const eq = input.indexOf("=", idx);
    if (eq < 0) continue;
    let i = eq + 1;
    while (/\s/.test(input[i] || "")) i++;
    const quote = input[i];
    if (!["'", '"', "`"].includes(quote)) continue;
    i++;
    let out = "";
    for (; i < input.length; i++) {
      const ch = input[i];
      if (ch === "\\" && i + 1 < input.length) {
        const next = input[++i];
        out += next === "n" || next === "r" ? " " : next;
        continue;
      }
      if (ch === quote) return out;
      out += ch;
    }
  }
  return null;
}

function normalizeCredential(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
}

function sanitizeMlCredential(value: unknown, names: string[] = []): string {
  let s = normalizeCredential(value);
  let assigned: string | null = null;
  if (names.some((n) => /COOKIE/i.test(n))) {
    for (const name of names) {
      const idx = s.search(new RegExp(`\\b${name}\\b`, "i"));
      if (idx < 0) continue;
      const eq = s.indexOf("=", idx);
      if (eq < 0) continue;
      assigned = s.slice(eq + 1).trim().replace(/^['"`]/, "").replace(/['"`]?\s*[);]*\s*$/, "");
      break;
    }
  } else {
    assigned = names.length ? extractAssignedString(s, names) : null;
  }
  if (assigned != null) s = assigned;
  return s
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/\r|\n/g, " ")
    .replace(/\s*;\s*(?:const|let|var)\s+[A-Z0-9_]+\s*=.*$/i, "")
    .trim();
}

function buildEcommerceWorkflow(robo: any) {
  const tableId = robo.n8n_datatable_id;
  const destinos: string[] = Array.isArray(robo.destinos) ? robo.destinos : [];
  const template: string = robo.message_template || DEFAULT_TEMPLATE;
  const instance: string = robo.instancia_id || "";
  const horariosPorDia = robo.horarios_por_dia ?? {};
  const scrapperSecret = Deno.env.get("SCRAPPER_API_SECRET") ?? "";
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

  // O cron dispara a cada 1 minuto; o próprio JS decide se manda ou pula
  // baseado em horarios_por_dia + ultima_execucao (lido via scrapper-api).
  const jsCode = `
const N8N_BASE = ${JSON.stringify(N8N_BASE)};
const N8N_KEY = ${JSON.stringify(N8N_KEY)};
const TABLE_ID = ${JSON.stringify(tableId)};
const PLATAFORMA = ${JSON.stringify(robo.plataforma ?? robo.marketplace ?? "")};
const EVO_URL = ${JSON.stringify(EVO_URL)};
const EVO_KEY = ${JSON.stringify(EVO_KEY)};
const INSTANCE = ${JSON.stringify(instance)};
const DESTINOS = ${JSON.stringify(destinos)};
const TEMPLATE = ${JSON.stringify(template)};
const ROBO_ID = ${JSON.stringify(robo.id)};
const SCRAPPER_API = ${JSON.stringify(SUPABASE_URL)} + "/functions/v1/scrapper-api";
const SCRAPPER_SECRET = ${JSON.stringify(scrapperSecret)};
const LOVABLE_API_KEY = ${JSON.stringify(lovableApiKey)};
const HORARIOS_PADRAO = ${JSON.stringify(horariosPorDia)};

const http = this.helpers.httpRequest;
const DOW_MAP = ["dom","seg","ter","qua","qui","sex","sab"];

function toMin(t) {
  const parts = String(t || "00:00").split(":");
  return (parseInt(parts[0]||"0",10) * 60) + parseInt(parts[1]||"0",10);
}

// 0. Pega estado atual (ultima_execucao + horarios_por_dia) do robô
let state = { ultima_execucao: null, horarios_por_dia: HORARIOS_PADRAO };
try {
  state = await http({
    method: "GET",
    url: SCRAPPER_API + "?action=get_robo&id=" + encodeURIComponent(ROBO_ID),
    headers: { "Authorization": "Bearer " + SCRAPPER_SECRET },
    json: true,
  });
} catch (_) {}
const horarios = (state && state.horarios_por_dia) || HORARIOS_PADRAO;

// 1. Hora atual em São Paulo
const nowUtc = new Date();
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo", hour12: false,
  weekday: "short", hour: "2-digit", minute: "2-digit",
}).formatToParts(nowUtc);
const wd = (parts.find(p => p.type === "weekday")?.value || "").toLowerCase().slice(0,3);
const wdMap = { sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sab" };
const diaKey = wdMap[wd] || "seg";
const hh = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
const mm = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
const minutosAgora = hh * 60 + mm;

// 2. Config do dia
const cfg = horarios[diaKey];
if (!cfg || !cfg.enabled) {
  return [{ json: { skipped: "dia desativado", dia: diaKey } }];
}
const ini = toMin(cfg.inicio);
const fim = toMin(cfg.fim);
if (minutosAgora < ini || minutosAgora > fim) {
  return [{ json: { skipped: "fora do horario", dia: diaKey, hora: hh+":"+String(mm).padStart(2,"0"), janela: cfg.inicio+"-"+cfg.fim } }];
}

// 3. Respeita intervalo do dia
const intervaloMin = Math.max(1, Number(cfg.intervalo) || 30);
if (state && state.ultima_execucao) {
  const diffMs = nowUtc.getTime() - new Date(state.ultima_execucao).getTime();
  if (diffMs < intervaloMin * 60000) {
    const restante = Math.ceil((intervaloMin * 60000 - diffMs) / 60000);
    return [{ json: { skipped: "intervalo nao atingido", faltam_min: restante } }];
  }
}

// 4. RODIZIO de categoria SEM estado/memoria: le a propria Data Table a cada execucao.
//    (a) descobre a ULTIMA categoria enviada (linha com sent_at mais recente)
//    (b) manda a PROXIMA categoria do ciclo que tenha produto disponivel.
//    Se a coluna 'categoria' nao existir/estiver vazia em todas as linhas, cai pro modo sequencial.
const COL_CATEGORIA = "categoria";
const normCat = (c) => String(c == null ? "" : c).trim().toLowerCase();
const isMercadoLivre = /mercado/i.test(String(PLATAFORMA || ""));
async function queimaRow(idRow) {
  try {
    await http({
      method: "PATCH",
      url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows/update\`,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
      body: {
        filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: idRow }] },
        data: { sending: true, sent_at: new Date().toISOString() },
      },
      json: true,
    });
  } catch (_) {}
}
function rowValido(item) {
  const link = String((item && item.offerlink) || "").trim();
  if (isMercadoLivre && !/^https?:\\/\\/meli\\.la\\//i.test(link)) return false;
  // Se o scraper antigo regravou produto já enviado, ele pode voltar como
  // sending=false mas com sent_at antigo. Isso é promoção velha: queima e pula.
  const sentRaw = String((item && item.sent_at) || "").trim();
  if (sentRaw) {
    const sentTime = Date.parse(sentRaw);
    if (Number.isFinite(sentTime)) {
      const staleMs = Math.max(12 * 60 * 60000, intervaloMin * 3 * 60000);
      if (nowUtc.getTime() - sentTime > staleMs) return false;
    }
  }
  return true;
}

// 4a. Ultima categoria enviada (sent_at mais recente, sending=true)
let ultimaCat = null;
try {
  const janelaMin = Math.max(180, intervaloMin * 8);
  const cutoff = new Date(nowUtc.getTime() - janelaMin * 60000).toISOString();
  const filtroSent = { type: "and", filters: [
    { columnName: "sending", condition: "eq", value: true },
    { columnName: "sent_at", condition: "gte", value: cutoff },
  ] };
  let sentResp;
  try {
    sentResp = await http({
      method: "GET",
      url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
      qs: { filter: JSON.stringify(filtroSent), sortBy: "sent_at:DESC", limit: 200 },
      headers: { "X-N8N-API-KEY": N8N_KEY },
      json: true,
    });
  } catch (_) {
    sentResp = await http({
      method: "GET",
      url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
      qs: { filter: JSON.stringify(filtroSent), limit: 200 },
      headers: { "X-N8N-API-KEY": N8N_KEY },
      json: true,
    });
  }
  const sentRows = (sentResp && sentResp.data) ? sentResp.data : [];
  let maisRecente = null;
  for (const r of sentRows) {
    const t = Date.parse((r && r.sent_at) || "") || 0;
    if (!maisRecente || t > maisRecente.t) maisRecente = { t, cat: normCat(r[COL_CATEGORIA]) };
  }
  if (maisRecente) ultimaCat = maisRecente.cat;
} catch (_) {}

// 4b. Produtos disponiveis (sending=false)
const filterObj = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: false }] };
const rowsData = await http({
  method: "GET",
  url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
  qs: { filter: JSON.stringify(filterObj), limit: 200 },
  headers: { "X-N8N-API-KEY": N8N_KEY },
  json: true,
});
const disponiveis = (rowsData && rowsData.data) ? rowsData.data : [];
if (disponiveis.length === 0) {
  return [{ json: { skipped: "sem produto novo no data table - aguardando scraper" } }];
}

// Detecta se categoria existe e tem valor em alguma linha
const temCategoria = disponiveis.some(c => normCat(c[COL_CATEGORIA]) !== "");

let row = null;
if (!temCategoria) {
  // Modo sequencial — comportamento antigo
  for (const candidate of disponiveis) {
    if (!rowValido(candidate)) { await queimaRow(candidate.id); continue; }
    row = candidate; break;
  }
} else {
  // Modo rodizio por categoria
  const grupos = {};
  for (const c of disponiveis) {
    const cat = normCat(c[COL_CATEGORIA]) || "_sem_categoria";
    (grupos[cat] = grupos[cat] || []).push(c);
  }
  for (const cat of Object.keys(grupos)) {
    grupos[cat].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  }
  const ciclo = Object.keys(grupos).sort();
  if (ultimaCat && !ciclo.includes(ultimaCat)) ciclo.push(ultimaCat);
  const idxUlt = ultimaCat ? ciclo.indexOf(ultimaCat) : -1;
  const start = idxUlt >= 0 ? idxUlt + 1 : 0;
  for (let k = 0; k < ciclo.length; k++) {
    const cat = ciclo[(start + k) % ciclo.length];
    const lista = grupos[cat] || [];
    let escolhido = null;
    for (const item of lista) {
      if (!rowValido(item)) { await queimaRow(item.id); continue; }
      escolhido = item; break;
    }
    if (escolhido) { row = escolhido; break; }
  }
}
if (!row) {
  return [{ json: { skipped: "sem produto novo no data table - aguardando scraper" } }];
}

// 4c. RESERVA ATOMICA: marca sending=true ANTES de enviar pra evitar que outra execucao
// paralela do cron pegue a mesma linha (corrige envios duplicados).
try {
  await http({
    method: "PATCH",
    url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows/update\`,
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: {
      filter: { type: "and", filters: [
        { columnName: "id", condition: "eq", value: row.id },
        { columnName: "sending", condition: "eq", value: false },
      ] },
      data: { sending: true, sent_at: new Date().toISOString() },
    },
    json: true,
  });
} catch (_) {}

// Confirma que ESSA execucao foi quem reservou (caso outra tenha reservado microssegundos antes)
try {
  const check = await http({
    method: "GET",
    url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
    qs: { filter: JSON.stringify({ type: "and", filters: [{ columnName: "id", condition: "eq", value: row.id }] }), limit: 1 },
    headers: { "X-N8N-API-KEY": N8N_KEY },
    json: true,
  });
  const atual = (check && check.data && check.data[0]) || null;
  const reservadoAgora = atual && atual.sending === true && atual.sent_at && (Date.now() - Date.parse(atual.sent_at)) < 15000;
  if (!reservadoAgora) {
    return [{ json: { skipped: "linha ja reservada por outra execucao - evitando duplicidade" } }];
  }
} catch (_) {}


// 5. Enriquecimento: priceoriginal calculado, link encurtado, frase IA
function fmtBRL(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const priceNum = Number(row.price) || 0;
const discNum = Number(row.pricediscountrate) || 0;
let priceOriginalNum = Number(row.priceoriginal) || 0;
if (!priceOriginalNum && priceNum > 0 && discNum > 0 && discNum < 100) {
  priceOriginalNum = priceNum / (1 - discNum / 100);
}
if (!priceOriginalNum) priceOriginalNum = priceNum;

// Link já vem encurtado como meli.la do scrapper — não reencurta
const shortLink = String(row.offerlink || "");


// Frase curta gerada por IA (Lovable AI / Gemini Flash Lite — sem reasoning) — fallback se falhar
let frase = "OFERTA IMPERDÍVEL";
let fraseDebug = "no-key";
if (LOVABLE_API_KEY) {
  fraseDebug = "called";
  try {
    const aiResp = await http({
      method: "POST",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Authorization": "Bearer " + LOVABLE_API_KEY, "Content-Type": "application/json" },
      body: {
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você é um copy de marketing brasileiro. Gere UMA frase curtíssima em CAIXA ALTA (2 a 4 palavras, sem aspas, sem pontuação final, sem emoji, sem hashtag) ESPECÍFICA para o produto informado — destaque uma qualidade real do produto. Exemplos: ESSE É VERSÁTIL / PRA QUEM AMA CHURRASCO / TÁ MUITO BARATO / DESIGN INCRÍVEL / SÓ HOJE. NUNCA responda apenas 'OFERTA IMPERDÍVEL'. Responda APENAS a frase, nada mais." },
          { role: "user", content: "Produto: " + String(row.productname || "") },
        ],
        max_tokens: 60,
        temperature: 0.95,
      },
      json: true,
      timeout: 12000,
    });
    const txt = String(aiResp && aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message && aiResp.choices[0].message.content || "").trim();
    const cleaned = txt.replace(/["'\`*_#]/g, "").replace(/[\\.!?,;:]+$/g, "").trim().toUpperCase();
    if (cleaned && cleaned.length <= 60) { frase = cleaned; fraseDebug = "ok:" + cleaned; }
    else { fraseDebug = "empty"; }
  } catch (e) { fraseDebug = "err:" + String(e && e.message || e).slice(0, 120); }
}
console.log("FRASE_IA", fraseDebug);

// 6. Monta caption
const caption = TEMPLATE
  .replace(/\\{frase\\}/g, frase)
  .replace(/\\{productname\\}/g, String(row.productname == null ? "" : row.productname))
  .replace(/\\{price\\}/g, fmtBRL(priceNum))
  .replace(/\\{priceoriginal\\}/g, fmtBRL(priceOriginalNum))
  .replace(/\\{pricediscountrate\\}/g, String(discNum || ""))
  .replace(/\\{shopname\\}/g, String(row.shopname == null ? "" : row.shopname))
  .replace(/\\{offerlink\\}/g, shortLink)
  .replace(/\\{imageUrl\\}/g, String(row.imageUrl == null ? "" : row.imageUrl));

// 6. Escolhe grupo aleatorio
const grupo = DESTINOS[Math.floor(Math.random() * DESTINOS.length)];

// 7. Envia via Evolution (tenta sendMedia; se falhar, cai para sendText com link)
let sendData; let sendStatus = 0; let sendErr = null;
const imgUrl = String(row.imageUrl || "").trim();
const hasImg = /^https?:\\/\\//i.test(imgUrl);
async function fetchImageBase64(url) {
  const buf = await http({
    method: "GET",
    url,
    headers: { "user-agent": "Mozilla/5.0", "accept": "image/*,*/*" },
    encoding: "arraybuffer",
    returnFullResponse: false,
  });
  // n8n http helper retorna Buffer quando encoding=arraybuffer
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64");
}
async function tryMediaUrl() {
  return await http({
    method: "POST",
    url: \`\${EVO_URL}/message/sendMedia/\${INSTANCE}\`,
    headers: { "apikey": EVO_KEY, "Content-Type": "application/json" },
    body: { number: grupo, mediatype: "image", mimetype: "image/jpeg", media: imgUrl, caption: caption, fileName: "promo.jpg" },
    json: true,
  });
}
async function tryMediaBase64() {
  const b64 = await fetchImageBase64(imgUrl);
  return await http({
    method: "POST",
    url: \`\${EVO_URL}/message/sendMedia/\${INSTANCE}\`,
    headers: { "apikey": EVO_KEY, "Content-Type": "application/json" },
    body: { number: grupo, mediatype: "image", mimetype: "image/jpeg", media: b64, caption: caption, fileName: "promo.jpg" },
    json: true,
  });
}
async function tryText() {
  return await http({
    method: "POST",
    url: \`\${EVO_URL}/message/sendText/\${INSTANCE}\`,
    headers: { "apikey": EVO_KEY, "Content-Type": "application/json" },
    body: { number: grupo, text: caption + (hasImg ? "\\n\\n" + imgUrl : "") },
    json: true,
  });
}
function errBody(e){ const b = e && e.response && (e.response.body || e.response.data); return typeof b === "string" ? b : JSON.stringify(b || e.message || String(e)); }
if (hasImg) {
  try {
    sendData = await tryMediaUrl();
    sendStatus = 200;
  } catch (e1) {
    const detalheUrl = errBody(e1);
    try {
      sendData = await tryMediaBase64();
      sendStatus = 200;
      sendErr = "sendMedia URL falhou (" + detalheUrl + "), enviado via base64";
    } catch (e2) {
      const detalheB64 = errBody(e2);
      try {
        sendData = await tryText();
        sendStatus = 200;
        sendErr = "sendMedia URL e base64 falharam, enviado como texto. URL: " + detalheUrl + " | Base64: " + detalheB64;
      } catch (e3) {
        sendErr = "Tudo falhou. URL: " + detalheUrl + " | B64: " + detalheB64 + " | Text: " + errBody(e3);
        sendStatus = e3.httpCode || e3.statusCode || 500;
      }
    }
  }
} else {
  try {
    sendData = await tryText();
    sendStatus = 200;
  } catch (e) {
    sendErr = errBody(e);
    sendStatus = e.httpCode || e.statusCode || 500;
  }
}

// 8. Marca como usada (so se enviou OK)
if (sendStatus === 200) {
  try {
    await http({
      method: "PATCH",
      url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows/update\`,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
      body: {
        filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: row.id }] },
        data: { sending: true, sent_at: new Date().toISOString() },
      },
      json: true,
    });
  } catch (_) {}
}

// 9. Atualiza estado do robo (ultima_execucao + total_enviados ou ultimo_erro)
try {
  await http({
    method: "POST",
    url: SCRAPPER_API,
    headers: { "Authorization": "Bearer " + SCRAPPER_SECRET, "Content-Type": "application/json" },
    body: sendStatus === 200
      ? { action: "update_campanha", id: ROBO_ID, total_enviados: 1, intervalo_dia: intervaloMin }
      : { action: "update_campanha", id: ROBO_ID, ultimo_erro: sendErr || "falha envio Evolution", intervalo_dia: intervaloMin },
    json: true,
  });
} catch (_) {}

return [{ json: { sent: row.productname, grupo, status: sendStatus, dia: diaKey, intervalo: intervaloMin, err: sendErr } }];
  `.trim();

  return {
    name: friendlyWorkflowName("ROBO", robo),
    nodes: [
      {
        parameters: {
          rule: {
            interval: [{ field: "cronExpression", expression: "* * * * *" }],
          },
        },
        id: "trigger",
        name: "Schedule",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.1,
        position: [250, 300],
      },
      {
        parameters: {
          language: "javaScript",
          jsCode,
        },
        id: "code",
        name: "Disparar Promo",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [550, 300],
      },
    ],
    connections: {
      Schedule: {
        main: [[{ node: "Disparar Promo", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };
}

function buildDisparoWorkflow(robo: any) {
  // Simples: chama edge function da Lovable que já faz o envio em lote
  const intervalMin = robo.intervalo_min_min ?? 30;
  const jsCode = `
return [{ json: { robo_id: ${JSON.stringify(robo.id)}, note: "disparo flow placeholder" } }];
  `.trim();
  return {
    name: friendlyWorkflowName(robo.campaign_type === "disparo" ? "DISPARO" : "ROBO", robo),
    nodes: [
      {
        parameters: {
          rule: { interval: [{ field: "minutes", minutesInterval: intervalMin }] },
        },
        id: "trigger",
        name: "Schedule",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.1,
        position: [250, 300],
      },
      {
        parameters: { language: "javaScript", jsCode },
        id: "code",
        name: "Disparo",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [550, 300],
      },
    ],
    connections: {
      Schedule: { main: [[{ node: "Disparo", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1" },
  };
}

function buildScrapperWorkflow(job: any) {
  const intervalHours: number = Math.max(1, Number(job.intervalo_horas ?? 6));
  const plataforma: string = job.plataforma;
  const cfg = job.config ?? {};
  const termos: string[] = Array.isArray(cfg.termos) ? cfg.termos : [];
  const categorias: string[] = Array.isArray(cfg.categorias) ? cfg.categorias : [];
  const shopeeAppId = normalizeCredential(cfg.shopee_app_id);
  const shopeeSecret = normalizeCredential(cfg.shopee_secret);
  const shopeePages = Math.max(1, Math.min(20, Number(cfg.shopee_pages ?? 20)));
  const mlCookie = sanitizeMlCredential(cfg.ml_cookie, ["ML_COOKIE", "COOKIE"]);
  const mlCsrf = sanitizeMlCredential(cfg.ml_csrf_token, ["ML_CSRF", "ML_CSRF_TOKEN", "X_CSRF_TOKEN", "CSRF"]);
  const mlAffiliateId = sanitizeMlCredential(cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag, ["ML_AFFILIATE_ID", "ML_AFFILIATE_TAG", "AFFILIATE_ID"]);
  const mlToolId = normalizeCredential(cfg.ml_tool_id);
  const mlPages = Math.max(1, Math.min(20, Number(cfg.ml_pages ?? 10)));
  const mlKeywordsPerRun = Math.max(1, Math.min(10, Number(cfg.ml_keywords_per_run ?? 1)));
  const mlLimitPerPage = Math.max(10, Math.min(50, Number(cfg.ml_limit_per_page ?? 50)));
  const mlDefaultKeyword = String(cfg.ml_default_keyword ?? "eletronicos");
  const mlMinDiscount = Math.max(0, Math.min(99, Number(cfg.ml_min_discount ?? 20)));
  const minCommissionValue = Math.max(0, Number(cfg.min_commission_value ?? 0));
  const filterMode: string = String(cfg.filter_mode ?? "none"); // "sales" | "rating" | "none"
  const minSales = Math.max(0, Number(cfg.min_sales ?? 0));
  const minRating = Math.max(0, Math.min(5, Number(cfg.min_rating ?? 0)));
  const mlDefaultCommissionRate = Math.max(0, Math.min(50, Number(cfg.ml_default_commission_rate ?? 6)));
  const minProducts = Math.max(0, Number(cfg.min_products ?? 0));
  const maxProductsRaw = Number(cfg.max_products ?? 0);
  const maxProducts = maxProductsRaw > 0 ? Math.max(1, maxProductsRaw) : 0; // 0 = sem limite
  const dataTableName: string = job.data_table_name || `${(plataforma || "DATA").toUpperCase()}_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;

  const jsCode = `
const N8N_BASE = ${JSON.stringify(N8N_BASE)};
const N8N_KEY = ${JSON.stringify(N8N_KEY)};
const PLATAFORMA = ${JSON.stringify(plataforma)};
const TERMOS = ${JSON.stringify(termos)};
const CATEGORIAS = ${JSON.stringify(categorias)};
const SHOPEE_APP_ID = ${JSON.stringify(shopeeAppId)};
const SHOPEE_SECRET = ${JSON.stringify(shopeeSecret)};
const SHOPEE_PAGES = ${shopeePages};
const ML_COOKIE = ${JSON.stringify(mlCookie)};
const ML_CSRF = ${JSON.stringify(mlCsrf)};
const ML_AFFILIATE_ID = ${JSON.stringify(mlAffiliateId)};
const ML_TOOL_ID = ${JSON.stringify(mlToolId)};
const ML_PAGES = ${mlPages};
const ML_KEYWORDS_PER_RUN = ${mlKeywordsPerRun};
const ML_LIMIT_PER_PAGE = ${mlLimitPerPage};
const ML_DEFAULT_KEYWORD = ${JSON.stringify(mlDefaultKeyword)};
const ML_MIN_DISCOUNT = ${mlMinDiscount};
const MIN_COMMISSION_VALUE = ${minCommissionValue};
const FILTER_MODE = ${JSON.stringify(filterMode)};
const MIN_SALES = ${minSales};
const MIN_RATING = ${minRating};
const ML_DEFAULT_COMMISSION_RATE = ${mlDefaultCommissionRate};
const MIN_PRODUCTS = ${minProducts};
const MAX_PRODUCTS = ${maxProducts};
const TABLE_NAME = ${JSON.stringify(dataTableName)};
const JOB_ID = ${JSON.stringify(job.id)};
const SCRAPPER_API = ${JSON.stringify(SUPABASE_URL)} + "/functions/v1/scrapper-api";
const SCRAPPER_SECRET = ${JSON.stringify(Deno.env.get("SCRAPPER_API_SECRET") ?? "")};

function passesQualityFilter(sales, rating) {
  if (FILTER_MODE === "sales") return Number(sales || 0) >= MIN_SALES;
  if (FILTER_MODE === "rating") return Number(rating || 0) >= MIN_RATING;
  return true;
}

const http = this.helpers.httpRequest;

// SHA256 puro em JS (mesmo algoritmo do workflow original que funciona)
function sha256(str) {
  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const origLen = bytes.length;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const bitLen = origLen * 8;
  for (let i = 7; i >= 0; i--) bytes.push((Math.floor(bitLen / Math.pow(256, i))) & 0xff);
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const W = new Array(64);
    for (let i = 0; i < 16; i++) W[i] = (bytes[chunk+i*4]<<24)|(bytes[chunk+i*4+1]<<16)|(bytes[chunk+i*4+2]<<8)|bytes[chunk+i*4+3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7,W[i-15])^rotr(18,W[i-15])^(W[i-15]>>>3);
      const s1 = rotr(17,W[i-2])^rotr(19,W[i-2])^(W[i-2]>>>10);
      W[i] = (W[i-16]+s0+W[i-7]+s1)|0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6,e)^rotr(11,e)^rotr(25,e);
      const ch = (e&f)^(~e&g);
      const t1 = (h+S1+ch+K[i]+W[i])|0;
      const S0 = rotr(2,a)^rotr(13,a)^rotr(22,a);
      const mj = (a&b)^(a&c)^(b&c);
      const t2 = (S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H = H.map((v,i)=>(v+[a,b,c,d,e,f,g,h][i])|0);
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}

async function findTableId(name) {
  const tries = ["/data-tables", "/data-tables?includeProject=true"];
  try {
    const projs = await http({ method: "GET", url: \`\${N8N_BASE}/projects\`, headers: { "X-N8N-API-KEY": N8N_KEY }, json: true });
    const list = (projs && (projs.data || projs)) || [];
    for (const p of list) if (p && p.id) tries.push(\`/projects/\${p.id}/data-tables\`);
  } catch (_) {}
  for (const path of tries) {
    try {
      const d = await http({ method: "GET", url: \`\${N8N_BASE}\${path}\`, headers: { "X-N8N-API-KEY": N8N_KEY }, json: true });
      const arr = (d && (d.data || d)) || [];
      const found = (Array.isArray(arr) ? arr : []).find(t => String(t.name || "").trim() === name);
      if (found) return found.id;
    } catch (_) {}
  }
  return null;
}

async function insertRow(tableId, row) {
  return await http({
    method: "POST",
    url: \`\${N8N_BASE}/data-tables/\${tableId}/rows\`,
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: { data: [row] },
    json: true,
  });
}

async function listRows(tableId) {
  const urls = [
    \`\${N8N_BASE}/data-tables/\${tableId}/rows?limit=1000\`,
    \`\${N8N_BASE}/data-tables/\${tableId}/rows\`,
    \`\${N8N_BASE}/data-tables/\${tableId}/rows?take=1000\`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await http({ method: "GET", url, headers: { "X-N8N-API-KEY": N8N_KEY }, json: true });
      const rows = (r && (r.data || r)) || [];
      return Array.isArray(rows) ? rows : [];
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Falha ao listar data table");
}

async function deleteRow(tableId, rowId) {
  const tries = [
    { method: "DELETE", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows/\${rowId}\` },
    { method: "POST", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows/delete\`, body: { filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: rowId }] } } },
    { method: "DELETE", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows?filter=\${encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "id", condition: "eq", value: rowId }] }))}\` },
  ];
  for (const t of tries) {
    try {
      await http({ method: t.method, url: t.url, headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" }, body: t.body, json: true });
      return true;
    } catch (_) {}
  }
  return false;
}

async function shopeeSearch(keyword, page = 1) {
  const url = "https://open-api.affiliate.shopee.com.br/graphql";
  const kw = String(keyword).replace(/"/g, "");
  const query = "{productOfferV2(keyword: \\"" + kw + "\\", limit: 50, page: " + page + ", sortType: 2) {nodes {commissionRate commission imageUrl shopName price priceDiscountRate productLink offerLink productName sales ratingStar}}}";
  const payload = JSON.stringify({ query });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = sha256(SHOPEE_APP_ID + ts + payload + SHOPEE_SECRET);
  const auth = "SHA256 Credential=" + SHOPEE_APP_ID + ", Signature=" + sig + ", Timestamp=" + ts;
  let resp; let httpErr = null;
  try {
    resp = await http({
      method: "POST", url,
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: payload,
    });
  } catch (e) {
    httpErr = { message: e.message || String(e), status: e.httpCode || e.statusCode, body: e.response && (e.response.body || e.response.data) };
  }
  let parsed;
  try { parsed = typeof resp === "string" ? JSON.parse(resp) : resp; } catch (_) { parsed = { rawText: String(resp).slice(0, 800) }; }
  const nodes = (parsed && parsed.data && parsed.data.productOfferV2 && parsed.data.productOfferV2.nodes) || [];
  const appFingerprint = sha256("app:" + SHOPEE_APP_ID).slice(0, 12);
  const secretFingerprint = sha256("secret:" + SHOPEE_SECRET).slice(0, 12);
  return { nodes, apiErrors: parsed && parsed.errors, httpErr, status: httpErr ? httpErr.status : 200, raw: nodes.length ? null : parsed, authDebug: { credentialLength: String(SHOPEE_APP_ID || "").length, secretLength: String(SHOPEE_SECRET || "").length, appFingerprint, secretFingerprint, timestamp: ts, signaturePrefix: sig.slice(0, 8), payloadPrefix: payload.slice(0, 90) } };
}

let total = 0;
let erro = null;
let dupSkipped = 0;
const debug = [];
const JOB_START_MS = Date.now();
const JOB_MAX_MS = 250 * 1000; // limite seguro abaixo do timeout de 300s do n8n
const timeUp = () => (Date.now() - JOB_START_MS) > JOB_MAX_MS;
try {
  const tableId = await findTableId(TABLE_NAME);
  if (!tableId) throw new Error("Data table \\"" + TABLE_NAME + "\\" não encontrada no n8n. Crie-a primeiro.");

  // Cleanup: remove produtos enviados ha mais de 30 dias (lista + deleta por id)
  try {
    const cutoffMs = Date.now() - 30*24*60*60*1000;
    let listed = [];
    try { listed = await listRows(tableId); } catch (_) {}
    const toDelete = (Array.isArray(listed) ? listed : []).filter(r => {
      if (!r || !r.sending) return false;
      const t = r.sent_at ? Date.parse(r.sent_at) : 0;
      return t > 0 && t < cutoffMs;
    });
    let deleted = 0;
    for (const r of toDelete) {
      const tries = [
        { method: "DELETE", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows/\${r.id}\` },
        { method: "POST", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows/delete\`, body: { filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] } } },
        { method: "DELETE", url: \`\${N8N_BASE}/data-tables/\${tableId}/rows?filter=\${encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] }))}\` },
      ];
      let ok = false;
      for (const t of tries) {
        try {
          await http({ method: t.method, url: t.url, headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" }, body: t.body, json: true });
          ok = true; break;
        } catch (_) {}
      }
      if (ok) deleted++;
    }
    if (toDelete.length || deleted) debug.push({ cleanup: { candidates: toDelete.length, deleted } });
  } catch (e) { debug.push({ cleanupErr: e.message || String(e) }); }

  // Dedup: nome exato + similaridade (mesma loja + tokens parecidos no titulo)
  const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const STOPWORDS = new Set(["de","da","do","das","dos","com","sem","para","pra","por","em","no","na","nos","nas","e","ou","a","o","as","os","um","uma","uns","umas","the","and","for","with","of","kit","set","pcs","un","und","ml","cm","mm","kg","g","mah","w","v"]);
  const tokenize = (s) => normName(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const existingNames = new Set();
  const existingEntries = []; // {shop, tokens:Set}
  const isSimilar = (title, shop) => {
    const toks = new Set(tokenize(title));
    if (toks.size === 0) return false;
    const shopKey = normName(shop);
    for (const e of existingEntries) {
      if (!shopKey || e.shop !== shopKey) continue;
      let inter = 0;
      for (const t of toks) if (e.tokens.has(t)) inter++;
      const union = toks.size + e.tokens.size - inter;
      const jaccard = union > 0 ? inter / union : 0;
      if (inter >= 3 || jaccard >= 0.6) return true;
    }
    return false;
  };
  try {
    const all = await listRows(tableId);
    let badMlLinksDeleted = 0;
    const isMlPlatform = PLATAFORMA === "mercado_livre" || PLATAFORMA === "mercadolivre";
    for (const r of (Array.isArray(all) ? all : [])) {
      if (isMlPlatform && r && !r.sending && !/^https?:\\/\\/meli\\.la\\//i.test(String(r.offerlink || ""))) {
        if (r.id && await deleteRow(tableId, r.id)) badMlLinksDeleted++;
        continue;
      }
      const n = normName(r && r.productname);
      if (n) {
        existingNames.add(n);
        existingEntries.push({ shop: normName(r && r.shopname), tokens: new Set(tokenize(r && r.productname)) });
      }
    }
    debug.push({ dedup: { loaded: existingNames.size, badMlLinksDeleted } });
  } catch (e) { debug.push({ dedupErr: e.message || String(e) }); }

  if (PLATAFORMA === "shopee") {
    if (!SHOPEE_APP_ID || !SHOPEE_SECRET) throw new Error("Faltam credenciais Shopee.");
    let keywords = Array.from(new Set([...(TERMOS || []), ...(CATEGORIAS || [])].map((k) => String(k).trim()).filter(Boolean)));
    if (!keywords.length) throw new Error("Defina pelo menos um termo ou categoria.");

    const buckets = keywords.map(kw => ({ kw, nodes: [], page: 1, exhausted: false }));
    
    // Round-robin: 1 produto de cada termo, buscando novas páginas conforme necessário
    outerShopee: while (buckets.some((b) => !b.exhausted || b.nodes.length > 0)) {
      for (const b of buckets) {
        if (MAX_PRODUCTS && total >= MAX_PRODUCTS) { debug.push({ stopped: "max_products reached", total }); break outerShopee; }
        if (timeUp()) { debug.push({ stopped: "time_up", total }); break outerShopee; }
        
        // Se o bucket está vazio, busca a próxima página
        if (b.nodes.length === 0 && !b.exhausted) {
          if (b.page > SHOPEE_PAGES) {
            b.exhausted = true;
            continue;
          }
          const r = await shopeeSearch(b.kw, b.page);
          const sorted = (r.nodes || []).slice().sort((a, b) => {
            const sa = Number(a.sales ?? 0), sb = Number(b.sales ?? 0);
            if (sb !== sa) return sb - sa;
            const ra = Number(a.ratingStar ?? 0), rb = Number(b.ratingStar ?? 0);
            if (rb !== ra) return rb - ra;
            return 0;
          });
          debug.push({ keyword: b.kw, page: b.page, status: r.status, found: sorted.length, apiErrors: r.apiErrors || null, httpErr: r.httpErr || null, raw: r.raw || null, authDebug: r.authDebug || null });
          b.nodes = sorted;
          b.page++;
          if (sorted.length === 0) {
            b.exhausted = true;
            continue;
          }
          // Pequeno delay entre requisições de página para não ser bloqueado
          await new Promise((res) => setTimeout(res, 500));
        }

        if (b.nodes.length === 0) continue;

        const it = b.nodes.shift();
        try {
          const price = Number(it.price ?? it.priceMin ?? 0);
          const commissionRate = Number(it.commissionRate ?? 0);
          const commissionValue = Number(it.commission ?? (price * commissionRate / 100));
          const sales = Number(it.sales ?? 0);
          const rating = Number(it.ratingStar ?? 0);
          const nameKey = normName(it.productName);

          if (nameKey && existingNames.has(nameKey)) { dupSkipped++; debug.push({ skipped: "duplicate", kw: b.kw, page: b.page - 1, item: it.productName }); continue; }
          if (isSimilar(it.productName, it.shopName)) { dupSkipped++; debug.push({ skipped: "similar", kw: b.kw, page: b.page - 1, item: it.productName, shop: it.shopName }); continue; }
          if (commissionValue < MIN_COMMISSION_VALUE) { debug.push({ skipped: "commission<min", kw: b.kw, page: b.page - 1, item: it.productName, commissionValue }); continue; }
          if (!passesQualityFilter(sales, rating)) { debug.push({ skipped: "quality<min", kw: b.kw, page: b.page - 1, item: it.productName, sales, rating }); continue; }

          const discRate = Number(it.priceDiscountRate) || 0;
          const priceOriginal = (price > 0 && discRate > 0 && discRate < 100)
            ? Math.round((price / (1 - discRate / 100)) * 100) / 100
            : price;

          await insertRow(tableId, {
            productname: it.productName,
            price,
            priceoriginal: priceOriginal,
            pricediscountrate: discRate,
            shopname: it.shopName,
            offerlink: it.offerLink,
            imageUrl: it.imageUrl,
            sending: false,
            commission_rate: commissionRate,
            commission_value: commissionValue,
            sales,
            rating,
          });

          if (nameKey) {
            existingNames.add(nameKey);
            existingEntries.push({ shop: normName(it.shopName), tokens: new Set(tokenize(it.productName)) });
          }
          total++;
          const delayMs = Math.floor(Math.random() * (400 - 150 + 1)) + 150;
          await new Promise((res) => setTimeout(res, delayMs));
        } catch (e) {
          debug.push({ insertError: e.message || String(e), item: it.productName });
        }
      }
    }

  } else if (PLATAFORMA === "mercado_livre" || PLATAFORMA === "mercadolivre") {
    if (!ML_AFFILIATE_ID) throw new Error("Faltam credenciais ML (Affiliate ID / matt_word).");
    if (!ML_COOKIE || !ML_CSRF) throw new Error("Faltam credenciais ML (Cookie / x-csrf-token). Edite o job e cole as credenciais.");

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    // ===== Monta lista de queries preservando ordem (termos + categorias) =====
    const slugify = (s) => String(s || "").toLowerCase()
      .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9\\s-]/g, "").trim()
      .replace(/\\s+/g, "-");
    const isCategoryId = (s) => /^MLB\\d+$/i.test(String(s || "").trim());
    // Converte slug ("casa-moveis-e-decoracao") em termo de busca legível
    const slugToTerm = (s) => String(s || "").replace(/-/g, " ").trim();

    const queriesRaw = Array.from(new Set([...(TERMOS || []), ...(CATEGORIAS || [])]
      .map((x) => String(x || "").trim()).filter(Boolean)));
    if (!queriesRaw.length) throw new Error("Defina pelo menos um termo ou categoria no job ML.");


    // (parser HTML removido — agora usamos API pública api.mercadolibre.com)


    // ===== Affiliate link via cookie + csrf (igual ao workflow do user) =====
    let affiliateCookieExpired = false;
    let affiliateSuccessLogged = false;
    async function generateAffiliateLink(permalink){
      const url = String(permalink || "");
      if (!/^https?:\\/\\//i.test(url)) {
        debug.push({ affiliateErr: "INVALID_PERMALINK", permalink: url.slice(0, 180) });
        return null;
      }
      const payload = JSON.stringify({ urls: [url], tag: ML_AFFILIATE_ID });
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await http({
            method: "POST",
            url: "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
            headers: {
              "accept": "application/json, text/plain, */*",
              "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
              "content-type": "application/json",
              "origin": "https://www.mercadolivre.com.br",
              "referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
              "user-agent": UA,
              "cookie": ML_COOKIE,
              "x-csrf-token": ML_CSRF,
            },
            body: payload,
            returnFullResponse: true,
            ignoreHttpStatusErrors: true,
          });
          const status = (resp && (resp.statusCode || resp.status)) || 0;
          const raw = (resp && resp.body !== undefined) ? resp.body : resp;
          let data = raw;
          if (typeof raw === "string") { try { data = JSON.parse(raw); } catch (_) { data = null; } }
          if (status === 401 || status === 403) {
            affiliateCookieExpired = true;
            debug.push({ affiliateErr: "COOKIE_EXPIRED", status });
            return null;
          }
          const shortUrl = (data && data.urls && data.urls[0] && (data.urls[0].short_url || data.urls[0].shortUrl)) || (data && data.short_url) || null;
          if (shortUrl && /^https?:\\/\\/meli\\.la\\//i.test(String(shortUrl))) {
            if (!affiliateSuccessLogged) { debug.push({ affiliateOk: true, sample: shortUrl }); affiliateSuccessLogged = true; }
            return String(shortUrl);
          }
          lastErr = { status, attempt, bodyPreview: typeof raw === "string" ? raw.slice(0, 200) : JSON.stringify(raw || {}).slice(0, 200) };
        } catch (e) {
          lastErr = { attempt, exception: (e && e.message) || String(e) };
        }
        if (attempt < 3) await new Promise((res) => setTimeout(res, 1500));
      }
      debug.push({ affiliateErr: "RETRY_EXHAUSTED", permalink: url.slice(0, 180), lastErr });
      return null;
    }

    // ===== Fetch via HTML do lista.mercadolivre.com.br =====
    // (mesmo método do workflow que o user validou — usa headers de browser e roda no IP do n8n)
    // Para slug/termo: lista.mercadolivre.com.br/<slug>_OrderId_PRICE*DESC_DiscountRange_<min>-99
    // Paginação: _Desde_<offset> (48 itens/página)
    function buildListUrl(q, page){
      const minD = Math.max(1, ML_MIN_DISCOUNT || 10);
      const isCat = isCategoryId(q);
      const slug = isCat ? String(q).trim() : slugify(String(q));
      const base = "https://lista.mercadolivre.com.br/" + slug +
        "_OrderId_PRICE*DESC_DiscountRange_" + String(minD) + "-99";
      if (page <= 1) return base;
      const offset = (page - 1) * 48 + 1;
      return base.replace(/_([A-Z])/, "_Desde_" + offset + "_$1");
    }

    function parseListHtml(html){
      const out = [];
      if (!html || typeof html !== "string") return out;
      const parts = html.split(/<div[^>]*class="[^"]*poly-card[^"]*"/);
      for (let i = 1; i < parts.length; i++) {
        const chunk = parts[i].slice(0, 8000);
        const aMatch = chunk.match(/<a[^>]*class="[^"]*poly-component__title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)</i)
          || chunk.match(/<h3[^>]*>\\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)</i);
        if (!aMatch) continue;
        const href = aMatch[1].replace(/&amp;/g, "&");
        const title = aMatch[2].replace(/\\s+/g, " ").trim();
        if (!title || !href) continue;
        let image = "";
        const imgMatch = chunk.match(/<img[^>]*class="[^"]*poly-component__picture[^"]*"[^>]*>/i)
          || chunk.match(/<img[^>]+>/i);
        if (imgMatch) {
          const ig = imgMatch[0];
          const sSrc = ig.match(/\\bsrc="([^"]+)"/i);
          const dSrc = ig.match(/\\bdata-src="([^"]+)"/i);
          const sSet = ig.match(/\\bsrcset="([^"]+)"/i) || ig.match(/\\bdata-srcset="([^"]+)"/i);
          let pick = (dSrc && dSrc[1]) || (sSrc && sSrc[1]) || "";
          if ((!pick || /data:image/i.test(pick)) && sSet) pick = String(sSet[1]).split(",")[0].trim().split(" ")[0];
          image = String(pick || "").replace(/^http:/, "https:");
        }
        const fractions = [];
        const fre = /andes-money-amount__fraction[^>]*>([\\d\\.]+)</gi;
        let m; while ((m = fre.exec(chunk)) !== null) fractions.push(Number(String(m[1]).replace(/\\./g, "")));
        const cents = [];
        const cre = /andes-money-amount__cents[^>]*>(\\d+)</gi;
        while ((m = cre.exec(chunk)) !== null) cents.push(Number(m[1]) || 0);
        const previousIdx = chunk.search(/andes-money-amount--previous/i);
        let price = 0, priceOriginal = 0;
        if (previousIdx >= 0 && fractions.length >= 2) {
          priceOriginal = fractions[0] + ((cents[0] || 0) / 100);
          price = fractions[1] + ((cents[1] || 0) / 100);
        } else if (fractions.length >= 1) {
          price = fractions[0] + ((cents[0] || 0) / 100);
        }
        let discount = 0;
        const dMatch = chunk.match(/andes-money-amount__discount[^>]*>\\s*(\\d{1,2})\\s*%/i);
        if (dMatch) discount = Number(dMatch[1]) || 0;
        if (!discount && priceOriginal > price && price > 0) {
          discount = Math.round((1 - price / priceOriginal) * 100);
        }
        if (!priceOriginal && discount > 0 && price > 0 && discount < 100) {
          priceOriginal = Math.round((price / (1 - discount / 100)) * 100) / 100;
        }
        out.push({ title, href, image, price, priceOriginal, discount });
      }
      return out;
    }

    async function fetchListPage(q, page){
      const url = buildListUrl(q, page);
      try {
        const resp = await http({
          method: "GET", url,
          headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "accept-encoding": "gzip, deflate, br",
            "user-agent": UA,
            "upgrade-insecure-requests": "1",
            "sec-ch-ua": '"Chromium";v="141", "Not?A_Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "referer": "https://www.mercadolivre.com.br/",
            "cookie": ML_COOKIE,
          },
          returnFullResponse: true,
          ignoreHttpStatusErrors: true,
          followRedirect: true,
        });
        const status = (resp && (resp.statusCode || resp.status)) || 0;
        const html = (resp && resp.body !== undefined) ? String(resp.body || "") : String(resp || "");
        const finalUrl = (resp && (resp.url || (resp.request && resp.request.uri && resp.request.uri.href))) || url;
        const isChallenge = /account-verification|\\/jms\\/mlb\\/lgz\\/login/i.test(String(finalUrl)) || /account-verification/i.test(html);
        const items = parseListHtml(html);
        return { status, items, url, err: isChallenge ? "BOT_CHALLENGE (redirecionado p/ account-verification — cookie ML inválido/expirado)" : null, htmlLen: html.length, finalUrl };
      } catch (e) {
        return { status: 0, items: [], url, err: (e && e.message) || String(e), htmlLen: 0 };
      }
    }

    // 1) Coleta candidatos por query
    const buckets = [];
    for (const q of queriesRaw) {
      if (timeUp()) { debug.push({ stopped: "time_up_fetch", total }); break; }
      const items = [];
      for (let page = 1; page <= ML_PAGES; page++) {
        if (timeUp()) break;
        const r = await fetchListPage(q, page);
        debug.push({ query: q, page, url: r.url, status: r.status, htmlLen: r.htmlLen, found: r.items.length, err: r.err });
        for (const p of r.items) {
          if (ML_MIN_DISCOUNT > 0 && (p.discount || 0) < ML_MIN_DISCOUNT) continue;
          items.push(p);
        }
        if (r.items.length === 0) break;
        await new Promise((res) => setTimeout(res, 400 + Math.floor(Math.random() * 600)));
      }
      items.sort((a, b) => (b.discount - a.discount) || ((b.priceOriginal || 0) - (a.priceOriginal || 0)));
      buckets.push({ q, items });
    }




    // 2) Round-robin: 1 produto por query/categoria, ciclando até esgotar/atingir limite
    outerML: while (buckets.some((b) => b.items.length > 0)) {
      for (const b of buckets) {
        if (!b.items.length) continue;
        if (MAX_PRODUCTS && total >= MAX_PRODUCTS) { debug.push({ stopped: "max_products", total }); break outerML; }
        if (timeUp()) { debug.push({ stopped: "time_up", total }); break outerML; }

        const it = b.items.shift();
        const title = String(it.title || "");
        const price = Number(it.price || 0);
        if (!price) { debug.push({ skipped: "no_price", q: b.q, title }); continue; }
        const priceOriginal = Number(it.priceOriginal || price);
        const discount = Number(it.discount || (priceOriginal > price ? Math.round((1 - price/priceOriginal)*100) : 0));
        if (ML_MIN_DISCOUNT > 0 && discount < ML_MIN_DISCOUNT) { debug.push({ skipped: "discount<min", q: b.q, title, discount }); continue; }

        const nameKey = normName(title);
        if (nameKey && existingNames.has(nameKey)) { dupSkipped++; continue; }
        if (isSimilar(title, "Mercado Livre")) { dupSkipped++; debug.push({ skipped: "similar", q: b.q, title }); continue; }

        const commissionRate = ML_DEFAULT_COMMISSION_RATE;
        const commissionValue = Number((price * commissionRate / 100).toFixed(2));
        if (commissionValue < MIN_COMMISSION_VALUE) { debug.push({ skipped: "commission<min", q: b.q, title, commissionValue }); continue; }

        // Limpa URL: remove tracking de clique e querystring
        let rawLink = String(it.href || "");
        const clickMatch = rawLink.match(/click1\\.mercadolivre\\.com\\.br\\/mclics\\/[^\\/]+\\/(https?:\\/\\/[^\\s\"]+)/i);
        if (clickMatch) { try { rawLink = decodeURIComponent(clickMatch[1]); } catch (_) {} }
        rawLink = rawLink.split("#")[0].split("?")[0];
        if (!/^https?:\\/\\//i.test(rawLink)) { debug.push({ skipped: "bad_url", q: b.q, title, rawLink }); continue; }

        const offer = await generateAffiliateLink(rawLink);
        if (!offer) {
          if (affiliateCookieExpired) { debug.push({ stopped: "cookie_expired" }); break outerML; }
          continue;
        }

        try {
          await insertRow(tableId, {
            productname: title,
            price,
            priceoriginal: priceOriginal,
            pricediscountrate: discount,
            shopname: "Mercado Livre",
            offerlink: offer,
            imageUrl: String(it.image || ""),
            sending: false,
            commission_rate: commissionRate,
            commission_value: commissionValue,
            sales: 0,
            rating: 0,
          });
          if (nameKey) {
            existingNames.add(nameKey);
            existingEntries.push({ shop: normName("Mercado Livre"), tokens: new Set(tokenize(title)) });
          }
          total++;
          await new Promise((res) => setTimeout(res, 300 + Math.floor(Math.random() * 500)));
        } catch (e) {
          debug.push({ insertError: (e && e.message) || String(e), item: title });
        }
      }
    }

    if (affiliateCookieExpired && total === 0) {
      erro = "Cookie/CSRF do Mercado Livre expirou. Atualize as credenciais no job.";
    } else if (total === 0) {
      erro = erro || "Nenhum produto coletado. Verifique os termos/categorias e se as páginas da listagem retornaram cards (status 200).";
    }
  } else {
    throw new Error("Plataforma " + PLATAFORMA + " ainda não implementada no scrapper n8n.");
  }
} catch (e) {
  erro = e.message || String(e);
}

if (!erro && MIN_PRODUCTS > 0 && total < MIN_PRODUCTS) {
  erro = "Apenas " + total + " produtos coletados (mínimo configurado: " + MIN_PRODUCTS + "). Afrouxe os filtros ou aumente termos/páginas.";
}

const affiliateErrors = (debug || []).filter(function(d){ return d && d.affiliateErr; }).length;

try {
  await http({
    method: "POST",
    url: SCRAPPER_API,
    headers: { "Authorization": "Bearer " + SCRAPPER_SECRET, "Content-Type": "application/json" },
    body: { action: "update_job", id: JOB_ID, ultima_qtd: total, ultimo_erro: erro, ultima_affiliate_errors: affiliateErrors },
    json: true,
  });
} catch (_) {}

return [{ json: { total, erro, table: TABLE_NAME, dupSkipped, debug } }];
  `.trim();

  return {
    name: friendlyWorkflowName("SCRAPPER", job),
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "cronExpression", expression: (job.agendamento_cron && String(job.agendamento_cron).trim()) || "0 10 * * *" }] } },
        id: "trigger",
        name: "Schedule",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.1,
        position: [250, 300],
      },
      {
        parameters: { language: "javaScript", jsCode },
        id: "code",
        name: "Scrap",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [550, 300],
      },
    ],
    connections: { Schedule: { main: [[{ node: "Scrap", type: "main", index: 0 }]] } },
    settings: { executionOrder: "v1" },
  };
}

// ============================================================================
// buildDupWorkflow — workflow n8n para espelhamento de grupo (DUP).
// Trigger: webhook (path = dup-{shortJobId}). Recebe payload da Evolution
// reencaminhado pelo dup-dispatcher. Em UM Code node faz:
//   1. parse do payload Evolution → texto + imageUrl
//   2. parse da mensagem de oferta → título, preço, cupom, link bruto
//   3. segue redirects do link (meli.la → mercadolivre.com.br/...)
//   4. chama API de afiliado ML com as credenciais do job → meli.la com a tag
//      do usuário
//   5. insere linha na data table do n8n (mesmas colunas do scrapper)
// ============================================================================
function dupWebhookPath(jobId: string): string {
  return `dup-${String(jobId).slice(0, 8)}`;
}

function buildDupWorkflow(job: any) {
  const cfg = job.config ?? {};
  const mlCookie = sanitizeMlCredential(cfg.ml_cookie, ["ML_COOKIE", "COOKIE"]);
  const mlCsrf = sanitizeMlCredential(cfg.ml_csrf_token, ["ML_CSRF", "ML_CSRF_TOKEN", "X_CSRF_TOKEN", "CSRF"]);
  const mlAffiliateId = sanitizeMlCredential(cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag, ["ML_AFFILIATE_ID", "ML_AFFILIATE_TAG", "AFFILIATE_ID"]);
  const grupoOrigemJid = String(job.grupo_origem_jid ?? "");
  const dataTableName: string = job.data_table_name || `DUP_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;
  const webhookPath = dupWebhookPath(job.id);

  const jsCode = `
const N8N_BASE = ${JSON.stringify(N8N_BASE)};
const N8N_KEY = ${JSON.stringify(N8N_KEY)};
const ML_COOKIE = ${JSON.stringify(mlCookie)};
const ML_CSRF = ${JSON.stringify(mlCsrf)};
const ML_AFFILIATE_ID = ${JSON.stringify(mlAffiliateId)};
const GRUPO_JID = ${JSON.stringify(grupoOrigemJid)};
const TABLE_NAME = ${JSON.stringify(dataTableName)};
const JOB_ID = ${JSON.stringify(job.id)};
const SCRAPPER_API = ${JSON.stringify(SUPABASE_URL)} + "/functions/v1/scrapper-api";
const SCRAPPER_SECRET = ${JSON.stringify(Deno.env.get("SCRAPPER_API_SECRET") ?? "")};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const http = this.helpers.httpRequest;

function asText(v) { return typeof v === "string" ? v : ""; }
function parseBrl(raw) {
  const c = String(raw).replace(/\\s/g, "").replace(/\\./g, "").replace(",", ".");
  const n = Number(c); return Number.isFinite(n) ? n : 0;
}
function stripMd(s) { return String(s || "").replace(/[*_~\`]+/g, "").trim(); }
function parseOffer(text) {
  if (!text) return null;
  const linkM = text.match(/https?:\\/\\/[^\\s)]+/i);
  if (!linkM) return null;
  const offerlink = linkM[0].replace(/[.,;:!?]+$/, "");
  let price = 0;
  const porM = text.match(/por\\s*R\\$\\s*([\\d.]+,\\d{2})/i);
  if (porM) price = parseBrl(porM[1]);
  if (!price) { const m = text.match(/R\\$\\s*([\\d.]+,\\d{2})/i); if (m) price = parseBrl(m[1]); }
  let priceoriginal = 0;
  const deM = text.match(/de\\s*~?R\\$\\s*([\\d.]+,\\d{2})~?/i);
  if (deM) priceoriginal = parseBrl(deM[1]);
  if (!priceoriginal) priceoriginal = price;
  const pricediscountrate = (priceoriginal > 0 && price > 0 && priceoriginal > price)
    ? Math.round((1 - price / priceoriginal) * 100) : 0;
  let cupom = null;
  const cM = text.match(/cupom[:\\s]+\\*?([A-Z0-9_-]{3,30})\\*?/i);
  if (cM) cupom = cM[1].toUpperCase();
  let productname = "";
  const lines = text.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
  // 1) linha em *negrito*
  for (const l of lines) {
    const m = l.match(/^[^A-Za-z0-9]*\\*(.+?)\\*\\s*$/);
    if (m) { productname = stripMd(m[1]); break; }
  }
  // 2) primeira linha útil (sem link, preço, cupom)
  if (!productname) {
    for (const l of lines) {
      if (/https?:/i.test(l)) continue;
      if (/^R\\$/i.test(l) || /^por\\s+R\\$/i.test(l) || /^de\\s+R\\$/i.test(l)) continue;
      if (/cupom/i.test(l)) continue;
      if (/^[\\d%\\s.,-]+$/.test(l)) continue;
      const cl = stripMd(l).replace(/^[\\s•·\\-–—:]+/, "").trim();
      if (cl.length >= 4) { productname = cl; break; }
    }
  }
  // 3) primeira linha qualquer
  if (!productname && lines.length) {
    const cl = stripMd(lines[0]).replace(/^[\\s•·\\-–—:]+/, "").trim();
    if (cl.length >= 3) productname = cl;
  }
  if (!productname) productname = "Oferta";
  return { productname: productname.slice(0, 250), price, priceoriginal, pricediscountrate, offerlink, cupom };
}

function extract(payload) {
  const body = (payload && payload.body) || payload || {};
  const data = body.data || {};
  const msg = Array.isArray(data.messages) ? data.messages[0] : data;
  if (!msg) return null;
  const key = msg.key || {};
  const remoteJid = asText(key.remoteJid) || asText(msg.remoteJid) || asText(msg.chatId);
  if (!remoteJid || remoteJid !== GRUPO_JID) return null;
  if (key.fromMe || msg.fromMe || msg.messageStubType) return null;
  const text = asText(msg.message && msg.message.conversation)
    || asText(msg.message && msg.message.extendedTextMessage && msg.message.extendedTextMessage.text)
    || asText(msg.message && msg.message.imageMessage && msg.message.imageMessage.caption)
    || asText(msg.message && msg.message.videoMessage && msg.message.videoMessage.caption)
    || asText(msg.text) || asText(msg.body);
  const imageUrl = asText(msg.message && msg.message.imageMessage && msg.message.imageMessage.url) || null;
  return { text: (text || "").trim(), imageUrl, remoteJid };
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function decodeMlEscapes(s) {
  return htmlDecode(String(s || ""))
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u003F/gi, "?")
    .replace(/\\u0025/gi, "%")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}
function unwrapTrackedUrl(u) {
  let s = decodeMlEscapes(String(u || "").trim());
  const paramM = s.match(/[?&](?:url|go)=([^&]+)/i);
  if (paramM) { try { s = decodeURIComponent(paramM[1]); } catch (_) {} }
  const clickM = s.match(/click1\\.mercadolivre\\.com\\.br\\/mclics\\/[^\\/]+\\/(https?:\\/\\/[^\\s"']+)/i);
  if (clickM) { try { s = decodeURIComponent(clickM[1]); } catch (_) { s = clickM[1]; } }
  return decodeMlEscapes(s);
}
function itemIdFromText(value) {
  const decoded = decodeMlEscapes(value);
  const variants = [decoded];
  try { variants.push(decodeURIComponent(decoded)); } catch (_) {}
  for (const text of variants) {
    const m = text.match(/(?:item_id[:=]|item_id%3A|wid=|\\/MLB-?|"id"\\s*:\\s*")(MLB-?\\d+)/i);
    if (m) return "MLB" + String(m[1]).replace(/\D/g, "");
  }
  return null;
}
function sanitizeProductUrl(u) {
  let s = unwrapTrackedUrl(u);
  if (/^\\/\\//.test(s)) s = "https:" + s;
  try {
    const url = new URL(s, "https://www.mercadolivre.com.br");
    url.hash = "";
    const itemId = itemIdFromText(url.toString());
    const pdpFilters = url.searchParams.get("pdp_filters") || "";
    url.search = "";
    if (itemId && /item_id\\s*:/i.test(pdpFilters)) url.searchParams.set("pdp_filters", "item_id:" + itemId);
    return url.toString();
  } catch (_) {
    return s.split("#")[0].split("?")[0];
  }
}
function isMlProductUrl(url) {
  const s = String(url || "");
  return /\\/p\\/MLB\\d+/i.test(s)
    || /\\/up\\/MLBU\\d+/i.test(s)
    || /produto\\.mercadolivre\\.com\\.br\\/MLB-?\\d+/i.test(s)
    || /\\/MLB-?\\d+/i.test(s)
    || !!itemIdFromText(s);
}
function extractProductUrlFromHtml(html, baseUrl) {
  const raw = String(html || "");
  const featuredStart = raw.indexOf('"id":"card-featured"');
  const featured = featuredStart >= 0 ? raw.slice(featuredStart, featuredStart + 80000) : raw.slice(0, 120000);
  const actionRe = /"id"\\s*:\\s*"show_product"[\\s\\S]{0,1600}?"url"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)"/gi;
  let a;
  while ((a = actionRe.exec(featured))) {
    try {
      const candidate = sanitizeProductUrl(new URL(decodeMlEscapes(a[1]), baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch (_) {}
  }
  const metaRe = /"metadata"\\s*:\\s*\{[\\s\\S]{0,1200}?"id"\\s*:\\s*"(MLB\\d+)"[\\s\\S]{0,1200}?"url"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)"[\\s\\S]{0,1200}?"url_params"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/i;
  const metaM = featured.match(metaRe);
  if (metaM) {
    const url = decodeMlEscapes(metaM[2]);
    const params = decodeMlEscapes(metaM[3] || ("?pdp_filters=item_id:" + metaM[1]));
    try {
      const candidate = sanitizeProductUrl(new URL(url + params, baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch (_) {}
    return "https://produto.mercadolivre.com.br/" + metaM[1].replace(/^MLB/i, "MLB-") + "-_JM";
  }
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(raw))) {
    const candidate = sanitizeProductUrl(m[1]);
    if (isMlProductUrl(candidate)) return candidate;
  }
  const productM = raw.match(/product_id["']?\\s*[:=]\\s*["'](MLB\\d+)["']/i);
  if (productM) return "https://www.mercadolivre.com.br/p/" + productM[1];
  const refreshM = raw.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\\s]+)/i);
  if (refreshM) {
    try {
      const candidate = sanitizeProductUrl(new URL(htmlDecode(refreshM[1]), baseUrl).toString());
      if (isMlProductUrl(candidate)) return candidate;
    } catch (_) {}
  }
  const canM = raw.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canM) {
    const candidate = sanitizeProductUrl(canM[1]);
    if (isMlProductUrl(candidate)) return candidate;
  }
  return null;
}
async function itemPermalink(itemId) {
  if (!itemId) return null;
  try {
    const r = await fetch("https://api.mercadolibre.com/items/" + String(itemId).replace(/-/g, ""));
    if (!r.ok) return null;
    const data = await r.json();
    const permalink = typeof data.permalink === "string" ? sanitizeProductUrl(data.permalink) : "";
    return isMlProductUrl(permalink) ? permalink : null;
  } catch (_) { return null; }
}

async function resolveFinalUrl(startUrl) {
  const first = sanitizeProductUrl(startUrl);
  if (isMlProductUrl(first)) return (await itemPermalink(itemIdFromText(first))) || first;

  // 1) segue redirects, mas não aceita /social com afiliado antigo como URL final.
  // A página intermediária contém o href real do produto no card/botão.
  try {
    const r = await fetch(startUrl, {
      method: "GET", redirect: "follow",
      headers: { "User-Agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
    });
    const finalUrl = r.url || startUrl;
    const html = await r.text().catch(() => "");
    const productFromHtml = extractProductUrlFromHtml(html, finalUrl);
    if (productFromHtml) return (await itemPermalink(itemIdFromText(productFromHtml))) || productFromHtml;
    const cleanedFinal = sanitizeProductUrl(finalUrl);
    if (isMlProductUrl(cleanedFinal)) return (await itemPermalink(itemIdFromText(cleanedFinal))) || cleanedFinal;
  } catch (_) {}

  // 2) fallback: chain manual via httpRequest e lê o HTML do último destino.
  let cur = startUrl;
  for (let i = 0; i < 8; i++) {
    let resp = null;
    try {
      resp = await http({
        method: "GET", url: cur,
        followRedirect: false, returnFullResponse: true,
        headers: { "User-Agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
      });
    } catch (e) {
      resp = (e && e.response) || (e && e.cause && e.cause.response) || null;
    }
    if (!resp) break;
    const status = resp.statusCode || resp.status || 0;
    if (status >= 300 && status < 400) {
      const h = resp.headers || {};
      const loc = h.location || h.Location;
      if (!loc) break;
      try { cur = (new URL(loc, cur)).toString(); } catch (_) { cur = loc; }
      continue;
    }
    const raw = resp.body !== undefined ? resp.body : resp;
    const html = typeof raw === "string" ? raw : JSON.stringify(raw || "");
    const productFromHtml = extractProductUrlFromHtml(html, cur);
    if (productFromHtml) return (await itemPermalink(itemIdFromText(productFromHtml))) || productFromHtml;
    break;
  }
  const cleanedCur = sanitizeProductUrl(cur);
  return (await itemPermalink(itemIdFromText(cleanedCur))) || cleanedCur;
}

async function generateAffiliate(permalink) {
  if (!ML_COOKIE || !ML_CSRF || !ML_AFFILIATE_ID) return null;
  // NUNCA aceitar meli.la como entrada — precisa ser a URL real do produto
  if (/^https?:\\/\\/meli\\.la\\//i.test(permalink)) return null;
  const url = "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink";
  const payload = { urls: [permalink], tag: ML_AFFILIATE_ID };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await http({
        method: "POST", url,
        headers: {
          "accept": "application/json, text/plain, */*",
          "accept-language": "pt-BR,pt;q=0.9",
          "content-type": "application/json",
          "origin": "https://www.mercadolivre.com.br",
          "referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
          "user-agent": UA,
          "cookie": ML_COOKIE,
          "x-csrf-token": ML_CSRF,
        },
        body: payload, json: true, returnFullResponse: true,
      });
      const status = r.statusCode || r.status || 200;
      if (status === 401 || status === 403) return null;
      const data = r.body || r;
      const short = (data && data.urls && data.urls[0] && (data.urls[0].short_url || data.urls[0].shortUrl)) || data.short_url;
      if (short && /^https?:\\/\\/meli\\.la\\//i.test(String(short))) return String(short);
    } catch (_) {}
    if (attempt < 3) await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

async function fetchJsonSafe(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "accept-language": "pt-BR,pt;q=0.9" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
function pickMeta(html, key) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\\']' + key + '["\\'][^>]+content=["\\']([^"\\']+)["\\']', 'i');
  const m = String(html || "").match(re);
  return m ? htmlDecode(m[1]).trim() : "";
}
function parseHtmlPrice(html, keys) {
  const raw = String(html || "");
  for (const key of keys) {
    const re = new RegExp('["\\']' + key + '["\\']\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)', 'i');
    const m = raw.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}
async function enrichProduct(productUrl, fallback, eventImageUrl) {
  const info = {
    productname: String(fallback.productname || "Oferta").trim(),
    price: Number(fallback.price) || 0,
    priceoriginal: Number(fallback.priceoriginal) || 0,
    pricediscountrate: Number(fallback.pricediscountrate) || 0,
    shopname: "",
    imageUrl: eventImageUrl || "",
    sales: 0,
    rating: 0,
    cupom: fallback.cupom || null,
  };
  const itemId = itemIdFromText(productUrl);
  const item = itemId ? await fetchJsonSafe("https://api.mercadolibre.com/items/" + String(itemId).replace(/-/g, "")) : null;
  if (item) {
    if (item.title) info.productname = String(item.title).trim();
    if (Number(item.price) > 0) info.price = Number(item.price);
    if (Number(item.original_price) > 0) info.priceoriginal = Number(item.original_price);
    const pic = (Array.isArray(item.pictures) && item.pictures[0] && (item.pictures[0].secure_url || item.pictures[0].url)) || item.secure_thumbnail || item.thumbnail;
    if (pic) info.imageUrl = String(pic).replace(/^http:\\/\\//i, "https://");
    if (Number(item.sold_quantity) > 0) info.sales = Number(item.sold_quantity);
    if (item.official_store_name) info.shopname = String(item.official_store_name).trim();
    if (!info.shopname && item.seller_id) {
      const seller = await fetchJsonSafe("https://api.mercadolibre.com/users/" + item.seller_id);
      info.shopname = String((seller && (seller.nickname || (seller.eshop && seller.eshop.nick_name))) || "").trim();
    }
    const reviews = item.id ? await fetchJsonSafe("https://api.mercadolibre.com/reviews/item/" + item.id) : null;
    const avg = Number(reviews && (reviews.rating_average || (reviews.rating && reviews.rating.average)));
    if (Number.isFinite(avg) && avg > 0) info.rating = avg;
  }
  // HTML scraping (sempre tenta, pra preencher gaps e capturar CUPOM)
  try {
    const r = await fetch(productUrl, { headers: { "User-Agent": UA, "accept-language": "pt-BR,pt;q=0.9" } });
    const html = await r.text();
    const ogTitle = pickMeta(html, "og:title").replace(/\\s*\\|\\s*MercadoLivre.*$/i, "").trim();
    const ogImage = pickMeta(html, "og:image:secure_url") || pickMeta(html, "og:image");
    if (ogTitle && (!info.productname || info.productname === "Oferta")) info.productname = ogTitle;
    if (ogImage && !info.imageUrl) info.imageUrl = ogImage.replace(/^http:\\/\\//i, "https://");
    // Preço/original via JSON embutido
    const htmlPrice = parseHtmlPrice(html, ["price", "amount", "price_amount"]);
    const htmlOriginal = parseHtmlPrice(html, ["original_price", "originalPrice", "was_price", "regular_price"]);
    if (htmlPrice > 0 && (!info.price || htmlPrice < info.price)) info.price = htmlPrice;
    if (htmlOriginal > 0 && htmlOriginal >= info.price) info.priceoriginal = htmlOriginal;
    // Loja: tenta vários campos
    if (!info.shopname) {
      const sellerM = html.match(/["'](?:seller_name|sellerName|official_store_name|officialStoreName|nickname|store_name|storeName)["']\\s*:\\s*["']([^"']{2,80})["']/i);
      if (sellerM) info.shopname = decodeMlEscapes(sellerM[1]).trim();
    }
    if (!info.shopname) {
      const m2 = html.match(/Vendido por[^<]{0,40}<[^>]+>\\s*([^<]{2,80})</i)
        || html.match(/<a[^>]+class=["'][^"']*(?:ui-seller-info|ui-pdp-seller__link-trigger)[^"']*["'][^>]*>([^<]{2,80})</i);
      if (m2) info.shopname = htmlDecode(m2[1]).trim();
    }
    // CUPOM: padrões comuns no HTML do ML
    if (!info.cupom) {
      const couponPatterns = [
        /["'](?:coupon_code|couponCode|discount_coupon|coupon)["']\\s*:\\s*["']([A-Z0-9_-]{3,30})["']/i,
        /Use\\s+o\\s+cupom[^A-Z0-9]{0,20}([A-Z0-9_-]{4,30})/i,
        /cupom[^A-Z0-9]{0,20}<[^>]*>\\s*([A-Z0-9_-]{4,30})\\s*</i,
        /cupom[^A-Z0-9]{0,20}([A-Z]{3,}[A-Z0-9_-]{1,27})/i,
      ];
      for (const re of couponPatterns) {
        const m = html.match(re);
        if (m && m[1] && m[1].toUpperCase() !== "CUPOM") { info.cupom = m[1].toUpperCase(); break; }
      }
    }
  } catch (_) {}
  if (!info.priceoriginal || info.priceoriginal < info.price) info.priceoriginal = info.price;
  info.pricediscountrate = (info.priceoriginal > 0 && info.price > 0 && info.priceoriginal > info.price)
    ? Math.round((1 - info.price / info.priceoriginal) * 100)
    : 0;
  return info;
}

async function findTableId(name) {
  const tries = ["/data-tables", "/data-tables?includeProject=true"];
  try {
    const projs = await http({ method: "GET", url: \`\${N8N_BASE}/projects\`, headers: { "X-N8N-API-KEY": N8N_KEY }, json: true });
    const list = (projs && (projs.data || projs)) || [];
    for (const p of list) if (p && p.id) tries.push(\`/projects/\${p.id}/data-tables\`);
  } catch (_) {}
  for (const path of tries) {
    try {
      const d = await http({ method: "GET", url: \`\${N8N_BASE}\${path}\`, headers: { "X-N8N-API-KEY": N8N_KEY }, json: true });
      const arr = (d && (d.data || d)) || [];
      const found = (Array.isArray(arr) ? arr : []).find(t => String(t.name || "").trim() === name);
      if (found) return found.id;
    } catch (_) {}
  }
  return null;
}

const debug = [];
let inserted = 0;
let erro = null;
try {
  const payload = $input.first().json;
  const ev = extract(payload);
  if (!ev) { debug.push({ skipped: "no event / wrong jid" }); }
  else if (!ev.text) { debug.push({ skipped: "no text", remoteJid: ev.remoteJid }); }
  else {
    const offer = parseOffer(ev.text);
    if (!offer) { debug.push({ skipped: "parse failed", preview: ev.text.slice(0, 120) }); }
    else {
      const tableId = await findTableId(TABLE_NAME);
      if (!tableId) throw new Error("Data table \\"" + TABLE_NAME + "\\" não encontrada no n8n.");

      // Resolve link real do produto e converte para a MINHA tag de afiliado.
      // Nunca grava meli.la de terceiros — se algo falhar, erro.
      const original = offer.offerlink;
      const isML = /(?:^|\\.)mercadolivre\\.com\\.br|mercadolibre\\.com|meli\\.la/i.test(original);
      if (!isML) throw new Error("link não é Mercado Livre: " + original);

      const realUrl = await resolveFinalUrl(original);
      debug.push({ realUrl });
      if (/^https?:\\/\\/meli\\.la\\//i.test(realUrl)) {
        throw new Error("não conseguiu expandir meli.la: " + original);
      }
      if (!isMlProductUrl(realUrl)) {
        throw new Error("link resolvido ainda não é produto ML: " + realUrl);
      }
      // limpa tag de terceiros, mas preserva pdp_filters=item_id quando existir;
      // isso evita cair em outro anúncio/variação do mesmo catálogo.
      const clean = sanitizeProductUrl(realUrl);
      debug.push({ cleanUrl: clean });

      const myAff = await generateAffiliate(clean);
      if (!myAff) throw new Error("createLink falhou (cookie/csrf/affiliate_id?) p/ " + clean);
      const finalLink = myAff;
      debug.push({ myAffiliate: finalLink });

      const product = await enrichProduct(clean, offer, ev.imageUrl || "");
      debug.push({ enriched: { title: product.productname, price: product.price, original: product.priceoriginal, shop: product.shopname, cupom: product.cupom } });

      const finalCupom = product.cupom || offer.cupom || null;
      const row = {
        productname: product.productname + (finalCupom ? " | Cupom: " + finalCupom : ""),
        price: product.price || 0,
        priceoriginal: product.priceoriginal || 0,
        pricediscountrate: product.pricediscountrate || 0,
        shopname: product.shopname || "",
        offerlink: finalLink,
        imageUrl: product.imageUrl || "",
        sending: false,
        commission_rate: 0,
        commission_value: 0,
        sales: product.sales || 0,
        rating: product.rating || 0,
      };
      try {
        await http({
          method: "POST",
          url: \`\${N8N_BASE}/data-tables/\${tableId}/rows\`,
          headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
          body: { data: [row] }, json: true,
        });
        inserted = 1;
        debug.push({ inserted: row.productname.slice(0, 80) });
      } catch (e) {
        throw new Error("insert row: " + (e && e.message ? e.message : String(e)));
      }
    }
  }
} catch (e) {
  erro = e && e.message ? e.message : String(e);
}

try {
  await http({
    method: "POST", url: SCRAPPER_API,
    headers: { "Authorization": "Bearer " + SCRAPPER_SECRET, "Content-Type": "application/json" },
    body: { action: "update_job", id: JOB_ID, ultima_qtd: inserted, ultimo_erro: erro },
    json: true,
  });
} catch (_) {}

return [{ json: { inserted, erro, table: TABLE_NAME, debug } }];
  `.trim();

  return {
    name: friendlyWorkflowName("SCRAPPER", { ...job, plataforma: "DUP" }),
    nodes: [
      {
        parameters: {
          httpMethod: "POST",
          path: webhookPath,
          responseMode: "onReceived",
          options: {},
        },
        id: "trigger",
        name: "DUP Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [250, 300],
        webhookId: webhookPath,
      },
      {
        parameters: { language: "javaScript", jsCode },
        id: "code",
        name: "Process",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [550, 300],
      },
    ],
    connections: { "DUP Webhook": { main: [[{ node: "Process", type: "main", index: 0 }]] } },
    settings: { executionOrder: "v1" },
  };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!N8N_BASE) throw new Error("N8N_BASE_URL não configurada");
    const body = await req.json();
    const action: string = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "list_datatables") {
      const marketplace: string = body?.marketplace;
      const prefix = MARKETPLACE_PREFIX[marketplace];
      if (!prefix) return j({ error: "marketplace inválido" }, 400);

      // Tenta múltiplos endpoints — n8n mudou caminhos de data-tables entre versões
      const candidates = [
        "/data-tables",
        "/data-tables?includeProject=true",
      ];
      // Também tenta por projeto se conseguir listar projetos
      try {
        const projs = await n8nFetch("/projects");
        const projList = projs?.data ?? projs ?? [];
        for (const p of (Array.isArray(projList) ? projList : [])) {
          if (p?.id) candidates.push(`/projects/${p.id}/data-tables`);
        }
      } catch (e) {
        console.warn("listar /projects falhou:", (e as Error).message);
      }

      const debug: any[] = [];
      const merged: any[] = [];
      const seen = new Set<string>();
      for (const path of candidates) {
        try {
          const data = await n8nFetch(path);
          const all = data?.data ?? data ?? [];
          const arr = Array.isArray(all) ? all : [];
          debug.push({ path, count: arr.length, sample: arr.slice(0, 3).map((t: any) => t?.name) });
          for (const t of arr) {
            if (t?.id && !seen.has(t.id)) {
              seen.add(t.id);
              merged.push(t);
            }
          }
        } catch (e) {
          debug.push({ path, error: (e as Error).message });
        }
      }

      const filtered = merged.filter((t: any) => {
        const n = String(t.name ?? "").toUpperCase().trimStart();
        return n === prefix || n.startsWith(prefix + "_") || n.startsWith(prefix + " ") || n.startsWith(prefix + "-");
      });
      return j({
        datatables: filtered.map((t: any) => ({ id: t.id, name: t.name })),
        _debug: debug,
        _total: merged.length,
      });
    }

    if (action === "upsert_workflow") {
      const roboId: string = body?.roboId;
      if (!roboId) return j({ error: "roboId requerido" }, 400);
      const { data: robo, error } = await admin
        .from("robo_campanhas").select("*").eq("id", roboId).single();
      if (error) throw error;

      const wf = robo.campaign_type === "disparo"
        ? buildDisparoWorkflow(robo)
        : buildEcommerceWorkflow(robo);

      let result: any;
      if (robo.n8n_workflow_id) {
        // PUT update — n8n exige só campos editáveis
        try {
          result = await n8nFetch(`/workflows/${robo.n8n_workflow_id}`, {
            method: "PUT",
            body: JSON.stringify(wf),
          });
        } catch (e) {
          // Se o workflow sumiu do n8n, cria de novo
          console.warn("PUT falhou, tentando criar:", e);
          result = await n8nFetch("/workflows", {
            method: "POST",
            body: JSON.stringify(wf),
          });
        }
      } else {
        result = await n8nFetch("/workflows", {
          method: "POST",
          body: JSON.stringify(wf),
        });
      }

      const workflowId = result?.id ?? result?.data?.id;
      await admin.from("robo_campanhas")
        .update({ n8n_workflow_id: workflowId, ultimo_erro: null })
        .eq("id", roboId);

      return j({ ok: true, workflowId });
    }

    if (action === "recreate_datatable") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;

      const tableName: string = job.data_table_name || `${(job.plataforma || "DATA").toUpperCase()}_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;
      const columns = [
        { name: "productname", type: "string" },
        { name: "price", type: "number" },
        { name: "priceoriginal", type: "number" },
        { name: "pricediscountrate", type: "number" },
        { name: "shopname", type: "string" },
        { name: "offerlink", type: "string" },
        { name: "imageUrl", type: "string" },
        { name: "sending", type: "boolean" },
        { name: "commission_rate", type: "number" },
        { name: "commission_value", type: "number" },
        { name: "sales", type: "number" },
        { name: "rating", type: "number" },
        { name: "sent_at", type: "string" },
      ];

      // procura projeto
      let projectId: string | null = null;
      try {
        const projs = await n8nFetch("/projects");
        const list = projs?.data ?? projs ?? [];
        for (const p of (Array.isArray(list) ? list : [])) {
          if (p?.id) { projectId = p.id; break; }
        }
      } catch (_) {}

      // checa se já existe com esse nome
      let datatableId: string | null = null;
      const searchPaths = ["/data-tables", "/data-tables?includeProject=true"];
      if (projectId) searchPaths.push(`/projects/${projectId}/data-tables`);
      for (const path of searchPaths) {
        try {
          const d = await n8nFetch(path);
          const arr = d?.data ?? d ?? [];
          const found = (Array.isArray(arr) ? arr : []).find((t: any) => String(t?.name ?? "").trim() === tableName);
          if (found?.id) { datatableId = found.id; break; }
        } catch (_) {}
      }

      // se existe, deleta para recriar limpa
      if (datatableId) {
        try { await n8nFetch(`/data-tables/${datatableId}`, { method: "DELETE" }); } catch (e) { console.warn("delete datatable falhou:", e); }
        datatableId = null;
      }

      // cria nova
      const createCandidates: Array<{ path: string; body: any }> = [];
      if (projectId) createCandidates.push({ path: `/projects/${projectId}/data-tables`, body: { name: tableName, columns } });
      createCandidates.push({ path: "/data-tables", body: { name: tableName, columns } });
      if (projectId) createCandidates.push({ path: "/data-tables", body: { name: tableName, columns, projectId } });
      let lastErr: any = null;
      for (const c of createCandidates) {
        try {
          const created = await n8nFetch(c.path, { method: "POST", body: JSON.stringify(c.body) });
          datatableId = created?.id ?? created?.data?.id ?? null;
          if (datatableId) break;
        } catch (e) { lastErr = e; }
      }
      if (!datatableId) return j({ error: `Não consegui criar data table "${tableName}" no n8n: ${lastErr?.message ?? "desconhecido"}` }, 500);

      await admin.from("scrapper_jobs")
        .update({ n8n_datatable_id: datatableId, data_table_name: tableName, ultimo_erro: null })
        .eq("id", jobId);

      // se o workflow existe, faz upsert pra garantir que aponta pra nova table
      if (job.n8n_workflow_id) {
        try {
          const refreshed = { ...job, n8n_datatable_id: datatableId, data_table_name: tableName };
          const isMLr = refreshed.plataforma === "mercadolivre" || refreshed.plataforma === "mercado_livre";
          const wf = isMLr
            ? buildMlScrapperWorkflow(refreshed, friendlyWorkflowName("SCRAPPER", refreshed))
            : buildScrapperWorkflow(refreshed);
          await n8nFetch(`/workflows/${job.n8n_workflow_id}`, { method: "PUT", body: JSON.stringify(wf) });
        } catch (e) { console.warn("refresh workflow falhou:", e); }
      }

      return j({ ok: true, datatableId, tableName, message: `Data table "${tableName}" recriada com ${columns.length} colunas.` });
    }

    if (action === "upsert_scrapper_workflow") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;

      // 1. Garante que a data table existe no n8n (cria se não existir)
      const tableName: string = job.data_table_name || `${(job.plataforma || "DATA").toUpperCase()}_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;
      const columns = [
        { name: "productname", type: "string" },
        { name: "price", type: "number" },
        { name: "priceoriginal", type: "number" },
        { name: "pricediscountrate", type: "number" },
        { name: "shopname", type: "string" },
        { name: "offerlink", type: "string" },
        { name: "imageUrl", type: "string" },
        { name: "sending", type: "boolean" },
        { name: "commission_rate", type: "number" },
        { name: "commission_value", type: "number" },
        { name: "sales", type: "number" },
        { name: "rating", type: "number" },
        { name: "sent_at", type: "string" },
      ];


      let datatableId: string | null = null;
      // procura existente
      const searchPaths = ["/data-tables", "/data-tables?includeProject=true"];
      let projectId: string | null = null;
      try {
        const projs = await n8nFetch("/projects");
        const list = projs?.data ?? projs ?? [];
        for (const p of (Array.isArray(list) ? list : [])) {
          if (p?.id) { searchPaths.push(`/projects/${p.id}/data-tables`); projectId = projectId ?? p.id; }
        }
      } catch (_) {}
      for (const path of searchPaths) {
        try {
          const d = await n8nFetch(path);
          const arr = d?.data ?? d ?? [];
          const found = (Array.isArray(arr) ? arr : []).find((t: any) => String(t?.name ?? "").trim() === tableName);
          if (found?.id) { datatableId = found.id; break; }
        } catch (_) {}
      }

      // cria se não achou
      if (!datatableId) {
        const createCandidates: Array<{ path: string; body: any }> = [];
        if (projectId) {
          createCandidates.push({ path: `/projects/${projectId}/data-tables`, body: { name: tableName, columns } });
        }
        createCandidates.push({ path: "/data-tables", body: { name: tableName, columns } });
        if (projectId) {
          createCandidates.push({ path: "/data-tables", body: { name: tableName, columns, projectId } });
        }
        let lastErr: any = null;
        for (const c of createCandidates) {
          try {
            const created = await n8nFetch(c.path, { method: "POST", body: JSON.stringify(c.body) });
            datatableId = created?.id ?? created?.data?.id ?? null;
            if (datatableId) break;
          } catch (e) { lastErr = e; }
        }
        if (!datatableId) throw new Error(`Não consegui criar data table "${tableName}" no n8n: ${lastErr?.message ?? "desconhecido"}`);
      }

      // 2. Monta e faz upsert do workflow
      //    - DUP: builder próprio (whatsapp espelho)
      //    - Mercado Livre: usa o template real do usuário (ML - Auto 12h)
      //    - Demais: builder genérico antigo
      const jobForBuild = { ...job, n8n_datatable_id: datatableId, data_table_name: tableName };
      const wfName = friendlyWorkflowName("SCRAPPER", jobForBuild);
      const isML = jobForBuild.plataforma === "mercadolivre" || jobForBuild.plataforma === "mercado_livre";
      const wf = jobForBuild.plataforma === "dup"
        ? buildDupWorkflow(jobForBuild)
        : isML
          ? buildMlScrapperWorkflow(jobForBuild, wfName)
          : buildScrapperWorkflow(jobForBuild);

      let result: any;
      if (job.n8n_workflow_id) {
        try {
          result = await n8nFetch(`/workflows/${job.n8n_workflow_id}`, {
            method: "PUT", body: JSON.stringify(wf),
          });
        } catch (e) {
          console.warn("PUT scrapper falhou, criando novo:", e);
          result = await n8nFetch("/workflows", { method: "POST", body: JSON.stringify(wf) });
        }
      } else {
        result = await n8nFetch("/workflows", { method: "POST", body: JSON.stringify(wf) });
      }
      const workflowId = result?.id ?? result?.data?.id;
      let activation: any = null;
      if (workflowId) {
        try {
          activation = await n8nFetch(`/workflows/${workflowId}/${job.status === "ativo" ? "activate" : "deactivate"}`, {
            method: "POST",
          });
        } catch (e) {
          console.warn("sync workflow activation failed:", e);
          if (job.status === "ativo") throw e;
        }
      }
      let evolutionCapture: any = null;
      if (job.plataforma === "dup") {
        evolutionCapture = await ensureDupEvolutionCapture(admin, job.portfolio_id);
      }

      await admin.from("scrapper_jobs")
        .update({ n8n_workflow_id: workflowId, n8n_datatable_id: datatableId, data_table_name: tableName, ultimo_erro: null })
        .eq("id", jobId);
      return j({ ok: true, workflowId, datatableId, tableName, activated: job.status === "ativo", activation, evolutionCapture });
    }

    if (action === "activate" || action === "deactivate") {
      const workflowId: string = body?.workflowId;
      if (!workflowId) return j({ error: "workflowId requerido" }, 400);
      const result = await n8nFetch(`/workflows/${workflowId}/${action}`, {
        method: "POST",
      });
      // Ao ativar: zera ultima_execucao para que o próximo tick do cron (≤1 min)
      // dispare imediatamente, sem respeitar o intervalo do disparo anterior.
      if (action === "activate") {
        await admin.from("robo_campanhas")
          .update({ ultima_execucao: null, ultimo_erro: null })
          .eq("n8n_workflow_id", workflowId);
      }
      return j({ ok: true, result });
    }

    if (action === "delete") {
      const workflowId: string = body?.workflowId;
      if (!workflowId) return j({ ok: true, skipped: "no workflowId" });
      try {
        await n8nFetch(`/workflows/${workflowId}`, { method: "DELETE" });
      } catch (e) {
        console.warn("delete workflow falhou (talvez já excluído):", e);
      }
      return j({ ok: true });
    }

    if (action === "run_scrapper_now") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error || !job?.n8n_workflow_id) return j({ error: error?.message ?? "workflow não encontrado" }, 404);
      await admin.from("scrapper_jobs").update({ ultima_execucao: null, ultimo_erro: null }).eq("id", jobId);
      // 1) tenta API direta
      try {
        const r = await n8nFetch(`/workflows/${job.n8n_workflow_id}/execute`, { method: "POST" });
        return j({ ok: true, mode: "executed", result: r });
      } catch (_) { /* fallback */ }
      // 2) fallback: flipa cron temporariamente pra * * * * * (every minute), reativa, agenda revert
      const originalCron: string = job.agendamento_cron || "0 10 * * *";
      const isMLrun = job.plataforma === "mercadolivre" || job.plataforma === "mercado_livre";
      const wfTemp = isMLrun
        ? buildMlScrapperWorkflow({ ...job, intervalo_horas: 1 }, friendlyWorkflowName("SCRAPPER", job))
        : buildScrapperWorkflow({ ...job, agendamento_cron: "* * * * *" });
      try {
        await n8nFetch(`/workflows/${job.n8n_workflow_id}`, { method: "PUT", body: JSON.stringify(wfTemp) });
        try { await n8nFetch(`/workflows/${job.n8n_workflow_id}/deactivate`, { method: "POST" }); } catch (_) {}
        await n8nFetch(`/workflows/${job.n8n_workflow_id}/activate`, { method: "POST" });
      } catch (e) {
        return j({ error: `falha ao baixar cron: ${(e as Error).message}` }, 500);
      }
      // background: aguarda ~90s e devolve cron original
      const revert = (async () => {
        await new Promise((r) => setTimeout(r, 90_000));
        try {
          const { data: jFresh } = await admin.from("scrapper_jobs").select("*").eq("id", jobId).single();
          const base = (jFresh ?? job);
          const wfOrig = isMLrun
            ? buildMlScrapperWorkflow(base, friendlyWorkflowName("SCRAPPER", base))
            : buildScrapperWorkflow({ ...base, agendamento_cron: originalCron });
          await n8nFetch(`/workflows/${job.n8n_workflow_id}`, { method: "PUT", body: JSON.stringify(wfOrig) });
          try { await n8nFetch(`/workflows/${job.n8n_workflow_id}/deactivate`, { method: "POST" }); } catch (_) {}
          await n8nFetch(`/workflows/${job.n8n_workflow_id}/activate`, { method: "POST" });
          await admin.from("scrapper_jobs").update({ agendamento_cron: originalCron }).eq("id", jobId);
          console.log("run_scrapper_now: cron revertido para", originalCron);
        } catch (e) {
          console.error("falha ao reverter cron:", (e as Error).message);
        }
      })();
      // @ts-ignore Deno EdgeRuntime
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(revert); } catch (_) {}
      return j({ ok: true, mode: "cron_flipped", note: "cron baixado pra * * * * * por ~90s; revert agendado", originalCron });
    }






    if (action === "list_datatable_rows") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;
      let tableId = job.n8n_datatable_id as string | null;
      const tableName: string = job.data_table_name || "";
      if (!tableId && tableName) {
        // procura pelo nome
        const searchPaths = ["/data-tables", "/data-tables?includeProject=true"];
        try {
          const projs = await n8nFetch("/projects");
          const list = projs?.data ?? projs ?? [];
          for (const p of (Array.isArray(list) ? list : [])) {
            if (p?.id) searchPaths.push(`/projects/${p.id}/data-tables`);
          }
        } catch (_) {}
        for (const path of searchPaths) {
          try {
            const d = await n8nFetch(path);
            const arr = d?.data ?? d ?? [];
            const found = (Array.isArray(arr) ? arr : []).find((t: any) => String(t?.name ?? "").trim() === tableName);
            if (found?.id) { tableId = found.id; break; }
          } catch (_) {}
        }
      }
      if (!tableId) return j({ rows: [], warning: "data table não encontrada no n8n" });
      try {
        let rows: any[] = [];
        let lastErr = "";
        for (const path of [`/data-tables/${tableId}/rows?limit=1000`, `/data-tables/${tableId}/rows`, `/data-tables/${tableId}/rows?take=1000`]) {
          try {
            const data = await n8nFetch(path);
            const parsed = data?.data ?? data ?? [];
            rows = Array.isArray(parsed) ? parsed : [];
            lastErr = "";
            break;
          } catch (err) { lastErr = err instanceof Error ? err.message : String(err); }
        }
        if (lastErr) throw new Error(lastErr);
        return j({ rows, tableId, tableName });
      } catch (e) {
        return j({ error: (e as Error).message, tableId, tableName }, 500);
      }
    }

    if (action === "burn_stale_datatable_rows") {
      const tableId: string | null = body?.tableId ?? null;
      const roboId: string | null = body?.roboId ?? null;
      const olderThanHours = Math.max(1, Number(body?.olderThanHours ?? 12));
      let finalTableId = tableId;
      if (!finalTableId && roboId) {
        const { data: robo, error } = await admin
          .from("robo_campanhas")
          .select("n8n_datatable_id")
          .eq("id", roboId)
          .single();
        if (error) throw error;
        finalTableId = robo?.n8n_datatable_id ?? null;
      }
      if (!finalTableId) return j({ error: "tableId ou roboId requerido" }, 400);

      const resp = await n8nFetch(`/data-tables/${finalTableId}/rows?limit=1000`);
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
      const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
      const stale = rows.filter((r) => {
        const sent = String(r?.sent_at ?? "").trim();
        const t = sent ? Date.parse(sent) : 0;
        return r?.sending !== true && t > 0 && t < cutoff;
      });
      let updated = 0;
      const nowIso = new Date().toISOString();
      for (const r of stale) {
        try {
          await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
            method: "PATCH",
            body: JSON.stringify({
              filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] },
              data: { sending: true, sent_at: nowIso },
            }),
          });
          updated++;
        } catch (_) {}
      }
      return j({ ok: true, tableId: finalTableId, checked: rows.length, burned: updated, olderThanHours });
    }

    if (action === "reset_datatable") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;
      let tableId = job.n8n_datatable_id as string | null;
      const tableName: string = job.data_table_name || "";

      // se id sumiu, tenta achar pelo nome
      if (!tableId && tableName) {
        const searchPaths = ["/data-tables", "/data-tables?includeProject=true"];
        try {
          const projs = await n8nFetch("/projects");
          const list = projs?.data ?? projs ?? [];
          for (const p of (Array.isArray(list) ? list : [])) {
            if (p?.id) searchPaths.push(`/projects/${p.id}/data-tables`);
          }
        } catch (_) {}
        for (const path of searchPaths) {
          try {
            const d = await n8nFetch(path);
            const arr = d?.data ?? d ?? [];
            const found = (Array.isArray(arr) ? arr : []).find((t: any) => String(t?.name ?? "").trim() === tableName);
            if (found?.id) { tableId = found.id; break; }
          } catch (_) {}
        }
        if (tableId) {
          await admin.from("scrapper_jobs").update({ n8n_datatable_id: tableId }).eq("id", jobId);
        }
      }

      if (!tableId) return j({ error: "Data table não encontrada no n8n" }, 404);

      // Apaga SOMENTE as linhas, mantendo a estrutura da tabela
      let totalDeleted = 0;
      let totalAttempted = 0;
      // pagina coletando IDs
      const allIds: any[] = [];
      for (const path of [`/data-tables/${tableId}/rows?take=10000`, `/data-tables/${tableId}/rows?limit=10000`, `/data-tables/${tableId}/rows`]) {
        try {
          const data = await n8nFetch(path);
          const parsed = data?.data ?? data ?? [];
          const rows: any[] = Array.isArray(parsed) ? parsed : [];
          for (const r of rows) if (r?.id != null) allIds.push(r.id);
          if (rows.length > 0) break;
        } catch (_) {}
      }
      totalAttempted = allIds.length;

      // tenta bulk delete primeiro (vários formatos de API)
      let bulkOk = false;
      if (allIds.length > 0) {
        const bulkAttempts = [
          { path: `/data-tables/${tableId}/rows`, method: "DELETE", body: JSON.stringify({ filter: { type: "and", filters: [{ columnName: "id", condition: "in", value: allIds }] } }) },
          { path: `/data-tables/${tableId}/rows`, method: "DELETE", body: JSON.stringify({ ids: allIds }) },
          { path: `/data-tables/${tableId}/rows?filter=${encodeURIComponent(JSON.stringify({ id: { in: allIds } }))}`, method: "DELETE" as const, body: undefined as any },
        ];
        for (const att of bulkAttempts) {
          try {
            await n8nFetch(att.path, { method: att.method, ...(att.body ? { body: att.body } : {}) });
            bulkOk = true;
            totalDeleted = allIds.length;
            break;
          } catch (_) {}
        }
      }

      // fallback: deleta uma a uma (em paralelo)
      if (!bulkOk && allIds.length > 0) {
        const BATCH = 20;
        for (let i = 0; i < allIds.length; i += BATCH) {
          const slice = allIds.slice(i, i + BATCH);
          await Promise.all(slice.map(async (id) => {
            try {
              await n8nFetch(`/data-tables/${tableId}/rows/${id}`, { method: "DELETE" });
              totalDeleted++;
            } catch (_) {}
          }));
        }
      }

      await admin.from("scrapper_jobs")
        .update({ ultima_qtd: 0 })
        .eq("id", jobId);

      return j({
        ok: true,
        deleted: totalDeleted,
        attempted: totalAttempted,
        message: `${totalDeleted} de ${totalAttempted} linhas removidas. A data table foi mantida.`,
      });
    }

    return j({ error: "action desconhecida" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("n8n-sync error:", msg);
    return j({ error: msg }, 500);
  }
});
