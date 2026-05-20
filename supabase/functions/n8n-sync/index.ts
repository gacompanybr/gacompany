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

const DEFAULT_TEMPLATE = `🔥 *{productname}*

💰 R$ {price}  ({pricediscountrate}% OFF)
🏪 {shopname}

👉 {offerlink}`;

function buildEcommerceWorkflow(robo: any) {
  const tableId = robo.n8n_datatable_id;
  const destinos: string[] = Array.isArray(robo.destinos) ? robo.destinos : [];
  const template: string = robo.message_template || DEFAULT_TEMPLATE;
  const instance: string = robo.instancia_id || "";
  const intervalMin: number = robo.intervalo_min_min ?? 30;

  // Código JS que roda dentro do n8n Code node
  // Faz: pega 1 row sending=false, escolhe grupo aleatório, manda via Evolution, marca sending=true
  const jsCode = `
const N8N_BASE = ${JSON.stringify(N8N_BASE)};
const N8N_KEY = ${JSON.stringify(N8N_KEY)};
const TABLE_ID = ${JSON.stringify(tableId)};
const EVO_URL = ${JSON.stringify(EVO_URL)};
const EVO_KEY = ${JSON.stringify(EVO_KEY)};
const INSTANCE = ${JSON.stringify(instance)};
const DESTINOS = ${JSON.stringify(destinos)};
const TEMPLATE = ${JSON.stringify(template)};

const http = this.helpers.httpRequest;

// 1. busca 1 row não enviada (filtro estruturado)
const filterObj = { type: "and", filters: [{ columnName: "sending", condition: "eq", value: false }] };
const rowsData = await http({
  method: "GET",
  url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows\`,
  qs: { filter: JSON.stringify(filterObj), limit: 1 },
  headers: { "X-N8N-API-KEY": N8N_KEY },
  json: true,
});
const row = rowsData && rowsData.data && rowsData.data[0];
if (!row) return [{ json: { skipped: "no rows available" } }];

// 2. monta caption
const caption = TEMPLATE
  .replace(/\\{productname\\}/g, String(row.productname == null ? "" : row.productname))
  .replace(/\\{price\\}/g, String(row.price == null ? "" : row.price))
  .replace(/\\{pricediscountrate\\}/g, String(row.pricediscountrate == null ? "" : row.pricediscountrate))
  .replace(/\\{shopname\\}/g, String(row.shopname == null ? "" : row.shopname))
  .replace(/\\{offerlink\\}/g, String(row.offerlink == null ? "" : row.offerlink))
  .replace(/\\{imageUrl\\}/g, String(row.imageUrl == null ? "" : row.imageUrl));

// 3. escolhe grupo aleatório
const grupo = DESTINOS[Math.floor(Math.random() * DESTINOS.length)];

// 4. envia via Evolution
let sendData; let sendStatus = 0;
try {
  sendData = await http({
    method: "POST",
    url: \`\${EVO_URL}/message/sendMedia/\${INSTANCE}\`,
    headers: { "apikey": EVO_KEY, "Content-Type": "application/json" },
    body: {
      number: grupo,
      mediatype: "image",
      media: row.imageUrl,
      caption: caption,
      fileName: "promo.jpg",
    },
    json: true,
  });
  sendStatus = 200;
} catch (e) {
  sendData = { error: e.message };
  sendStatus = e.httpCode || 500;
}

// 5. marca como usada
await http({
  method: "PATCH",
  url: \`\${N8N_BASE}/data-tables/\${TABLE_ID}/rows/update\`,
  headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
  body: {
    filter: { type: "and", filters: [{ columnName: "id", condition: "eq", value: row.id }] },
    data: { sending: true },
  },
  json: true,
});

return [{ json: { sent: row.productname, grupo, status: sendStatus, response: sendData } }];
  `.trim();

  return {
    name: `ROBO_${robo.id}`,
    nodes: [
      {
        parameters: {
          rule: {
            interval: [{ field: "minutes", minutesInterval: intervalMin }],
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
    name: `ROBO_${robo.id}`,
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
  const shopeeAppId = cfg.shopee_app_id ?? "";
  const shopeeSecret = cfg.shopee_secret ?? "";
  const dataTableName: string = job.data_table_name || `${(plataforma || "DATA").toUpperCase()}_${(job.nome || "JOB").toUpperCase().replace(/\s+/g, "_")}`;

  const jsCode = `
const N8N_BASE = ${JSON.stringify(N8N_BASE)};
const N8N_KEY = ${JSON.stringify(N8N_KEY)};
const PLATAFORMA = ${JSON.stringify(plataforma)};
const TERMOS = ${JSON.stringify(termos)};
const CATEGORIAS = ${JSON.stringify(categorias)};
const SHOPEE_APP_ID = ${JSON.stringify(shopeeAppId)};
const SHOPEE_SECRET = ${JSON.stringify(shopeeSecret)};
const TABLE_NAME = ${JSON.stringify(dataTableName)};
const JOB_ID = ${JSON.stringify(job.id)};
const SCRAPPER_API = ${JSON.stringify(SUPABASE_URL)} + "/functions/v1/scrapper-api";
const SCRAPPER_SECRET = ${JSON.stringify(Deno.env.get("SCRAPPER_API_SECRET") ?? "")};

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

async function shopeeSearch(keyword) {
  const url = "https://open-api.affiliate.shopee.com.br/graphql";
  const kw = String(keyword).replace(/"/g, "");
  const query = "{productOfferV2(keyword: \\"" + kw + "\\", limit: 50, page: 1, sortType: 2) {nodes {commissionRate commission imageUrl shopName price priceDiscountRate productLink offerLink productName}}}";
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
  return { nodes, apiErrors: parsed && parsed.errors, httpErr, status: httpErr ? httpErr.status : 200, raw: nodes.length ? null : parsed, authDebug: { credentialLength: String(SHOPEE_APP_ID || "").length, timestamp: ts, signaturePrefix: sig.slice(0, 8), payloadPrefix: payload.slice(0, 90) } };
}

let total = 0;
let erro = null;
const debug = [];
try {
  const tableId = await findTableId(TABLE_NAME);
  if (!tableId) throw new Error("Data table \\"" + TABLE_NAME + "\\" não encontrada no n8n. Crie-a primeiro.");

  if (PLATAFORMA === "shopee") {
    if (!SHOPEE_APP_ID || !SHOPEE_SECRET) throw new Error("Faltam credenciais Shopee.");
    const keywords = TERMOS.length ? TERMOS : CATEGORIAS;
    if (!keywords.length) throw new Error("Defina pelo menos um termo ou categoria.");
    for (const kw of keywords) {
      const r = await shopeeSearch(kw);
      debug.push({ keyword: kw, status: r.status, found: (r.nodes || []).length, apiErrors: r.apiErrors || null, httpErr: r.httpErr || null, raw: r.raw || null });
      for (const it of (r.nodes || [])) {
        try {
          await insertRow(tableId, {
            productname: it.productName,
            price: Number(it.price ?? it.priceMin ?? 0),
            pricediscountrate: it.priceDiscountRate,
            shopname: it.shopName,
            offerlink: it.offerLink,
            imageUrl: it.imageUrl,
            sending: false,
          });
          total++;
        } catch (e) {
          debug.push({ insertError: e.message || String(e), item: it.productName });
        }
      }
    }
  } else {
    throw new Error("Plataforma " + PLATAFORMA + " ainda não implementada no scrapper n8n.");
  }
} catch (e) {
  erro = e.message || String(e);
}

try {
  await http({
    method: "POST",
    url: SCRAPPER_API,
    headers: { "Authorization": "Bearer " + SCRAPPER_SECRET, "Content-Type": "application/json" },
    body: { action: "update_job", id: JOB_ID, ultima_qtd: total, ultimo_erro: erro },
    json: true,
  });
} catch (_) {}

return [{ json: { total, erro, table: TABLE_NAME, debug } }];
  `.trim();

  return {
    name: `SCRAPPER_${job.id}`,
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "hours", hoursInterval: intervalHours }] } },
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
        { name: "pricediscountrate", type: "number" },
        { name: "shopname", type: "string" },
        { name: "offerlink", type: "string" },
        { name: "imageUrl", type: "string" },
        { name: "sending", type: "boolean" },
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

    return j({ error: "action desconhecida" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("n8n-sync error:", msg);
    return j({ error: msg }, 500);
  }
});
