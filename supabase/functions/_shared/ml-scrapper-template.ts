// Builder do workflow ML Scrapper.
//
// REGRA: NÃO injetamos campo-a-campo no "CONFIG ML". O template já tem defaults
// válidos em TODOS os campos. Aqui só substituímos 4 tokens pelos valores do job:
//   __ML_COOKIE__         -> cfg.ml_cookie
//   __ML_CSRF_TOKEN__     -> cfg.ml_csrf_token
//   __ML_AFFILIATE_TAG__  -> cfg.ml_affiliate_id (ou ml_affiliate_tag)
//   __DATA_TABLE_ID__     -> job.n8n_datatable_id
//
// Substituição feita no OBJETO (parse/walk/set), nunca em texto cru.

import templateRaw from "./ml-scrapper-template.json" with { type: "json" };

type AnyNode = Record<string, any>;
type AnyWorkflow = Record<string, any>;

function cloneTemplate(): AnyWorkflow {
  return JSON.parse(JSON.stringify(templateRaw));
}

function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
}

function sanitizeMlCredential(value: unknown): string {
  let s = cleanText(value);
  // remove prefixos tipo "const ML_COOKIE = '...'"
  const eq = s.indexOf("=");
  if (/^\s*(const|let|var)\s+[A-Z0-9_]+\s*=/i.test(s) && eq >= 0) {
    s = s.slice(eq + 1).trim();
  }
  return s
    .replace(/^['"`]|['"`]\s*;?\s*$/g, "")
    .replace(/\r|\n/g, " ")
    .trim();
}

function findNode(wf: AnyWorkflow, name: string): AnyNode | undefined {
  return wf.nodes.find((n: AnyNode) => n.name === name);
}

function getConfigField(values: any[], name: string): any | undefined {
  return values.find((f: any) => f?.name === name);
}

function setConfigString(values: any[], name: string, value: string): void {
  const field = getConfigField(values, name);
  if (field) field.stringValue = value;
  else values.push({ name, stringValue: value });
}

function slugifyMlCategory(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function isMlListUrl(value: unknown): boolean {
  return /^https?:\/\/lista\.mercadolivre\.com\.br\//i.test(cleanText(value));
}

function inferCategoryName(value: unknown, fallback: string): string {
  const raw = cleanText(value);
  if (!raw) return fallback;
  if (!isMlListUrl(raw)) return raw;
  try {
    const last = decodeURIComponent(new URL(raw).pathname.split("/").filter(Boolean).pop() ?? "");
    return last
      .split("_")[0]
      .replace(/-/g, " ")
      .trim() || fallback;
  } catch {
    return fallback;
  }
}

function mlCategoryUrl(value: unknown, minDiscount: number): string {
  const raw = cleanText(value);
  if (isMlListUrl(raw)) return raw.split("#")[0];
  const slug = slugifyMlCategory(raw);
  return slug
    ? `https://lista.mercadolivre.com.br/${slug}_CustoFrete_Gratis_DiscountRange_${minDiscount}-100_NoIndex_True`
    : "";
}

function parseMlCategories(cfg: any): Array<{ nome: string; url: string }> {
  const minDiscount = Math.max(1, Math.min(99, Number(cfg.ml_min_discount ?? 30)));
  const out: Array<{ nome: string; url: string }> = [];
  const push = (nameValue: unknown, urlValue?: unknown) => {
    const url = mlCategoryUrl(urlValue ?? nameValue, minDiscount);
    if (!url) return;
    const nome = inferCategoryName(nameValue ?? urlValue, `categoria-${out.length + 1}`);
    out.push({ nome, url });
  };

  const rawMlCategories = cfg.ml_categories;
  const mlCategories = typeof rawMlCategories === "string" && rawMlCategories.trim()
    ? (() => { try { return JSON.parse(rawMlCategories); } catch { return []; } })()
    : rawMlCategories;
  if (Array.isArray(mlCategories)) {
    for (const item of mlCategories) {
      if (item && typeof item === "object") push(item.nome ?? item.name ?? item.categoria ?? item.url, item.url);
      else push(item);
    }
  }

  if (out.length) {
    const seenExplicit = new Set<string>();
    return out.filter((c) => {
      const key = c.url.toLowerCase();
      if (seenExplicit.has(key)) return false;
      seenExplicit.add(key);
      return true;
    });
  }

  const categorias = Array.isArray(cfg.categorias) ? cfg.categorias : [];
  for (const item of categorias) {
    if (item && typeof item === "object") push((item as any).nome ?? (item as any).name ?? (item as any).categoria ?? (item as any).url, (item as any).url);
    else push(item);
  }

  const termos = Array.isArray(cfg.termos) ? cfg.termos : [];
  for (const item of termos) push(item);

  if (cfg.ml_base_url) push(cfg.ml_category_name ?? cfg.ml_base_url, cfg.ml_base_url);

  const seen = new Set<string>();
  return out.filter((c) => {
    const key = c.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replaceStringsDeep(value: any, replacements: Record<string, string>): any {
  if (typeof value === "string") {
    let out = value;
    for (const [from, to] of Object.entries(replacements)) {
      out = out.split(from).join(to);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => replaceStringsDeep(v, replacements));
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = replaceStringsDeep(value[key], replacements);
  }
  return value;
}

function buildDedupePrecoceJs(tableId: string): string {
  const n8nBase = (Deno.env.get("N8N_BASE_URL") ?? "https://n8n.gacompany.online").replace(/\/$/, "");
  const n8nKey = Deno.env.get("N8N_API_KEY") ?? "";
  return `// ============================================================
// Nó: "Dedupe Precoce por ID"
// Bloqueia produto já salvo ANTES de gerar link afiliado/inserir.
// Usa ID ML, link real e fallback nome+preço para cobrir CSV/API flat ou nested.
// ============================================================

const _BASE = ${JSON.stringify(n8nBase)};
const _KEY = ${JSON.stringify(n8nKey)};
const _TABLE = ${JSON.stringify(tableId)};

function decodeText(v) {
  let s = String(v ?? '');
  for (let i = 0; i < 2; i++) { try { s = decodeURIComponent(s); } catch (_) { break; } }
  return s
    .replace(/&amp;/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/');
}
function normText(v) {
  return decodeText(v)
    .toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\\s+/g, ' ');
}
function cleanLink(v) {
  let s = decodeText(v).trim();
  const urlM = s.match(/[?&](?:url|go)=([^&]+)/i);
  if (urlM) { try { s = decodeURIComponent(urlM[1]); } catch (_) {} }
  const clickM = s.match(/click1\\.mercadolivre\\.com\\.br\\/mclics\\/[^\\/]+\\/(https?:\\/\\/[^\\s"']+)/i);
  if (clickM) { try { s = decodeURIComponent(clickM[1]); } catch (_) { s = clickM[1]; } }
  s = s.split('#')[0].split('?')[0];
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
function extractId(...values) {
  for (const value of values) {
    const s = decodeText(value);
    const variants = [s];
    try { variants.push(decodeURIComponent(s)); } catch (_) {}
    for (const text of variants) {
      const m =
        text.match(/\\/p\\/(MLBU?\\d{6,})/i) ||
        text.match(/\\/up\\/(MLBU?\\d{6,})/i) ||
        text.match(/(?:item_id[:=]|item_id%3A|wid=)(MLB-?\\d{6,})/i) ||
        text.match(/\\b(MLB-?U?\\d{6,})\\b/i);
      if (m && m[1]) return m[1].replace('-', '').toUpperCase();
    }
  }
  return '';
}
function flatRow(row) {
  const r = row && row.json ? row.json : row;
  if (r && r.data && typeof r.data === 'object' && !Array.isArray(r.data)) return { ...r.data, _row_id: r.id };
  return r || {};
}
function linkOf(j) {
  return j.link_compra || j.link_compra_original || j.link_produtos || j.link || j.url || '';
}
function offerOf(j) {
  return j.offerlink || j.link_produtos_afiliado || j.short_url || '';
}
function titleOf(j) {
  return j.productname || j.nome_produtos || j.nome || j.title || j.name || j['Nomes Produtos'] || j["['Nomes Produtos']"] || '';
}
function priceOf(j) {
  const raw = j.price ?? j.preco ?? j.valor ?? j.price_new ?? '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const m = String(raw).match(/([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:\\.[0-9]+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/\\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function productKeys(j) {
  const keys = [];
  const link = cleanLink(linkOf(j));
  const offer = cleanLink(offerOf(j));
  const id = extractId(link, offer, j.imageUrl, j.imageURL, j.ID, j.product_id, j.productId, j.ml_id);
  if (id) keys.push('id:' + id);
  if (link) keys.push('link:' + link.toLowerCase());
  if (offer) keys.push('offer:' + offer.toLowerCase());
  const title = normText(titleOf(j));
  const price = priceOf(j);
  if (title && price > 0) keys.push('nameprice:' + title + '|' + price.toFixed(2));
  return [...new Set(keys)];
}

async function burnRowsAsAlreadyHandled(rows, reason) {
  if (!_BASE || !_KEY || !_TABLE || !Array.isArray(rows) || !rows.length) return { burned: 0, errors: 0 };
  const http = this.helpers.httpRequest;
  const now = new Date().toISOString();
  let burned = 0, errors = 0;
  for (const row of rows) {
    const id = row?._row_id ?? row?.id;
    if (id == null || id === '') continue;
    const attempts = [
      { method: 'PATCH', url: _BASE + '/data-tables/' + _TABLE + '/rows/update', body: { filter: { type: 'and', filters: [{ columnName: 'id', condition: 'eq', value: id }] }, data: { sending: true, sent_at: now, updatedAt: now } } },
      { method: 'PATCH', url: _BASE + '/data-tables/' + _TABLE + '/rows/' + id, body: { data: { sending: true, sent_at: now, updatedAt: now } } },
    ];
    let ok = false;
    for (const attempt of attempts) {
      try {
        await http({ method: attempt.method, url: attempt.url, headers: { 'X-N8N-API-KEY': _KEY, 'Content-Type': 'application/json' }, body: attempt.body, json: true });
        ok = true; break;
      } catch (_) {}
    }
    if (ok) burned++; else errors++;
  }
  return { burned, errors, reason };
}

async function fetchExistingRows() {
  const rows = [];
  if (_BASE && _KEY && _TABLE) {
    const http = this.helpers.httpRequest;
    const seen = new Set();
    const PAGE = 200;
    for (const qs of [{ take: 10000 }, { limit: 10000 }]) {
      try {
        const resp = await http({
          method: 'GET',
          url: _BASE + '/data-tables/' + _TABLE + '/rows',
          qs,
          headers: { 'X-N8N-API-KEY': _KEY },
          json: true,
        });
        const batch = Array.isArray(resp?.data) ? resp.data
          : Array.isArray(resp?.data?.rows) ? resp.data.rows
          : Array.isArray(resp?.rows) ? resp.rows
          : Array.isArray(resp) ? resp
          : [];
        if (batch.length > PAGE) {
          for (const r of batch) {
            const k = String(r?.id ?? JSON.stringify(r?.data ?? r)).slice(0, 500);
            if (seen.has(k)) continue;
            seen.add(k);
            rows.push(r);
          }
          return rows;
        }
      } catch (_) {}
    }
    let skip = 0;
    for (let page = 0; page < 500; page++) {
      const candidates = page === 0
        ? [{ take: PAGE }, { limit: PAGE }]
        : [
            { take: PAGE, skip },
            { skip, take: PAGE },
            { limit: PAGE, offset: skip },
            { offset: skip, limit: PAGE },
            { limit: PAGE, skip },
            { page: page + 1, limit: PAGE },
          ];
      let chosenBatch = [];
      let chosenAdded = 0;
      for (const qs of candidates) {
        let resp;
        try {
          resp = await http({
            method: 'GET',
            url: _BASE + '/data-tables/' + _TABLE + '/rows',
            qs,
            headers: { 'X-N8N-API-KEY': _KEY },
            json: true,
          });
        } catch (_) { continue; }
        const batch = Array.isArray(resp?.data) ? resp.data
          : Array.isArray(resp?.data?.rows) ? resp.data.rows
          : Array.isArray(resp?.rows) ? resp.rows
          : Array.isArray(resp) ? resp
          : [];
        if (!batch.length) continue;
        let added = 0;
        for (const r of batch) {
          const k = String(r?.id ?? JSON.stringify(r?.data ?? r)).slice(0, 500);
          if (!seen.has(k)) added++;
        }
        if (page === 0 || added > 0) { chosenBatch = batch; chosenAdded = added; break; }
      }
      if (!chosenBatch.length || (page > 0 && chosenAdded === 0)) break;
      let addedNow = 0;
      for (const r of chosenBatch) {
        const k = String(r?.id ?? JSON.stringify(r?.data ?? r)).slice(0, 500);
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(r);
        addedNow++;
      }
      if (!addedNow || chosenBatch.length < PAGE) break;
      skip += PAGE;
    }
  }
  if (!rows.length) {
    try { return $('Get Existing IDs').all().map(r => r.json || r); } catch (_) { return []; }
  }
  return rows;
}

const existingRows = await fetchExistingRows.call(this);
const existingKeys = new Set();
const duplicateAlreadyPendingRows = [];
for (const row of existingRows) {
  const flat = flatRow(row);
  const keys = productKeys(flat);
  const isAlreadySent = flat?.sending === true || String(flat?.sending).toLowerCase() === 'true' || !!String(flat?.sent_at ?? '').trim();
  const duplicated = keys.some((key) => existingKeys.has(key));
  if (duplicated && !isAlreadySent) duplicateAlreadyPendingRows.push(flat);
  for (const key of keys) {
    existingKeys.add(key);
  }
}
const burnResult = await burnRowsAsAlreadyHandled.call(this, duplicateAlreadyPendingRows, 'duplicate_existing_pending');

const seenThisRun = new Set();
const out = [];
let semChave = 0, dropExisting = 0, dropDupRun = 0;

for (const it of $input.all()) {
  const keys = productKeys(it.json || {});
  if (!keys.length) { semChave++; out.push(it); continue; }
  if (keys.some(k => existingKeys.has(k))) { dropExisting++; continue; }
  if (keys.some(k => seenThisRun.has(k))) { dropDupRun++; continue; }
  for (const k of keys) seenThisRun.add(k);
  out.push(it);
}

console.log('[Dedupe Precoce] entrada=' + $input.all().length +
  ' | na_tabela=' + dropExisting +
  ' | dup_rodada=' + dropDupRun +
  ' | sem_chave=' + semChave +
  ' | novos=' + out.length +
  ' | chaves_existentes=' + existingKeys.size +
  ' | pendentes_duplicados_queimados=' + burnResult.burned +
  ' | table=' + _TABLE);

return out;`;
}

function buildFinalClaimJs(originalCode: string, tableId: string, jobId: string): string {
  const scrapperApi = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/scrapper-api`;
  const scrapperSecret = Deno.env.get("SCRAPPER_API_SECRET") ?? "";
  const claimCode = `

// ===== Trava persistente anti-duplicado (backend) =====
// O n8n pode retornar só as primeiras páginas da data table; por isso a última
// barreira antes do insert consulta um histórico persistente por job.
function __dedupeDecodeText(v) {
  let s = String(v ?? '');
  for (let i = 0; i < 2; i++) { try { s = decodeURIComponent(s); } catch (_) { break; } }
  return s.replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
}
function __dedupeNormText(v) {
  return __dedupeDecodeText(v).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ');
}
function __dedupeCleanLink(v) {
  let s = __dedupeDecodeText(v).trim();
  const urlM = s.match(/[?&](?:url|go)=([^&]+)/i);
  if (urlM) { try { s = decodeURIComponent(urlM[1]); } catch (_) {} }
  const clickM = s.match(/click1\\.mercadolivre\\.com\\.br\\/mclics\\/[^\\/]+\\/(https?:\\/\\/[^\\s"']+)/i);
  if (clickM) { try { s = decodeURIComponent(clickM[1]); } catch (_) { s = clickM[1]; } }
  s = s.split('#')[0].split('?')[0];
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
function __dedupeExtractId(...values) {
  for (const value of values) {
    const s = __dedupeDecodeText(value);
    const variants = [s];
    try { variants.push(decodeURIComponent(s)); } catch (_) {}
    for (const text of variants) {
      const m = text.match(/\\/p\\/(MLBU?\\d{6,})/i)
        || text.match(/\\/up\\/(MLBU?\\d{6,})/i)
        || text.match(/(?:item_id[:=]|item_id%3A|wid=)(MLB-?\\d{6,})/i)
        || text.match(/\\b(MLB-?U?\\d{6,})\\b/i);
      if (m && m[1]) return m[1].replace('-', '').toUpperCase();
    }
  }
  return '';
}
function __dedupePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const m = String(v ?? '').match(/([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:\\.[0-9]+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/\\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function __dedupeKeys(j) {
  const keys = [];
  const link = __dedupeCleanLink(j.link_compra || j.link_compra_original || j.link || j.url || '');
  const offer = __dedupeCleanLink(j.offerlink || j.link_produtos_afiliado || j.short_url || '');
  const id = __dedupeExtractId(link, offer, j.imageUrl, j.imageURL, j.ID, j.product_id, j.productId, j.ml_id);
  if (id) keys.push('id:' + id);
  if (link) keys.push('link:' + link.toLowerCase());
  if (offer) keys.push('offer:' + offer.toLowerCase());
  const title = __dedupeNormText(j.productname || j.nome_produtos || j.nome || j.title || j.name || '');
  const price = __dedupePrice(j.price);
  if (title && price > 0) keys.push('nameprice:' + title + '|' + price.toFixed(2));
  return [...new Set(keys)];
}

if (out.length && ${JSON.stringify(scrapperApi)} && ${JSON.stringify(scrapperSecret)}) {
  const claimResp = await this.helpers.httpRequest({
    method: 'POST',
    url: ${JSON.stringify(scrapperApi)},
    headers: { 'Authorization': 'Bearer ' + ${JSON.stringify(scrapperSecret)}, 'Content-Type': 'application/json' },
    body: {
      action: 'claim_scrapper_products',
      scrapper_job_id: ${JSON.stringify(jobId)},
      table_id: ${JSON.stringify(tableId)},
      products: out.map((j, index) => ({
        index,
        keys: __dedupeKeys(j),
        productname: j.productname || null,
        offerlink: j.offerlink || null,
        link_compra: j.link_compra || null,
        price: j.price || null,
      })),
    },
    json: true,
  });
  const allowedIndexes = new Set((claimResp.allowed || []).map(a => Number(a.index)));
  const beforeClaim = out.length;
  out = out.filter((_, index) => allowedIndexes.has(index));
  console.log('[Dedupe Persistente] entrada=' + beforeClaim + ' | duplicados=' + ((claimResp.duplicates || []).length) + ' | novos=' + out.length);
}

return out;`;

  return originalCode.replace(/\nreturn out;\s*$/m, claimCode);
}

function buildCron(job: any): string | null {
  const cfg = job.config ?? {};
  if (typeof cfg.agendamento_cron === "string" && cfg.agendamento_cron.trim()) {
    return cfg.agendamento_cron.trim();
  }
  const intervalH = Math.max(1, Math.min(24, Number(job.intervalo_horas ?? cfg.intervalo_horas ?? 0)));
  const start = Math.max(0, Math.min(23, Number(cfg.hora_inicio ?? cfg.inicio_hora ?? 0)));
  const end = Math.max(start, Math.min(23, Number(cfg.hora_fim ?? cfg.fim_hora ?? 23)));
  if (!intervalH) return null;
  const hours: number[] = [];
  for (let h = start; h <= end; h += intervalH) hours.push(h);
  if (!hours.length) return null;
  const dowMap: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
  const dias = Array.isArray(cfg.dias_semana) ? cfg.dias_semana : [];
  const dow = dias.length && dias.length < 7
    ? dias.map((d: string) => dowMap[String(d).toLowerCase().slice(0, 3)]).filter((n: number) => n != null).sort().join(",")
    : "*";
  return `0 0 ${hours.join(",")} * * ${dow}`;
}

export function buildMlScrapperWorkflow(job: any, workflowName: string): AnyWorkflow {
  const cfg = job.config ?? {};

  // --- valores obrigatórios ---
  const cookie = sanitizeMlCredential(cfg.ml_cookie);
  const csrf = sanitizeMlCredential(cfg.ml_csrf_token);
  const tag = sanitizeMlCredential(cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag);
  const tableId = cleanText(job.n8n_datatable_id);

  if (!cookie) throw new Error("Faltando: ml_cookie (Cookie do Mercado Livre)");
  if (!csrf) throw new Error("Faltando: ml_csrf_token (x-csrf-token)");
  if (!tag) throw new Error("Faltando: ml_affiliate_id (Affiliate ID / matt_word)");
  if (!tableId) throw new Error("Faltando: data table id do cliente");

  const wf = cloneTemplate();
  wf.name = workflowName;

  // O template original carregava um ID fixo de data table dentro de alguns
  // campos texto/JS (ex.: o node "Dedupe Precoce por ID"). Isso fazia o dedupe
  // consultar a tabela de outro job e deixava duplicados entrarem na tabela real
  // do cliente. Troca qualquer ocorrência pelo ID dinâmico do job antes de salvar.
  replaceStringsDeep(wf, {
    "__DATA_TABLE_ID__": tableId,
    "HHVRHOgRDCza0NBQ": tableId,
  });

  const dedupeNode = findNode(wf, "Dedupe Precoce por ID");
  if (dedupeNode?.parameters) {
    dedupeNode.parameters.jsCode = buildDedupePrecoceJs(tableId);
  }

  const finalParserNode = findNode(wf, "Code in JavaScript2");
  if (finalParserNode?.parameters?.jsCode) {
    finalParserNode.parameters.jsCode = buildFinalClaimJs(finalParserNode.parameters.jsCode, tableId, cleanText(job.id));
  }

  // --- replace tokens no CONFIG ML ---
  const configNode = findNode(wf, "CONFIG ML");
  if (!configNode) throw new Error("Template inválido: node CONFIG ML não encontrado");
  const values: any[] = configNode.parameters?.fields?.values ?? [];
  for (const f of values) {
    if (f?.stringValue === "__ML_COOKIE__") f.stringValue = cookie;
    else if (f?.stringValue === "__ML_CSRF_TOKEN__") f.stringValue = csrf;
    else if (f?.stringValue === "__ML_AFFILIATE_TAG__") f.stringValue = tag;
  }

  const mlMinDiscount = Math.max(1, Math.min(99, Number(cfg.ml_min_discount ?? 30)));
  const mlPages = Math.max(1, Math.min(20, Number(cfg.ml_pages ?? 1)));
  setConfigString(values, "ml_queries", JSON.stringify({
    settings: {
      min_discount: mlMinDiscount,
      min_rating: Number(cfg.min_rating ?? 0),
      free_shipping: true,
      pages: mlPages,
      sort: "discount_desc",
      exclude_categories: Array.isArray(cfg.exclude_categories) ? cfg.exclude_categories : [],
    },
  }, null, 2));

  const mlCategories = parseMlCategories(cfg);
  if (mlCategories.length) {
    setConfigString(values, "ml_categories", JSON.stringify(mlCategories, null, 2));
    setConfigString(values, "ml_base_url", mlCategories[0].url);
    setConfigString(values, "ml_category_name", mlCategories[0].nome);
  } else {
    setConfigString(values, "ml_categories", "[]");
  }

  setConfigString(values, "min_commission_value", String(Math.max(0, Number(cfg.min_commission_value ?? 0))));
  setConfigString(values, "commission_rate", String(Math.max(0, Number(cfg.ml_default_commission_rate ?? cfg.commission_rate ?? 10))));

  // --- replace __DATA_TABLE_ID__ nos nodes de data table ---
  const tableName = job.data_table_name || "ML_SCRAPPER";
  for (const nm of ["Upsert row(s)", "Get Existing IDs"]) {
    const node = findNode(wf, nm);
    if (!node?.parameters?.dataTableId) continue;
    node.parameters.dataTableId.value = tableId;
    node.parameters.dataTableId.cachedResultName = tableName;
    node.parameters.dataTableId.__rl = true;
    node.parameters.dataTableId.mode = node.parameters.dataTableId.mode || "list";
  }

  // --- schedule opcional ---
  const schedule = findNode(wf, "Schedule Trigger 12h");
  if (schedule) {
    const cron = buildCron(job);
    if (cron) {
      schedule.parameters = { rule: { interval: [{ field: "cronExpression", expression: cron }] } };
    }
  }

  // --- cleanup ---
  wf.settings = wf.settings || { executionOrder: "v1" };
  delete (wf as any).id;
  delete (wf as any).versionId;
  delete (wf as any).meta;
  delete (wf as any).pinData;
  delete (wf as any).staticData;
  delete (wf as any).tags;
  delete (wf as any).active;

  return wf;
}
