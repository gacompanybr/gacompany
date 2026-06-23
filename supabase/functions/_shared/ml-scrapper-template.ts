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

function findNode(wf: AnyWorkflow, name: string): AnyNode | undefined {
  return wf.nodes.find((n: AnyNode) => n.name === name);
}

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
    schedule.parameters = {
      rule: { interval: [{ field: "hours", hoursInterval: intervalHours }] },
    };
  }

  // ---- CONFIG ML: credenciais + categorias + settings ----
  const cookie = String(cfg.ml_cookie ?? "").replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\u2060]/g, "").trim();
  const csrf = String(cfg.ml_csrf_token ?? "").trim();
  const affiliateTag = String(cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag ?? "").trim();

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
const now = new Date().toISOString();
const seen = new Set();
const out = [];
const toNum = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
for (const item of items) {
  const j = item.json || {};
  const offerlink = j.link_produtos_afiliado || j.offerlink || j.link_compra_original || '';
  if (!offerlink || seen.has(offerlink)) continue;
  seen.add(offerlink);
  out.push({
    json: {
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
      sent_at:           j.sent_at || now,
      priceoriginal:     toNum(j.priceoriginal ?? j.price_old),
    }
  });
}
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
