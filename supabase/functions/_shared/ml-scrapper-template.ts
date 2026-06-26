// Builder do workflow ML scrapper a partir do template real do usuário
// (ML - Auto 12h). Mantém toda a lógica de scraping, parse, dedupe, ranking
// e chamada da API de afiliado EXATAMENTE como no workflow que funciona.
//
// Diferenças em relação ao template original:
//  - Remove dependência do Google Sheets (trigger, leitura de IDs, gravação)
//  - Trigger volta a ser o Schedule Trigger configurável (intervalo_horas)
//  - Saída final vai direto para Data Table do n8n (mesmo nó "Upsert row(s)1")
//  - CONFIG ML é preenchido a partir do scrapper_job (cookie, csrf, affiliate,
//    categorias, termos, settings)

import templateRaw from "./ml-scrapper-template.json" with { type: "json" };

type AnyNode = Record<string, any>;
type AnyWorkflow = Record<string, any>;

function cloneTemplate(): AnyWorkflow {
  return JSON.parse(JSON.stringify(templateRaw));
}

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
}

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

function sanitizeMlCredential(value: unknown, names: string[] = []): string {
  let s = cleanText(value);
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
  const headerName = names.find((n) => /cookie|csrf|affiliate/i.test(n));
  if (headerName) {
    const headerRe = new RegExp(`(?:^|\\n|\\r|;)\\s*${headerName.replace(/_/g, "[-_]")}\\s*:\\s*([^\\r\\n]+)`, "i");
    const m = s.match(headerRe);
    if (m) s = m[1];
  }
  return s
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/\r|\n/g, " ")
    .replace(/\s*;\s*(?:const|let|var)\s+[A-Z0-9_]+\s*=.*$/i, "")
    .replace(/\s+$/, "")
    .trim();
}

function findNode(wf: AnyWorkflow, name: string): AnyNode | undefined {
  return wf.nodes.find((n: AnyNode) => n.name === name);
}

