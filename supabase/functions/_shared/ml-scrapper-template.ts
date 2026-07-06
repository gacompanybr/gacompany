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

  // --- replace tokens no CONFIG ML ---
  const configNode = findNode(wf, "CONFIG ML");
  if (!configNode) throw new Error("Template inválido: node CONFIG ML não encontrado");
  const values: any[] = configNode.parameters?.fields?.values ?? [];
  for (const f of values) {
    if (f?.stringValue === "__ML_COOKIE__") f.stringValue = cookie;
    else if (f?.stringValue === "__ML_CSRF_TOKEN__") f.stringValue = csrf;
    else if (f?.stringValue === "__ML_AFFILIATE_TAG__") f.stringValue = tag;
  }

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
