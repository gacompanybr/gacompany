// n8n-sync: cria, ativa, pausa e deleta workflows no n8n para cada robô
import { createClient } from "npm:@supabase/supabase-js@2";

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

const MARKETPLACE_PREFIX: Record<string, string> = {
  shopee: "SHOPEE",
  mercadolivre: "ML",
  amazon: "AMZ",
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

// 4. Busca 1 produto disponivel (sending=false)
const filterObj = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: false }] };
const rowsData = await http({
  method: "GET",
  url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
  qs: { filter: JSON.stringify(filterObj), limit: 1 },
  headers: { "X-N8N-API-KEY": N8N_KEY },
  json: true,
});
const row = rowsData && rowsData.data && rowsData.data[0];
if (!row) {
  // Sem produto novo nao e erro - so nao dispara, aguardando proximo scraper
  return [{ json: { skipped: "sem produto novo no data table - aguardando scraper" } }];
}

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

// Encurtador da.gd (mantém ?tag= / commission)
let shortLink = String(row.offerlink || "");
try {
  const longUrl = String(row.offerlink || "").trim();
  if (longUrl && longUrl.length > 40) {
    const shortRes = await http({
      method: "GET",
      url: "https://da.gd/s",
      qs: { url: longUrl },
      timeout: 4000,
    });
    const sl = String(shortRes || "").trim();
    if (/^https?:\\/\\/da\\.gd\\//i.test(sl)) shortLink = sl;
  }
} catch (_) {}

// Frase curta gerada por IA (Lovable AI / Gemini Flash) — fallback se falhar
let frase = "OFERTA IMPERDÍVEL";
try {
  if (LOVABLE_API_KEY) {
    const aiResp = await http({
      method: "POST",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Authorization": "Bearer " + LOVABLE_API_KEY, "Content-Type": "application/json" },
      body: {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um copy de marketing. Gere UMA frase curtíssima em CAIXA ALTA (máximo 4 palavras, sem aspas, sem pontuação final, sem emoji) que combine com o produto e chame atenção. Exemplos: ESSE É VERSÁTIL / OFERTA RELÂMPAGO / PRA QUEM AMA CHURRASCO / SÓ HOJE / IMPERDÍVEL. Responda APENAS a frase, nada mais." },
          { role: "user", content: "Produto: " + String(row.productname || "") },
        ],
        max_tokens: 20,
        temperature: 0.9,
      },
      json: true,
      timeout: 8000,
    });
    const txt = String(aiResp && aiResp.choices && aiResp.choices[0] && aiResp.choices[0].message && aiResp.choices[0].message.content || "").trim();
    const cleaned = txt.replace(/["'\`*_]/g, "").replace(/[\\.!?,;:]+$/g, "").trim().toUpperCase();
    if (cleaned && cleaned.length <= 40) frase = cleaned;
  }
} catch (_) {}

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
  const normalizeShopeeCredential = (value: unknown) => String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
  const shopeeAppId = normalizeShopeeCredential(cfg.shopee_app_id);
  const shopeeSecret = normalizeShopeeCredential(cfg.shopee_secret);
  const mlCookie = normalizeShopeeCredential(cfg.ml_cookie);
  const mlCsrf = normalizeShopeeCredential(cfg.ml_csrf_token);
  const mlTag = normalizeShopeeCredential(cfg.ml_affiliate_tag);
  const mlPages = Math.max(1, Math.min(20, Number(cfg.ml_pages ?? 5)));
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
const ML_COOKIE = ${JSON.stringify(mlCookie)};
const ML_CSRF = ${JSON.stringify(mlCsrf)};
const ML_TAG = ${JSON.stringify(mlTag)};
const ML_PAGES = ${mlPages};
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

async function shopeeSearch(keyword) {
  const url = "https://open-api.affiliate.shopee.com.br/graphql";
  const kw = String(keyword).replace(/"/g, "");
  const query = "{productOfferV2(keyword: \\"" + kw + "\\", limit: 50, page: 1, sortType: 2) {nodes {commissionRate commission imageUrl shopName price priceDiscountRate productLink offerLink productName sales ratingStar}}}";
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

  // Dedup: monta set com produtos ja existentes no data table (nome normalizado)
  const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const existingNames = new Set();
  try {
    const all = await listRows(tableId);
    for (const r of (Array.isArray(all) ? all : [])) {
      const n = normName(r && r.productname);
      if (n) existingNames.add(n);
    }
    debug.push({ dedup: { loaded: existingNames.size } });
  } catch (e) { debug.push({ dedupErr: e.message || String(e) }); }

  if (PLATAFORMA === "shopee") {
    if (!SHOPEE_APP_ID || !SHOPEE_SECRET) throw new Error("Faltam credenciais Shopee.");
    let keywords = TERMOS.length ? TERMOS : CATEGORIAS;
    if (!keywords.length) throw new Error("Defina pelo menos um termo ou categoria.");
    // Shuffle: embaralha keywords para variedade a cada execução
    for (let i = keywords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keywords[i], keywords[j]] = [keywords[j], keywords[i]];
    }
    outerShopee: for (const kw of keywords) {
      const r = await shopeeSearch(kw);
      debug.push({ keyword: kw, status: r.status, found: (r.nodes || []).length, apiErrors: r.apiErrors || null, httpErr: r.httpErr || null, raw: r.raw || null, authDebug: r.authDebug || null });
      for (const it of (r.nodes || [])) {
        if (MAX_PRODUCTS && total >= MAX_PRODUCTS) { debug.push({ stopped: "max_products reached", total }); break outerShopee; }
        try {
          const price = Number(it.price ?? it.priceMin ?? 0);
          const commissionRate = Number(it.commissionRate ?? 0);
          const commissionValue = Number(it.commission ?? (price * commissionRate / 100));
          const sales = Number(it.sales ?? 0);
          const rating = Number(it.ratingStar ?? 0);
          const nameKey = normName(it.productName);
          if (nameKey && existingNames.has(nameKey)) { dupSkipped++; continue; }
          if (commissionValue < MIN_COMMISSION_VALUE) { debug.push({ skipped: "commission<min", item: it.productName, commissionValue }); continue; }
          if (!passesQualityFilter(sales, rating)) { debug.push({ skipped: "quality<min", item: it.productName, sales, rating }); continue; }
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
          if (nameKey) existingNames.add(nameKey);
          total++;
          // Anti-bot: delay aleatório 3-12s entre produtos
          const delayMs = Math.floor(Math.random() * (12000 - 3000 + 1)) + 3000;
          await new Promise((res) => setTimeout(res, delayMs));
        } catch (e) {
          debug.push({ insertError: e.message || String(e), item: it.productName });
        }
      }
    }
  } else if (PLATAFORMA === "mercado_livre" || PLATAFORMA === "mercadolivre") {
    if (!ML_COOKIE || !ML_CSRF || !ML_TAG) throw new Error("Faltam credenciais ML (cookie, csrf, affiliate tag).");
    let keywords = (TERMOS.length ? TERMOS : CATEGORIAS).filter(Boolean);
    if (!keywords.length) throw new Error("Defina pelo menos um termo ou categoria.");
    // Shuffle: embaralha keywords para variedade a cada execução
    for (let i = keywords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keywords[i], keywords[j]] = [keywords[j], keywords[i]];
    }

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    function stripTags(s){ return String(s||"").replace(/<[^>]+>/g," ").replace(/\\s+/g," ").trim(); }
    function decodeEntities(s){ return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">"); }

    function parseMLProducts(html){
      const out = [];
      // tenta poly-card primeiro; senão cai pra ui-search-layout__item / ui-search-result
      let splitRe = /<(?:div|li)[^>]+class="(?:[^"]*\\s)?poly-card(?:\\s[^"]*)?"[^>]*>/g;
      const indices = [];
      let m;
      while ((m = splitRe.exec(html)) !== null) indices.push(m.index);
      if (indices.length === 0) {
        splitRe = /<li[^>]+class="[^"]*ui-search-layout__item[^"]*"/g;
        while ((m = splitRe.exec(html)) !== null) indices.push(m.index);
      }
      for (let i = 0; i < indices.length; i++){
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i+1] : Math.min(html.length, start + 12000);
        const card = html.slice(start, end);

        let linkM = card.match(/<a[^>]+class="[^"]*poly-component__title[^"]*"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/);
        if (!linkM) linkM = card.match(/<a[^>]+class="[^"]*ui-search-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/);
        if (!linkM) linkM = card.match(/<a[^>]+href="(https:\\/\\/(?:www\\.)?mercadolivre\\.com\\.br\\/[^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/);
        if (!linkM) continue;
        const link = decodeEntities(linkM[1]);
        let title = stripTags(linkM[2]);
        if (!title) {
          const t2 = card.match(/<h[1-3][^>]*>([\\s\\S]*?)<\\/h[1-3]>/);
          if (t2) title = stripTags(t2[1]);
        }
        if (!title || !link) continue;

        let image = "";
        const imgTagM = card.match(/<img[^>]+class="[^"]*poly-component_*picture[^"]*"[^>]*>/) || card.match(/<img[^>]+(?:src|data-src|srcset|data-srcset|data-original|data-lazy-src)="[^"]*mlstatic\\.com[^"]*"[^>]*>/) || card.match(/<img[^>]+>/);
        if (imgTagM){
          const tag = imgTagM[0];
          const srcM = tag.match(/\\bdata-src="([^"]+)"/) || tag.match(/\\bsrc="([^"]+)"/) || tag.match(/\\bdata-srcset="([^"]+)"/) || tag.match(/\\bsrcset="([^"]+)"/) || tag.match(/\\bdata-original="([^"]+)"/) || tag.match(/\\bdata-lazy-src="([^"]+)"/);
          if (srcM) image = decodeEntities(String(srcM[1]).split(/\\s+/)[0]);
        }
        if (!image) {
          const anyImgM = card.match(/https?:\\/\\/[^\\s"'<>]+mlstatic\\.com[^\\s"'<>]+\\.(?:webp|jpg|jpeg|png)/i);
          if (anyImgM) image = decodeEntities(anyImgM[0]);
        }

        const fractions = [...card.matchAll(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([\\d.]+)</g)].map(x => x[1]);
        const cents = [...card.matchAll(/class="[^"]*andes-money-amount__cents[^"]*"[^>]*>(\\d+)</g)].map(x => x[1]);
        let priceOld = 0, price = 0;
        if (fractions.length >= 1) priceOld = Number(fractions[0].replace(/\\./g, ""));
        if (fractions.length >= 2) price = Number(fractions[1].replace(/\\./g, ""));
        if (cents.length >= 1 && fractions.length >= 1) priceOld += Number(cents[0])/100;
        if (cents.length >= 2 && fractions.length >= 2) price += Number(cents[1])/100;
        if (!price && priceOld){ price = priceOld; priceOld = 0; }

        const discM = card.match(/(\\d{1,2})\\s*%\\s*OFF/i);
        const discount = discM ? Number(discM[1]) : (priceOld && price ? Math.round((1 - price/priceOld)*100) : 0);

        let shop = "Mercado Livre";
        const shopMatches = [
          card.match(/class="[^"]*(?:poly-component__seller|poly-component__seller-link|ui-search-official-store-label|ui-search-seller__name)[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:span|a|p|div)>/i),
          card.match(/(?:Vendido por|Por)\\s*<[^>]+>([\\s\\S]*?)<\\//i),
        ];
        for (const sm of shopMatches) {
          const candidate = stripTags(sm && sm[1] || "").replace(/^por\\s+/i, "").trim();
          if (candidate && candidate.length <= 60 && !/R\$|OFF|frete|chegar/i.test(candidate)) { shop = candidate; break; }
        }

        out.push({ title, link, image, price, priceOld, discount, shop });
      }
      return out;
    }


    function withAffiliateTag(rawLink){
      try {
        const url = new URL(String(rawLink || ""));
        const tag = String(ML_TAG || "").trim();
        if (!tag) return String(rawLink || "");
        if (/^matt:/i.test(tag)) {
          const parts = tag.split(":");
          if (parts[1]) url.searchParams.set("matt_word", parts[1]);
          if (parts[2]) url.searchParams.set("matt_tool", parts[2]);
        } else {
          url.searchParams.set("tag", tag.replace(/^tag:/i, ""));
        }
        return url.toString();
      } catch (_) {
        const sep = String(rawLink || "").includes("?") ? "&" : "?";
        return String(rawLink || "") + sep + "tag=" + encodeURIComponent(String(ML_TAG || "").replace(/^tag:/i, ""));
      }
    }

    let affiliateModeLogged = false;
    async function affiliateLink(rawLink){
      const tag = String(ML_TAG || "").trim().replace(/^tag:/i, "");
      // Tenta API oficial do painel de afiliados: gera link meli.la
      if (tag && !/^matt:/i.test(String(ML_TAG || "")) && ML_COOKIE && ML_CSRF) {
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
            body: JSON.stringify({ urls: [String(rawLink || "")], tag }),
          });
          let data = resp;
          if (typeof resp === "string") { try { data = JSON.parse(resp); } catch (_) { data = null; } }
          const shortUrl = data && data.urls && data.urls[0] && (data.urls[0].short_url || data.urls[0].shortUrl);
          if (shortUrl && /^https?:\\/\\//i.test(String(shortUrl))) {
            if (!affiliateModeLogged) {
              debug.push({ affiliateMode: "createLink_api", sample: shortUrl });
              affiliateModeLogged = true;
            }
            return String(shortUrl);
          }
          if (!affiliateModeLogged) {
            debug.push({ affiliateMode: "createLink_api_fallback", resp: typeof resp === "string" ? resp.slice(0, 300) : JSON.stringify(resp).slice(0, 300) });
            affiliateModeLogged = true;
          }
        } catch (e) {
          if (!affiliateModeLogged) {
            debug.push({ affiliateMode: "createLink_api_error", err: (e && e.message) || String(e) });
            affiliateModeLogged = true;
          }
        }
      }
      // Fallback: anexa tag/matt na URL crua (não credita comissão, mas mantém o produto)
      const tagged = withAffiliateTag(rawLink);
      return tagged;
    }

    // ===== Busca por keyword: SOMENTE HTML com cookie. Sem api.mercadolibre.com (403). =====
    async function fetchSearchHtml(keyword, page){
      const isOferta = /^(ofertas?|promo[cç][aã]o|mais\s*vendid|novidades?|top)$/i.test(String(keyword || "").trim());
      let url;
      if (isOferta) {
        url = "https://www.mercadolivre.com.br/ofertas" + (page > 1 ? "?page=" + page : "");
      } else {
        const slug = encodeURIComponent(String(keyword).trim()).replace(/%20/g, "-");
        const from = (page - 1) * 50 + 1;
        url = "https://lista.mercadolivre.com.br/" + slug + (page > 1 ? "_Desde_" + from : "");
      }
      try {
        const html = await http({
          method: "GET",
          url,
          headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            "cookie": ML_COOKIE,
            "x-csrf-token": ML_CSRF,
            "referer": "https://www.mercadolivre.com.br/",
            "upgrade-insecure-requests": "1",
            "user-agent": UA,
          },
        });
        const text = String(html || "");
        if (/account-verification|x-is-search-bot|captcha/i.test(text.slice(0, 80000))) {
          return { products: [], url, blocked: true, htmlSize: text.length };
        }
        return { products: parseMLProducts(text), url, blocked: false, htmlSize: text.length };
      } catch (e) {
        return { products: [], url, fetchErr: e.message || String(e) };
      }
    }

    outerML: for (const kw of keywords) {
      const q = String(kw).trim();
      if (!q) continue;
      for (let page = 1; page <= ML_PAGES; page++) {
        if (MAX_PRODUCTS && total >= MAX_PRODUCTS) { debug.push({ stopped: "max_products reached", total }); break outerML; }
        const res = await fetchSearchHtml(q, page);
        if (res.fetchErr) { debug.push({ keyword: kw, page, url: res.url, fetchErr: res.fetchErr }); continue; }
        if (res.blocked) { debug.push({ keyword: kw, page, url: res.url, blocked: "ML pediu verificação — cookie pode estar expirado", htmlSize: res.htmlSize }); continue; }
        let kept = 0;
        const skip = { discount: 0, missing: 0, commission: 0, insert: 0, affiliate: 0, duplicate: 0 };
        for (const it of res.products) {
          if (MAX_PRODUCTS && total >= MAX_PRODUCTS) break;
          const disc = Number(it.discount || 0);
          if (ML_MIN_DISCOUNT > 0 && disc > 0 && disc < ML_MIN_DISCOUNT) { skip.discount++; continue; }
          const title = String(it.title || "");
          const rawLink = String(it.link || "").split("#")[0].split("?")[0];
          const image = String(it.image || "").replace(/^http:/, "https:");
          const price = Number(it.price || 0);
          if (!title || !rawLink || price <= 0) { skip.missing++; continue; }
          const nameKey = normName(title);
          if (nameKey && existingNames.has(nameKey)) { skip.duplicate++; dupSkipped++; continue; }
          const commissionRate = ML_DEFAULT_COMMISSION_RATE;
          const commissionValue = price * commissionRate / 100;
          if (commissionValue < MIN_COMMISSION_VALUE) { skip.commission++; continue; }
          const offer = await affiliateLink(rawLink);
          if (!offer) { skip.affiliate++; continue; }
          try {
            const priceOriginalML = (disc > 0 && disc < 100)
              ? Math.round((price / (1 - disc / 100)) * 100) / 100
              : (it.priceOld && it.priceOld > price ? it.priceOld : price);
            await insertRow(tableId, {
              productname: title,
              price,
              priceoriginal: priceOriginalML,
              pricediscountrate: disc,
              shopname: it.shop || "Mercado Livre",
              offerlink: offer,
              imageUrl: image,
              sending: false,
              commission_rate: commissionRate,
              commission_value: commissionValue,
              sales: 0,
              rating: 0,
            });
            if (nameKey) existingNames.add(nameKey);
            total++; kept++;
            // Anti-bot: delay aleatório 3-12s entre produtos
            const delayMs = Math.floor(Math.random() * (12000 - 3000 + 1)) + 3000;
            await new Promise((res) => setTimeout(res, delayMs));
          } catch (err) {
            skip.insert++;
            debug.push({ insertError: err.message || String(err), item: title });
          }
        }
        debug.push({ keyword: kw, page, url: res.url, got: res.products.length, kept, skipped: skip, htmlSize: res.htmlSize });
      }
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
      const wf = buildScrapperWorkflow(job);
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
      await admin.from("scrapper_jobs")
        .update({ n8n_workflow_id: workflowId, n8n_datatable_id: datatableId, data_table_name: tableName, ultimo_erro: null })
        .eq("id", jobId);
      return j({ ok: true, workflowId, datatableId, tableName });
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

    return j({ error: "action desconhecida" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("n8n-sync error:", msg);
    return j({ error: msg }, 500);
  }
});