const ML_HTML_PARSER_CODE = String.raw`// Extrai produtos direto do HTML do Mercado Livre.
// O node HTML do n8n costuma voltar vazio quando a página muda de classe
// ou quando o ML devolve a tela de verificação/login.
function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(s) {
  return decodeHtml(String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absUrl(u) {
  u = decodeHtml(String(u || '').trim());
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return 'https://www.mercadolivre.com.br' + u;
  return u;
}

function cleanImg(u) {
  u = absUrl(String(u || '').split(',')[0].trim().split(/\s+/)[0]);
  if (!/^https?:\/\//i.test(u)) return '';
  if (/logo|sprite|transparent|data:image/i.test(u)) return '';
  return u;
}

function titleFromBlock(block, link) {
  const linkEsc = link ? link.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&') : '';
  const linkRe = linkEsc ? new RegExp("<a[^>]+href=[\"']" + linkEsc + "[\"'][^>]*>([\\s\\S]*?)<\\/a>", 'i') : null;
  const anchor = linkRe ? block.match(linkRe) : block.match(/<a[^>]+href=["'][^"']*(?:MLB|\/p\/|mercadolivre\.com\.br)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const candidates = [
    anchor?.[1],
    block.match(/<(?:h2|h3)[^>]*>([\s\S]*?)<\/(?:h2|h3)>/i)?.[1],
    block.match(/(?:title|aria-label)=["']([^"']{8,180})["']/i)?.[1],
    block.match(/<img[^>]+alt=["']([^"']{8,180})["']/i)?.[1],
  ];
  for (const c of candidates) {
    const t = stripTags(c).replace(/^(?:Patrocinado|Novo|Usado)\s+/i, '').trim();
    if (t && t.length >= 4 && !/^R\$/i.test(t) && !/mercado livre/i.test(t)) return t;
  }
  return '';
}

function imageFromBlock(block) {
  // 1) Tenta atributos clássicos no <img>
  const attrs = ['data-zoom', 'data-src', 'src', 'data-srcset', 'srcset', 'data-lazy', 'data-original'];
  for (const attr of attrs) {
    const re = new RegExp("\\s" + attr + "=[\"']([^\"']+)[\"']", 'ig');
    for (const m of block.matchAll(re)) {
      const raw = String(m[1] || '').split(',')[0].trim().split(/\s+/)[0];
      const img = cleanImg(raw);
      if (img && /mlstatic|mercadolibre|http2/i.test(img)) return img;
    }
  }
  // 2) Fallback: qualquer URL mlstatic dentro do bloco (lazy load, <source>, JSON inline)
  const re2 = /https?:\/\/[^"'\s)<>]+mlstatic\.com\/[^"'\s)<>]+\.(?:webp|jpg|jpeg|png)/ig;
  for (const m of block.matchAll(re2)) {
    const img = cleanImg(m[0]);
    if (img) return img;
  }
  return '';
}

function moneyFromAria(s) {
  s = decodeHtml(String(s || '').toLowerCase());
  const m = s.match(/(\d[\d\.]*)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  if (!m) return null;
  const whole = Number(m[1].replace(/\./g, ''));
  const cents = m[2] ? Number(m[2]) / 100 : 0;
  return Number.isFinite(whole) ? whole + cents : null;
}

function priceTextFromBlock(block) {
  const values = [];
  for (const m of block.matchAll(/<span[^>]*class=["'][^"']*andes-money-amount[^"']*["'][^>]*>/gi)) {
    const start = m.index || 0;
    const chunk = block.slice(start, start + 900);
    const open = m[0];
    let val = moneyFromAria(open.match(/aria-label=["']([^"']+)["']/i)?.[1]);
    if (val == null) {
      const frac = chunk.match(/andes-money-amount__fraction[^>]*>([\d\.]+)</i)?.[1];
      const cents = chunk.match(/andes-money-amount__cents[^>]*>(\d{1,2})</i)?.[1];
      if (frac) val = Number(frac.replace(/\./g, '')) + (cents ? Number(cents) / 100 : 0);
    }
    if (val != null && Number.isFinite(val) && val >= 5) values.push(Math.round(val * 100) / 100);
  }
  if (!values.length) {
    const txt = stripTags(block);
    for (const m of txt.matchAll(/R\$\s*([\d\.]+(?:,\d{1,2})?)/g)) {
      const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n) && n >= 5) values.push(n);
    }
  }
  const unique = [...new Set(values)].sort((a, b) => b - a).slice(0, 3);
  const discount = stripTags(block).match(/\b\d{1,2}\s*%\s*OFF\b/i)?.[0] || '';
  return unique.map((n) => 'R$ ' + String(n).replace('.', ',')).join(' ') + (discount ? ' ' + discount : '');
}

function productBlocks(html) {
  const blocks = [];
  const cardRe = /<(?:li|div|article)[^>]+class=["'][^"']*(?:ui-search-layout__item|ui-search-result__wrapper|poly-card|shops__layout-item)[^"']*["'][^>]*>[\s\S]*?(?=<(?:li|div|article)[^>]+class=["'][^"']*(?:ui-search-layout__item|ui-search-result__wrapper|poly-card|shops__layout-item)[^"']*["']|<\/ol>|<\/section>|$)/gi;
  for (const m of html.matchAll(cardRe)) blocks.push(m[0]);
  if (blocks.length) return blocks;

  const linkRe = /href=["']([^"']*(?:MLB-?\d+|\/p\/|mercadolivre\.com\.br\/(?!registration|jms\/mlb\/lgz\/login))[^"']*)["']/gi;
  const seen = new Set();
  for (const m of html.matchAll(linkRe)) {
    const idx = m.index || 0;
    const slice = html.slice(Math.max(0, idx - 2500), Math.min(html.length, idx + 4500));
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    blocks.push(slice);
  }
  return blocks;
}

function parseProducts(html) {
  const out = [];
  const seen = new Set();
  for (const block of productBlocks(html)) {
    const linkRaw = block.match(/href=["']([^"']*(?:MLB-?\d+|\/p\/|mercadolivre\.com\.br\/(?!registration|jms\/mlb\/lgz\/login))[^"']*)["']/i)?.[1] || '';
    const link = absUrl(linkRaw).split('#')[0];
    if (!link || seen.has(link) || /registration|negative_traffic|\/login/i.test(link)) continue;
    const name = titleFromBlock(block, linkRaw);
    const img = imageFromBlock(block);
    const preco = priceTextFromBlock(block);
    if (!name || !preco || !link) continue;
    seen.add(link);
    out.push({ name, img, preco, link });
  }
  return out;
}

const result = [];
for (const item of items) {
  const html = String(item.json?.data ?? item.json?.body ?? item.json?.html ?? item.data ?? item.body ?? item.html ?? item.json ?? '');
  if (/suspicious-traffic|negative_traffic|Para continuar,\s*acesse|access your account/i.test(html)) {
    throw new Error('Mercado Livre devolveu tela de verificação/login em vez da lista de produtos. Re-salve o scraper para aplicar os headers/cookie; se continuar, atualize o ML_COOKIE da conta.');
  }
  const products = parseProducts(html);
  if (!products.length) {
    throw new Error('Nenhum produto encontrado no HTML recebido do Mercado Livre. O layout mudou ou a resposta não é uma página de listagem válida.');
  }
  result.push({ json: {
    'Nomes Produtos': products.map(p => p.name),
    'Imagem Produtos (src)': products.map(p => p.img),
    preco: products.map(p => p.preco),
    link_compra: products.map(p => p.link),
    'Imagem Produtos (data-src)': products.map(p => p.img),
    'Imagem Produtos (srcset)': products.map(p => p.img),
    'Imagem Produtos (data-srcset)': products.map(p => p.img),
  }});
}
return result;
`;

