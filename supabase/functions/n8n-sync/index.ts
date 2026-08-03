// n8n-sync: cria, ativa, pausa e deleta workflows no n8n para cada robô
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildMlScrapperWorkflow } from "../_shared/ml-scrapper-template.ts";
import { buildRoboWorkflow } from "../_shared/robo-template.ts";

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

const ALLOWED_N8N_SETTINGS = new Set([
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "executionOrder",
]);

/**
 * n8n public API rejeita propriedades extras em `settings` e campos read-only
 * (id, active, pinData, versionId, meta, tags, staticData) no body de
 * create/update. Esta função normaliza para `{ name, nodes, connections, settings }`.
 */
export function toN8nBody(wf: any) {
  const rawSettings = (wf && typeof wf.settings === "object" && wf.settings) || {};
  const settings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawSettings)) {
    if (ALLOWED_N8N_SETTINGS.has(k)) settings[k] = v;
  }
  if (!("executionOrder" in settings)) settings.executionOrder = "v1";
  return {
    name: wf?.name,
    nodes: wf?.nodes ?? [],
    connections: wf?.connections ?? {},
    settings,
  };
}

function sanitizeWorkflowBodyIfNeeded(path: string, method: string, body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (!body || typeof body !== "string") return body;
  const m = method.toUpperCase();
  const isWorkflowWrite =
    (m === "POST" && /\/workflows\/?$/.test(path)) ||
    (m === "PUT"  && /\/workflows\/[^/]+\/?$/.test(path));
  if (!isWorkflowWrite) return body;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || !("nodes" in parsed)) return body;
    return JSON.stringify(toN8nBody(parsed));
  } catch {
    return body;
  }
}

async function n8nFetch(path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const body = sanitizeWorkflowBodyIfNeeded(path, method, init.body as any);
  if (body !== init.body && typeof body === "string") {
    try {
      const parsedDbg = JSON.parse(body);
      console.log("[n8nFetch] write", method, path, "topKeys=", Object.keys(parsedDbg), "settings=", parsedDbg.settings);
    } catch {/*noop*/}
  }
  const res = await fetch(`${N8N_BASE}${path}`, {
    ...init,
    method,
    body,
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
    console.error("[n8nFetch] FAIL", method, path, res.status, text.slice(0, 300));
    throw new Error(`n8n ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}


/**
 * FONTE ÚNICA DE VERDADE das colunas da data table do Scrapper (ML/DUP).
 * Deve bater 1:1 com os campos mapeados no nó "Upsert row(s)" do template
 * (ml-scrapper-template.json). Se mudar o mapeamento do Upsert, mudar aqui.
 */
const SCRAPPER_DATATABLE_COLUMNS: Array<{ name: string; type: "string" | "number" | "boolean" }> = [
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
  { name: "link_compra", type: "string" },
  { name: "categoria", type: "string" },
];

/**
 * Garante que a data table tem todas as colunas que o Upsert grava.
 * Lê o schema atual e cria só as faltantes — necessário pra tabelas antigas
 * que foram criadas sem link_compra/categoria.
 */
async function ensureScrapperDatatableColumns(tableId: string) {
  let existing: any[] = [];
  try {
    const meta = await n8nFetch(`/data-tables/${tableId}`);
    const cols = meta?.columns ?? meta?.data?.columns ?? meta?.schema ?? [];
    if (Array.isArray(cols)) existing = cols;
  } catch (e) { console.warn("[ensureScrapperDatatableColumns] meta fetch failed:", e); }
  if (!existing.length) {
    try {
      const c = await n8nFetch(`/data-tables/${tableId}/columns`);
      const cols = c?.data ?? c ?? [];
      if (Array.isArray(cols)) existing = cols;
    } catch (_) {}
  }
  const have = new Set(existing.map((c: any) => String(c?.name ?? "")).filter(Boolean));
  const missing = SCRAPPER_DATATABLE_COLUMNS.filter((c) => !have.has(c.name));
  for (const col of missing) {
    const attempts: Array<{ path: string; body: any }> = [
      { path: `/data-tables/${tableId}/columns`, body: col },
      { path: `/data-tables/${tableId}/columns`, body: { columns: [col] } },
      { path: `/data-tables/${tableId}/schema`, body: col },
    ];
    let added = false;
    for (const a of attempts) {
      try { await n8nFetch(a.path, { method: "POST", body: JSON.stringify(a.body) }); added = true; break; }
      catch (_) { /* tenta próximo formato */ }
    }
    if (!added) console.warn(`[ensureScrapperDatatableColumns] falhou ao adicionar coluna '${col.name}' em ${tableId}`);
  }
  return { added: missing.map((m) => m.name) };
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

// Trata a credencial como STRING OPACA. NÃO faz split/parse interno.
// Só desembrulha um wrapper explícito `const/let/var NAME = "..."` quando ele
// começa no início absoluto do input (caso o usuário cole a linha de código).
function sanitizeMlCredential(value: unknown, _names: string[] = []): string {
  const s = normalizeCredential(value);
  const wrap = s.match(/^\s*(?:const|let|var)\s+[A-Za-z0-9_]+\s*=\s*(['"`])([\s\S]*)\1\s*;?\s*$/);
  if (wrap) return wrap[2];
  return s;
}