function removeNode(wf: AnyWorkflow, name: string) {
  wf.nodes = wf.nodes.filter((n: AnyNode) => n.name !== name);
  delete wf.connections?.[name];
  for (const src of Object.keys(wf.connections ?? {})) {
    const outs = wf.connections[src]?.main ?? [];
    for (let i = 0; i < outs.length; i++) {
      outs[i] = (outs[i] ?? []).filter((c: any) => c.node !== name);
    }
  }
}

function setConnection(wf: AnyWorkflow, src: string, target: string, srcIndex = 0) {
  wf.connections ??= {};
  wf.connections[src] ??= { main: [] };
  while (wf.connections[src].main.length <= srcIndex) wf.connections[src].main.push([]);
  wf.connections[src].main[srcIndex] = [{ node: target, type: "main", index: 0 }];
}

function setConfigField(node: AnyNode, name: string, stringValue: string) {
  const values: any[] = node.parameters?.fields?.values ?? [];
  const existing = values.find((v) => v.name === name);
  if (existing) {
    existing.stringValue = stringValue;
  } else {
    values.push({ name, type: "string", stringValue });
  }
}

function buildCategoriesArray(cfg: any): Array<{ nome: string; url: string }> {
  const out: Array<{ nome: string; url: string }> = [];
  const cats: string[] = Array.isArray(cfg.categorias) ? cfg.categorias : [];
  const termos: string[] = Array.isArray(cfg.termos) ? cfg.termos : [];
  const minDiscount = Math.max(0, Math.min(99, Number(cfg.ml_min_discount ?? 20)));

  // Categorias: cada entrada pode ser URL pronta OU um slug/MLBxxx (vira lista padrão)
  cats.forEach((raw, i) => {
    const v = String(raw || "").trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) {
      out.push({ nome: `cat_${i + 1}`, url: v });
    } else if (/^MLB\d+$/i.test(v)) {
      out.push({
        nome: v,
        url: `https://lista.mercadolivre.com.br/_Container_${v}`,
      });
    } else {
      const slug = slugify(v);
      out.push({
        nome: slug || `cat_${i + 1}`,
        url: `https://lista.mercadolivre.com.br/${slug}_OrderId_PRICE*DESC_DiscountRange_${minDiscount}-99`,
      });
    }
  });

  // Termos de busca: viram URLs de listagem ordenadas por desconto
  termos.forEach((t, i) => {
    const slug = slugify(String(t || ""));
    if (!slug) return;
    out.push({
      nome: `termo_${slug || i + 1}`,
      url: `https://lista.mercadolivre.com.br/${slug}_OrderId_PRICE*DESC_DiscountRange_${minDiscount}-99`,
    });
  });

  return out;
}