function normalizeProductName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function flatDataTableRow(row: any): any {
  if (row && row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
    return { ...row.data, _row_id: row.id };
  }
  return row ?? {};
}

function dataTableRowId(row: any): any {
  const flat = flatDataTableRow(row);
  return flat?._row_id ?? flat?.id ?? row?.id;
}

function extractProductIdFromRow(row: any): string {
  row = flatDataTableRow(row);
  const joined = [row?.link_compra, row?.offerlink, row?.imageUrl].map((v) => String(v ?? "")).join(" ");
  const m =
    joined.match(/\b(MLB-?U?\d{6,})\b/i) ||
    joined.match(/\/p\/(MLBU?\d{6,})/i) ||
    joined.match(/\/up\/(MLBU?\d{6,})/i) ||
    joined.match(/(?:item_id[:=]|item_id%3A|wid=)(MLB-?\d{6,})/i);
  return m?.[1]?.replace("-", "").toUpperCase() ?? "";
}

function productHistoryKey(row: any): string {
  row = flatDataTableRow(row);
  const mlId = extractProductIdFromRow(row);
  if (mlId) return `ml:${mlId}`;
  return `name:${normalizeProductName(row?.productname).slice(0, 160)}`;
}

const PRODUCT_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "pra", "por", "em", "no", "na", "nos", "nas", "e", "ou", "a", "o", "as", "os",
  "um", "uma", "uns", "umas", "the", "and", "for", "with", "of", "kit", "set", "pcs", "un", "und", "ml", "cm", "mm", "kg", "g", "mah", "w", "v", "volts", "cor",
]);

function productTokens(value: unknown): string[] {
  return normalizeProductName(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !PRODUCT_STOPWORDS.has(token));
}

function rowsLookDuplicated(a: any, b: any): boolean {
  a = flatDataTableRow(a);
  b = flatDataTableRow(b);
  const ida = extractProductIdFromRow(a);
  const idb = extractProductIdFromRow(b);
  if (ida && idb && ida === idb) return true;
  const at = new Set(productTokens(a?.productname));
  const bt = new Set(productTokens(b?.productname));
  if (!at.size || !bt.size) return false;
  let inter = 0;
  for (const token of at) if (bt.has(token)) inter++;
  const union = at.size + bt.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  return inter >= 3 || jaccard >= 0.55;
}

function buildEcommerceWorkflow(robo: any) {
  // Usa o template canônico (robo-template.json) — preserva 100% da lógica
  // depurada do nó "Disparar Promo". Aqui só injetamos credenciais/IDs/horários.
  return buildRoboWorkflow(robo, friendlyWorkflowName("ROBO", robo), {
    N8N_BASE,
    N8N_KEY,
    EVO_URL,
    EVO_KEY,
    SUPABASE_URL,
    SCRAPPER_SECRET: Deno.env.get("SCRAPPER_API_SECRET") ?? "",
    LOVABLE_API_KEY: Deno.env.get("LOVABLE_API_KEY") ?? "",
  });
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
      let activation: any = null;
      let activationError: string | null = null;

      if (workflowId) {
        // Reset staticData (zera dedupeDesdeMs, fails, lastSentMs) toda vez que o robô é salvo,
        // para o dedupe recomeçar do marco atual e não bloquear tudo que veio antes.
        // DELETE é o único método suportado pela API do n8n para limpar static data.
        try {
          await n8nFetch(`/workflows/${workflowId}/static-data`, { method: "DELETE" });
        } catch (e) {
          console.warn("static-data DELETE failed:", (e as Error).message);
        }
        try {
          if (robo.status === "ativo") {
            // Depois de um PUT o n8n pode deixar o cron sem registro ativo.
            // Reinicia a ativação para garantir que o Schedule volte a disparar.
            try {
              await n8nFetch(`/workflows/${workflowId}/deactivate`, { method: "POST" });
            } catch (_) {
              // ignorar: workflow já podia estar inativo
            }
            activation = await n8nFetch(`/workflows/${workflowId}/activate`, { method: "POST" });
          } else {
            activation = await n8nFetch(`/workflows/${workflowId}/deactivate`, { method: "POST" });
          }
        } catch (e) {
          activationError = (e as Error).message;
          console.warn("upsert_workflow activation failed:", activationError);
        }
      }

      await admin.from("robo_campanhas")
        .update({
          n8n_workflow_id: workflowId,
          ultima_execucao: robo.status === "ativo" ? null : robo.ultima_execucao,
          ultimo_erro: activationError,
        })
        .eq("id", roboId);

      return j({ ok: !activationError, workflowId, activated: robo.status === "ativo", activation, activationError });
    }

    if (action === "diagnose_robo") {
      const roboId: string = body?.roboId;
      if (!roboId) return j({ error: "roboId requerido" }, 400);
      const { data: robo, error } = await admin
        .from("robo_campanhas").select("*").eq("id", roboId).single();
      if (error) throw error;

      const out: any = {
        robo: {
          id: robo.id,
          nome: robo.nome,
          status: robo.status,
          marketplace: robo.marketplace,
          workflowId: robo.n8n_workflow_id,
          tableId: robo.n8n_datatable_id,
          tableName: robo.n8n_datatable_name,
          ultima_execucao: robo.ultima_execucao,
          proxima_execucao: robo.proxima_execucao,
          ultimo_erro: robo.ultimo_erro,
          horarios_por_dia: robo.horarios_por_dia,
        },
        workflow: null,
        executions: null,
        rows: null,
      };

      if (robo.n8n_workflow_id) {
        try {
          const wf = await n8nFetch(`/workflows/${robo.n8n_workflow_id}`);
          out.workflow = { id: wf?.id, name: wf?.name, active: wf?.active, updatedAt: wf?.updatedAt };
        } catch (e) {
          out.workflow = { error: (e as Error).message };
        }
        try {
          const ex = await n8nFetch(`/executions?workflowId=${encodeURIComponent(robo.n8n_workflow_id)}&limit=5`);
          const list = ex?.data ?? ex ?? [];
          out.executions = Array.isArray(list)
            ? list.map((r: any) => ({ id: r.id, status: r.status, mode: r.mode, startedAt: r.startedAt, stoppedAt: r.stoppedAt, finished: r.finished }))
            : list;
          const lastId = Array.isArray(list) && list[0]?.id ? list[0].id : null;
          if (lastId) {
            try {
              const detail = await n8nFetch(`/executions/${lastId}?includeData=true`);
              const runData = detail?.data?.resultData?.runData ?? detail?.resultData?.runData ?? {};
              const error = detail?.data?.resultData?.error ?? detail?.resultData?.error ?? null;
              const nodeErrors: any[] = [];
              for (const [node, runs] of Object.entries(runData)) {
                const arr = Array.isArray(runs) ? runs : [];
                for (const run of arr) {
                  if ((run as any)?.error) nodeErrors.push({ node, error: (run as any).error });
                }
              }
              out.lastExecutionDetail = {
                id: lastId,
                status: detail?.status,
                error,
                nodeErrors: nodeErrors.slice(0, 3),
              };
            } catch (e) {
              out.lastExecutionDetail = { id: lastId, error: (e as Error).message };
            }
          }
        } catch (e) {
          out.executions = { error: (e as Error).message };
        }
      }

      if (robo.n8n_datatable_id) {
        try {
          const pendingFilter = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: false }] };
          const sentFilter = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: true }] };
          const pendingResp = await n8nFetch(`/data-tables/${robo.n8n_datatable_id}/rows?filter=${encodeURIComponent(JSON.stringify(pendingFilter))}&limit=200`);
          const sentResp = await n8nFetch(`/data-tables/${robo.n8n_datatable_id}/rows?filter=${encodeURIComponent(JSON.stringify(sentFilter))}&limit=20`);
          const pending = Array.isArray(pendingResp?.data) ? pendingResp.data : [];
          const sent = Array.isArray(sentResp?.data) ? sentResp.data : [];
          const isMl = /mercado/i.test(String(robo.marketplace ?? ""));
          const valid = pending.filter((r: any) => {
            const sentAt = String(r?.sent_at ?? "").trim();
            const link = String(r?.offerlink ?? "").trim();
            return !sentAt && (!isMl || /^https?:\/\/meli\.la\//i.test(link));
          });
          out.rows = {
            pendingCountSample: pending.length,
            validCountSample: valid.length,
            sentCountSample: sent.length,
            firstPending: pending.slice(0, 5).map((r: any) => ({ id: r.id, productname: r.productname, sending: r.sending, sent_at: r.sent_at, offerlink: r.offerlink })),
            firstValid: valid.slice(0, 5).map((r: any) => ({ id: r.id, productname: r.productname, sending: r.sending, sent_at: r.sent_at, offerlink: r.offerlink })),
          };
        } catch (e) {
          out.rows = { error: (e as Error).message };
        }
      }

      return j(out);
    }

    if (action === "run_robo_now") {
      const roboId: string = body?.roboId;
      if (!roboId) return j({ error: "roboId requerido" }, 400);
      const { data: robo, error } = await admin
        .from("robo_campanhas").select("id, n8n_workflow_id").eq("id", roboId).single();
      if (error) throw error;
      if (!robo?.n8n_workflow_id) return j({ error: "workflow não encontrado" }, 404);
      const result = await n8nFetch(`/workflows/${robo.n8n_workflow_id}/execute`, { method: "POST" });
      return j({ ok: true, result });
    }

    if (action === "diagnose_scrapper") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;

      const out: any = {
        job: {
          id: job.id,
          nome: job.nome,
          plataforma: job.plataforma,
          status: job.status,
          cron: job.agendamento_cron,
          workflowId: job.n8n_workflow_id,
          tableId: job.n8n_datatable_id,
          tableName: job.data_table_name,
          ultima_execucao: job.ultima_execucao,
          ultima_qtd: job.ultima_qtd,
          ultimo_erro: job.ultimo_erro,
        },
        workflow: null,
        executions: null,
        rows: null,
      };

      if (job.n8n_workflow_id) {
        try {
          const wf = await n8nFetch(`/workflows/${job.n8n_workflow_id}`);
          out.workflow = { id: wf?.id, name: wf?.name, active: wf?.active, updatedAt: wf?.updatedAt };
        } catch (e) {
          out.workflow = { error: (e as Error).message };
        }
        try {
          const ex = await n8nFetch(`/executions?workflowId=${encodeURIComponent(job.n8n_workflow_id)}&limit=5`);
          const list = ex?.data ?? ex ?? [];
          out.executions = Array.isArray(list)
            ? list.map((r: any) => ({ id: r.id, status: r.status, mode: r.mode, startedAt: r.startedAt, stoppedAt: r.stoppedAt, finished: r.finished }))
            : list;
          const lastId = Array.isArray(list) && list[0]?.id ? list[0].id : null;
          if (lastId) {
            try {
              const detail = await n8nFetch(`/executions/${lastId}?includeData=true`);
              const runData = detail?.data?.resultData?.runData ?? detail?.resultData?.runData ?? {};
              const error = detail?.data?.resultData?.error ?? detail?.resultData?.error ?? null;
              const nodeErrors: any[] = [];
              for (const [node, runs] of Object.entries(runData)) {
                const arr = Array.isArray(runs) ? runs : [];
                for (const run of arr) if ((run as any)?.error) nodeErrors.push({ node, error: (run as any).error });
              }
              out.lastExecutionDetail = { id: lastId, status: detail?.status, error, nodeErrors: nodeErrors.slice(0, 5) };
            } catch (e) {
              out.lastExecutionDetail = { id: lastId, error: (e as Error).message };
            }
          }
        } catch (e) {
          out.executions = { error: (e as Error).message };
        }
      }

      if (job.n8n_datatable_id) {
        try {
          const pendingFilter = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: false }] };
          const rows = await n8nFetch(`/data-tables/${job.n8n_datatable_id}/rows?filter=${encodeURIComponent(JSON.stringify(pendingFilter))}&limit=20`);
          out.rows = { pendingSample: rows?.data ?? rows ?? [] };
        } catch (e) {
          out.rows = { error: (e as Error).message };
        }
      }

      return j(out);
    }

    if (action === "recreate_datatable") {
      const jobId: string = body?.jobId;
      if (!jobId) return j({ error: "jobId requerido" }, 400);
      const { data: job, error } = await admin
        .from("scrapper_jobs").select("*").eq("id", jobId).single();
      if (error) throw error;

      const tableName: string = job.data_table_name || `${(job.plataforma || "DATA").toUpperCase()}_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;
      const columns = SCRAPPER_DATATABLE_COLUMNS;


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

      // Garante todas as colunas (idempotente — útil se o backend ignorar algum tipo na criação)
      try { await ensureScrapperDatatableColumns(datatableId); }
      catch (e) { console.warn("[recreate_datatable] ensure columns falhou:", e); }



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
      const columns = SCRAPPER_DATATABLE_COLUMNS;



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

      // Migra/garante colunas faltantes (link_compra, categoria etc.) em tabelas antigas
      try { await ensureScrapperDatatableColumns(datatableId); }
      catch (e) { console.warn("[upsert_scrapper_workflow] ensure columns falhou:", e); }



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
      let activationError: string | null = null;
      if (workflowId) {
        try {
          if (job.status === "ativo") {
            try { await n8nFetch(`/workflows/${workflowId}/deactivate`, { method: "POST" }); } catch (_) {}
            activation = await n8nFetch(`/workflows/${workflowId}/activate`, { method: "POST" });
          } else {
            activation = await n8nFetch(`/workflows/${workflowId}/deactivate`, { method: "POST" });
          }
        } catch (e) {
          activationError = (e as Error).message;
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
      return j({ ok: true, workflowId, datatableId, tableName, activated: job.status === "ativo", activation, activationError, evolutionCapture });
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
        ? buildMlScrapperWorkflow({ ...job, force_every_minute: true, agendamento_cron: "* * * * *" }, friendlyWorkflowName("SCRAPPER", job))
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
        // Pagina a data table inteira via cursor (API pública do n8n: limit<=250 + nextCursor).
        // Sem isso a listagem parava nas 250 primeiras linhas (as mais antigas, já enviadas)
        // e os produtos novos do último scrap simplesmente não apareciam na tela.
        const PAGE = 250;
        const MAX_ROWS = 5000;
        const seen = new Set<string>();
        const rows: any[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < 40; page++) {
          const qs = `limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          const data = await n8nFetch(`/data-tables/${tableId}/rows?${qs}`);
          const parsed = data?.data ?? data ?? [];
          const batch: any[] = Array.isArray(parsed) ? parsed : [];
          for (const r of batch) {
            const k = String(r?.id ?? JSON.stringify(r)).slice(0, 500);
            if (seen.has(k)) continue;
            seen.add(k);
            rows.push(r);
          }
          cursor = (data && typeof data.nextCursor === "string" && data.nextCursor) ? data.nextCursor : null;
          if (!cursor || !batch.length || rows.length >= MAX_ROWS) break;
        }
        rows.sort((a, b) => Number(b?.id ?? 0) - Number(a?.id ?? 0));
        return j({ rows, tableId, tableName, total: rows.length });
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

      const resp = await n8nFetch(`/data-tables/${finalTableId}/rows?limit=250`);
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
      const stale = rows.filter((r) => {
        const sent = String(r?.sent_at ?? "").trim();
        return r?.sending !== true && sent.length > 0;
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

    if (action === "release_reserved_rows") {
      // Libera linhas marcadas como sending=true que foram reservadas recentemente
      // mas provavelmente NAO chegaram a ser enviadas de fato (falha no Evolution).
      // Usuario chama isso quando ve "tudo marcado mas nada enviado".
      const tableId: string | null = body?.tableId ?? null;
      const roboId: string | null = body?.roboId ?? null;
      const sinceMinutes = Math.max(1, Number(body?.sinceMinutes ?? 360)); // padrao: ultimas 6h
      let finalTableId = tableId;
      if (!finalTableId && roboId) {
        const { data: robo, error } = await admin
          .from("robo_campanhas").select("n8n_datatable_id").eq("id", roboId).single();
        if (error) throw error;
        finalTableId = robo?.n8n_datatable_id ?? null;
      }
      if (!finalTableId) return j({ error: "tableId ou roboId requerido" }, 400);

      const resp = await n8nFetch(`/data-tables/${finalTableId}/rows?limit=250`);
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
      const cutoff = Date.now() - sinceMinutes * 60_000;
      const candidates = rows.filter((r) => {
        if (r?.sending !== true) return false;
        const sent = String(r?.sent_at ?? "").trim();
        if (!sent.startsWith("__CLAIM__:")) return false;
        const claimedAt = Number(sent.split(":")[1] || 0);
        return claimedAt > 0 && claimedAt >= cutoff;
      });
      let released = 0;
      for (const r of candidates) {
        try {
          await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
            method: "PATCH",
            body: JSON.stringify({
              filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] },
              data: { sending: false, sent_at: "" },
            }),
          });
          released++;
        } catch (_) {}
      }
      return j({ ok: true, tableId: finalTableId, checked: rows.length, released, sinceMinutes });
    }

    if (action === "release_dedupe_rows") {
      // Libera linhas que o disparador queimou por dedupe (sent_at = "__DEDUPE__:...").
      // Envios reais (sent_at com data ISO) NAO sao tocados.
      const tableId: string | null = body?.tableId ?? null;
      const roboId: string | null = body?.roboId ?? null;
      const jobId: string | null = body?.jobId ?? null;
      let finalTableId = tableId;
      if (!finalTableId && roboId) {
        const { data: robo, error } = await admin
          .from("robo_campanhas").select("n8n_datatable_id").eq("id", roboId).single();
        if (error) throw error;
        finalTableId = robo?.n8n_datatable_id ?? null;
      }
      if (!finalTableId && jobId) {
        const { data: job, error } = await admin
          .from("scrapper_jobs").select("n8n_datatable_id").eq("id", jobId).single();
        if (error) throw error;
        finalTableId = job?.n8n_datatable_id ?? null;
      }
      if (!finalTableId) return j({ error: "tableId, roboId ou jobId requerido" }, 400);

      const rows: any[] = [];
      {
        let cursor: string | null = null;
        for (let page = 0; page < 40; page++) {
          const qs = `limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          const resp = await n8nFetch(`/data-tables/${finalTableId}/rows?${qs}`);
          const batch: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
          rows.push(...batch);
          cursor = (resp && typeof resp.nextCursor === "string" && resp.nextCursor) ? resp.nextCursor : null;
          if (!cursor || !batch.length) break;
        }
      }

      const candidates = rows.filter((r) =>
        r?.sending === true && String(r?.sent_at ?? "").trim().startsWith("__DEDUPE__")
      );
      const maxRows = Math.max(1, Math.min(400, Number(body?.maxRows ?? 120)));
      const slice = candidates.slice(0, maxRows);
      let released = 0;
      await Promise.all(slice.map(async (r) => {
        try {
          await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
            method: "PATCH",
            body: JSON.stringify({
              filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] },
              data: { sending: false, sent_at: "" },
            }),
          });
          released++;
        } catch (_) {}
      }));
      return j({
        ok: true, tableId: finalTableId, checked: rows.length,
        candidates: candidates.length, released, remaining: Math.max(0, candidates.length - released),
      });

    }



    if (action === "burn_duplicate_datatable_rows") {
      const tableId: string | null = body?.tableId ?? null;
      const roboId: string | null = body?.roboId ?? null;
      const jobId: string | null = body?.jobId ?? null;
      let finalTableId = tableId;
      let robo: any = null;

      if (!finalTableId && roboId) {
        const { data, error } = await admin
          .from("robo_campanhas")
          .select("id, portfolio_id, n8n_datatable_id")
          .eq("id", roboId)
          .single();
        if (error) throw error;
        robo = data;
        finalTableId = data?.n8n_datatable_id ?? null;
      }
      if (!finalTableId && jobId) {
        const { data, error } = await admin
          .from("scrapper_jobs")
          .select("n8n_datatable_id")
          .eq("id", jobId)
          .single();
        if (error) throw error;
        finalTableId = data?.n8n_datatable_id ?? null;
      }
      if (!finalTableId) return j({ error: "tableId, roboId ou jobId requerido" }, 400);

      const rows: any[] = [];
      const seenPageRows = new Set<string>();
      const PAGE = 200;
      for (const qs of [`take=10000`, `limit=10000`]) {
        try {
          const resp: any = await n8nFetch(`/data-tables/${finalTableId}/rows?${qs}`);
          const batch: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp?.data?.rows) ? resp.data.rows : Array.isArray(resp) ? resp : [];
          if (batch.length > PAGE) {
            for (const r of batch) {
              const k = String(r?.id ?? JSON.stringify(r)).slice(0, 500);
              if (seenPageRows.has(k)) continue;
              seenPageRows.add(k);
              rows.push(r);
            }
            break;
          }
        } catch (_) {}
      }
      let skip = 0;
      for (let page = rows.length ? 500 : 0; page < 500; page++) {
        const candidates = page === 0
          ? [`take=${PAGE}`, `limit=${PAGE}`]
          : [
              `take=${PAGE}&skip=${skip}`,
              `skip=${skip}&take=${PAGE}`,
              `limit=${PAGE}&offset=${skip}`,
              `offset=${skip}&limit=${PAGE}`,
              `limit=${PAGE}&skip=${skip}`,
              `page=${page + 1}&limit=${PAGE}`,
            ];
        let chosenBatch: any[] = [];
        let chosenAdded = 0;
        for (const qs of candidates) {
          let resp: any = null;
          try { resp = await n8nFetch(`/data-tables/${finalTableId}/rows?${qs}`); }
          catch (_) { continue; }
          const batch: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
          if (!batch.length) continue;
          let added = 0;
          for (const r of batch) {
            const k = String(r?.id ?? JSON.stringify(r)).slice(0, 500);
            if (!seenPageRows.has(k)) added++;
          }
          if (page === 0 || added > 0) { chosenBatch = batch; chosenAdded = added; break; }
        }
        if (!chosenBatch.length || (page > 0 && chosenAdded === 0)) break;
        let addedNow = 0;
        for (const r of chosenBatch) {
          const k = String(r?.id ?? JSON.stringify(r)).slice(0, 500);
          if (seenPageRows.has(k)) continue;
          seenPageRows.add(k);
          rows.push(r);
          addedNow++;
        }
        if (!addedNow || chosenBatch.length < PAGE) break;
        skip += PAGE;
      }

      const normOffer = (r: any) => String(flatDataTableRow(r)?.offerlink ?? "").trim().toLowerCase().replace(/\/$/, "");
      const namePriceKey = (r: any) => {
        r = flatDataTableRow(r);
        const name = normalizeProductName(r?.productname);
        const price = Number(r?.price);
        return name && Number.isFinite(price) && price > 0 ? `np:${name}|${price.toFixed(2)}` : "";
      };
      const keysFor = (r: any) => {
        const keys = new Set<string>();
        const hist = productHistoryKey(r);
        if (hist && hist !== "name:") keys.add(hist);
        const offer = normOffer(r);
        if (offer) keys.add(`offer:${offer}`);
        const np = namePriceKey(r);
        if (np) keys.add(np);
        return [...keys];
      };
      const isRealSent = (r: any) => {
        const flat = flatDataTableRow(r);
        return flat?.sending === true || String(flat?.sending).toLowerCase() === "true" || (String(flat?.sent_at ?? "").trim() && !String(flat?.sent_at ?? "").startsWith("__CLAIM__:"));
      };
      const sorted = rows.slice().sort((a, b) => {
        const sa = isRealSent(a) ? 0 : 1;
        const sb = isRealSent(b) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const fa = flatDataTableRow(a);
        const fb = flatDataTableRow(b);
        const ta = Date.parse(fa?.createdAt || fa?.sent_at || "") || Number(dataTableRowId(a)) || 0;
        const tb = Date.parse(fb?.createdAt || fb?.sent_at || "") || Number(dataTableRowId(b)) || 0;
        return ta - tb;
      });

      const ownerByKey = new Map<string, any>();
      const duplicates: any[] = [];
      for (const r of sorted) {
        const keys = keysFor(r);
        if (!keys.length) continue;
        const duplicateOf = keys.map((k) => ownerByKey.get(k)).find(Boolean);
        if (duplicateOf) {
          duplicates.push(r);
          continue;
        }
        for (const k of keys) ownerByKey.set(k, r);
      }

      const nowIso = new Date().toISOString();
      let burned = 0;
      let seeded = 0;
      for (const r of duplicates) {
        const flat = flatDataTableRow(r);
        const rowId = dataTableRowId(r);
        if (!isRealSent(r)) {
          try {
            await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
              method: "PATCH",
              body: JSON.stringify({
                filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: rowId }] },
                data: { sending: true, sent_at: nowIso },
              }),
            });
            burned++;
          } catch (_) {}
        }
        if (robo?.id) {
          const key = productHistoryKey(r);
          if (key && key !== "name:") {
            const { error } = await admin.from("robo_produtos_enviados").upsert({
              portfolio_id: robo.portfolio_id,
              robo_id: robo.id,
              table_id: finalTableId,
              row_id: rowId == null ? null : String(rowId),
              product_key: key,
              productname: flat.productname ?? null,
              offerlink: flat.offerlink ?? null,
              link_compra: flat.link_compra ?? null,
              image_url: flat.imageUrl ?? null,
              sent_at: String(flat.sent_at || nowIso),
            }, { onConflict: "robo_id,product_key" });
            if (!error) seeded++;
          }
        }
      }

      return j({ ok: true, tableId: finalTableId, checked: rows.length, duplicates: duplicates.length, burned, seeded });
    }

    if (action === "burn_datatable_rows_by_ids") {
      const tableId: string | null = body?.tableId ?? null;
      const jobId: string | null = body?.jobId ?? null;
      const rowIds: Array<string | number> = Array.isArray(body?.rowIds) ? body.rowIds : [];
      let finalTableId = tableId;
      if (!finalTableId && jobId) {
        const { data, error } = await admin
          .from("scrapper_jobs")
          .select("n8n_datatable_id")
          .eq("id", jobId)
          .single();
        if (error) throw error;
        finalTableId = data?.n8n_datatable_id ?? null;
      }
      if (!finalTableId) return j({ error: "tableId ou jobId requerido" }, 400);
      if (!rowIds.length) return j({ error: "rowIds requerido" }, 400);

      const nowIso = new Date().toISOString();
      let burned = 0;
      const errors: any[] = [];
      for (const rowId of rowIds) {
        try {
          await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
            method: "PATCH",
            body: JSON.stringify({
              filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: rowId }] },
              data: { sending: true, sent_at: nowIso },
            }),
          });
          burned++;
        } catch (e) {
          errors.push({ rowId, error: (e as Error).message });
        }
      }
      return j({ ok: errors.length === 0, tableId: finalTableId, requested: rowIds.length, burned, errors });
    }

    if (action === "repair_sent_product_history") {
      const tableId: string | null = body?.tableId ?? null;
      const roboId: string | null = body?.roboId ?? null;
      const manualTerms: string[] = Array.isArray(body?.manualTerms) ? body.manualTerms.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
      let finalTableId = tableId;
      let robo: any = null;
      if (roboId) {
        const { data, error } = await admin
          .from("robo_campanhas")
          .select("id, portfolio_id, n8n_datatable_id")
          .eq("id", roboId)
          .single();
        if (error) throw error;
        robo = data;
        finalTableId = finalTableId ?? data?.n8n_datatable_id ?? null;
      }
      if (!finalTableId || !robo?.id) return j({ error: "roboId/tableId requerido" }, 400);

      const resp = await n8nFetch(`/data-tables/${finalTableId}/rows?limit=250`);
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
      const isRealSent = (r: any) => r?.sending === true && String(r?.sent_at ?? "").trim() && !String(r?.sent_at ?? "").startsWith("__CLAIM__:");
      const sentRows = rows.filter(isRealSent);
      let seeded = 0;
      for (const r of sentRows) {
        const key = productHistoryKey(r);
        if (!key || key === "name:") continue;
        const { error } = await admin.from("robo_produtos_enviados").upsert({
          portfolio_id: robo.portfolio_id,
          robo_id: robo.id,
          table_id: finalTableId,
          row_id: r.id == null ? null : String(r.id),
          product_key: key,
          productname: r.productname ?? null,
          offerlink: r.offerlink ?? null,
          link_compra: r.link_compra ?? null,
          image_url: r.imageUrl ?? null,
          sent_at: String(r.sent_at),
        }, { onConflict: "robo_id,product_key" });
        if (!error) seeded++;
      }

      const pending = rows.filter((r) => r?.sending !== true);
      const normTerms = manualTerms.map((t) => normalizeProductName(t));
      let burned = 0;
      const nowIso = new Date().toISOString();
      for (const r of pending) {
        const manual = normTerms.some((t) => t && normalizeProductName(r?.productname).includes(t));
        const duplicate = manual || sentRows.some((s) => rowsLookDuplicated(r, s));
        if (!duplicate) continue;
        try {
          await n8nFetch(`/data-tables/${finalTableId}/rows/update`, {
            method: "PATCH",
            body: JSON.stringify({
              filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: r.id }] },
              data: { sending: true, sent_at: nowIso },
            }),
          });
          const key = productHistoryKey(r);
          await admin.from("robo_produtos_enviados").upsert({
            portfolio_id: robo.portfolio_id,
            robo_id: robo.id,
            table_id: finalTableId,
            row_id: r.id == null ? null : String(r.id),
            product_key: key,
            productname: r.productname ?? null,
            offerlink: r.offerlink ?? null,
            link_compra: r.link_compra ?? null,
            image_url: r.imageUrl ?? null,
            sent_at: nowIso,
          }, { onConflict: "robo_id,product_key" });
          burned++;
        } catch (_) {}
      }
      return j({ ok: true, tableId: finalTableId, checked: rows.length, seeded, burned, manualTerms });
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