export function buildMlScrapperWorkflow(job: any, workflowName: string): AnyWorkflow {
  const cfg = job.config ?? {};
  const wf = cloneTemplate();
  wf.name = workflowName;

  // ---- Schedule ----
  const intervalHours = Math.max(1, Number(job.intervalo_horas ?? 12));
  const schedule = findNode(wf, "Schedule Trigger 12h");
  if (schedule) {
    schedule.parameters = job.force_every_minute === true || job.agendamento_cron === "* * * * *"
      ? { rule: { interval: [{ field: "minutes", minutesInterval: 1 }] } }
      : { rule: { interval: [{ field: "hours", hoursInterval: intervalHours }] } };
  }

  // ---- CONFIG ML: credenciais + categorias + settings ----
  const cookie = sanitizeMlCredential(cfg.ml_cookie, ["ML_COOKIE", "COOKIE"]);
  const csrf = sanitizeMlCredential(cfg.ml_csrf_token, ["ML_CSRF", "ML_CSRF_TOKEN", "X_CSRF_TOKEN", "CSRF"]);
  const affiliateTag = sanitizeMlCredential(cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag, ["ML_AFFILIATE_ID", "ML_AFFILIATE_TAG", "AFFILIATE_ID"]);

  const settings = {
    min_discount: Math.max(0, Math.min(99, Number(cfg.ml_min_discount ?? 10))),
    min_rating: Math.max(0, Math.min(5, Number(cfg.min_rating ?? 4.0))),
    free_shipping: cfg.free_shipping !== false,
    pages: Math.max(1, Math.min(50, Number(cfg.ml_pages ?? 10))),
    sort: String(cfg.ml_sort ?? "discount_desc"),
    exclude_categories: Array.isArray(cfg.exclude_categories) ? cfg.exclude_categories : [],
  };

  const categories = buildCategoriesArray(cfg);

  const configNode = findNode(wf, "CONFIG ML");
  if (configNode) {
    setConfigField(configNode, "ml_queries", JSON.stringify({ settings }, null, 2));
    setConfigField(configNode, "ml_affiliate_tag", affiliateTag);
    setConfigField(configNode, "ml_cookie", cookie);
    setConfigField(configNode, "ml_csrf_token", csrf);
    setConfigField(configNode, "ml_categories", JSON.stringify(categories, null, 2));
    // Limites/overrides opcionais do job
    if (cfg.max_total != null) setConfigField(configNode, "max_total", String(cfg.max_total));
    if (cfg.min_total != null) setConfigField(configNode, "min_total", String(cfg.min_total));
    if (cfg.max_total_final != null) setConfigField(configNode, "max_total_final", String(cfg.max_total_final));
    if (cfg.min_total_final != null) setConfigField(configNode, "min_total_final", String(cfg.min_total_final));
    if (cfg.min_commission_value != null) setConfigField(configNode, "min_commission_value", String(cfg.min_commission_value));
    if (cfg.commission_rate != null) setConfigField(configNode, "commission_rate", String(cfg.commission_rate));
  }

  // ---- Request/parse de listagem ML ----
  // O HTML node nativo quebra quando o Mercado Livre muda classes; convertemos
  // para Code node e extraímos direto do HTML. Também enviamos headers iguais
  // ao navegador para evitar cair na página "suspicious traffic".
  const requestHtml = findNode(wf, "Extrair HTML1");
  if (requestHtml) {
    requestHtml.parameters = {
      url: "={{ $json.link }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "cookie", value: "={{ $('Loop Over Items4').first().json.ml_cookie }}" },
          { name: "accept", value: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8" },
          { name: "accept-language", value: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" },
          { name: "cache-control", value: "no-cache" },
          { name: "pragma", value: "no-cache" },
          { name: "referer", value: "https://www.mercadolivre.com.br/" },
          { name: "upgrade-insecure-requests", value: "1" },
          { name: "user-agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" },
        ],
      },
      options: { response: { response: { fullResponse: false, responseFormat: "text" } } },
    };
  }

  const htmlParser = findNode(wf, "HTML1");
  if (htmlParser) {
    htmlParser.type = "n8n-nodes-base.code";
    htmlParser.typeVersion = 2;
    htmlParser.parameters = { jsCode: ML_HTML_PARSER_CODE };
  }

  // ---- Remove dependências de Google Sheets ----
  removeNode(wf, "Google Sheets Trigger1");
  removeNode(wf, "Get Existing IDs");
  removeNode(wf, "Salvar na Planilha");

  // ---- Schedule → CONFIG ML (pulando Get Existing IDs) ----
  setConnection(wf, "Schedule Trigger 12h", "CONFIG ML");

  // ---- Filter Already Saved: vira passthrough (sem planilha pra comparar) ----
  const filterSaved = findNode(wf, "Filter Already Saved");
  if (filterSaved) {
    filterSaved.parameters = {
      jsCode: `// Passthrough — dedupe contra histórico fica por conta do Data Table\n// (offerlink é a chave de upsert).\nreturn $input.all();\n`,
    };
  }

  // ---- Code in JavaScript10: mapper sheet→datatable vira mapper acumulado→datatable ----
  const mapper = findNode(wf, "Code in JavaScript10");
  if (mapper) {
    mapper.parameters = {
      jsCode: `// Mapeia itens vindos de "Finalizar Acumulado" para o formato da Data Table.
// Importante: NÃO faz upsert em produto que já existe, porque isso resetava
// sending=false e fazia promoção já enviada voltar a disparar no dia seguinte.
const now = new Date().toISOString();
const seen = new Set();
const out = [];
const N8N_BASE = ${JSON.stringify((Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/$/, ""))};
const N8N_KEY = ${JSON.stringify(Deno.env.get("N8N_API_KEY") ?? "")};
const TABLE_ID = ${JSON.stringify(job.n8n_datatable_id ?? "")};
const toNum = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = (v) => String(v || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 120);
const productKey = (r) => norm(r.productname) + '|' + String(toNum(r.price) ?? '') + '|' + norm(r.shopname || 'Mercado Livre');

const existingLinks = new Set();
const existingKeys = new Set();
async function loadExisting() {
  if (!N8N_BASE || !N8N_KEY || !TABLE_ID) return;
  try {
    const resp = await this.helpers.httpRequest({
      method: 'GET',
      url: N8N_BASE + '/data-tables/' + TABLE_ID + '/rows',
      qs: { limit: 1000 },
      headers: { 'X-N8N-API-KEY': N8N_KEY },
      json: true,
    });
    const rows = (resp && resp.data) ? resp.data : [];
    for (const r of rows) {
      const l = String(r.offerlink || '').trim();
      if (l) existingLinks.add(l);
      const k = productKey(r);
      if (k.length > 4) existingKeys.add(k);
    }
  } catch (e) {
    console.log('DEDUP_EXISTING_SKIP_LOAD_FAILED', String(e && e.message || e).slice(0, 160));
  }
}
await loadExisting.call(this);

for (const item of items) {
  const j = item.json || {};
  const offerlink = j.link_produtos_afiliado || j.offerlink || j.link_compra_original || '';
  if (!offerlink || seen.has(offerlink)) continue;
  const row = {
    productname:       j.productname || j.nome_produtos || j.nome || '',
    price:             toNum(j.price ?? j.preco_produtos),
    pricediscountrate: toNum(j.pricediscountrate ?? j.discount_pct),
    shopname:          j.shopname || 'Mercado Livre',
    offerlink,
    imageUrl:          j.imageUrl || j.imagem_produtos || j.imagem || '',
    sending:           false,
    commission_rate:   toNum(j.commission_rate) ?? 5,
    commission_value:  toNum(j.commission_value),
    sales:             toNum(j.sales) ?? 0,
    rating:            toNum(j.rating) ?? 0,
    sent_at:           '',
    priceoriginal:     toNum(j.priceoriginal ?? j.price_old),
  };
  const key = productKey(row);
  if (existingLinks.has(offerlink) || existingKeys.has(key) || seen.has(key)) continue;
  seen.add(offerlink);
  seen.add(key);
  out.push({
    json: {
      ...row,
    }
  });
}
console.log('DEDUP_EXISTING_RESULT', { novos: out.length, existentes_links: existingLinks.size, now });
return out;
`,
    };
  }

  // ---- Finalizar Acumulado → Code in JavaScript10 → Upsert row(s)1 ----
  setConnection(wf, "Finalizar Acumulado", "Code in JavaScript10");
  setConnection(wf, "Code in JavaScript10", "Upsert row(s)1");

  // ---- Upsert row(s)1: aponta para a Data Table do job ----
  const upsert = findNode(wf, "Upsert row(s)1");
  if (upsert && job.n8n_datatable_id) {
    upsert.parameters.dataTableId = {
      __rl: true,
      value: job.n8n_datatable_id,
      mode: "list",
      cachedResultName: job.data_table_name || "ML_SCRAPPER",
    };
  }

  // ---- settings / cleanup ----
  wf.settings = { executionOrder: "v1" };
  delete (wf as any).id;
  delete (wf as any).versionId;
  delete (wf as any).meta;
  delete (wf as any).pinData;
  delete (wf as any).staticData;
  delete (wf as any).tags;
  delete (wf as any).active;

  return wf;
}
