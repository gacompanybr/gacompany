// Builder do workflow ML Scrapper.
//
// IMPORTANTE: este builder NÃO reescreve a lógica dos nós Code do template.
// O JSON em ml-scrapper-template.json é a versão "ML - Lar em Ofertas — CORRIGIDO"
// (depurada em produção). Aqui só substituímos campos dinâmicos por job:
//   - CONFIG ML: ml_cookie, ml_csrf_token, ml_affiliate_tag (sempre)
//                ml_categories, ml_base_url, ml_category_name, max_price,
//                final_pick (apenas se vierem do cfg da UI; senão mantém default)
//   - Upsert row(s) / Get Existing IDs: dataTableId do cliente
//   - Schedule Trigger 12h: cron gerado a partir da UI (horários/dias/intervalo)
//
// Qualquer alteração de lógica nos Code nodes reintroduz bugs.

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
  return s
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/\r|\n/g, " ")
    .replace(/\s*;\s*(?:const|let|var)\s+[A-Z0-9_]+\s*=.*$/i, "")
    .trim();
}

function findNode(wf: AnyWorkflow, name: string): AnyNode | undefined {
  return wf.nodes.find((n: AnyNode) => n.name === name);
}

function setConfigField(node: AnyNode, name: string, stringValue: string) {
  const values: any[] = node.parameters?.fields?.values ?? [];
  const existing = values.find((v) => v.name === name);
  if (existing) {
    existing.stringValue = stringValue;
    existing.type = existing.type || "string";
  } else {
    values.push({ name, type: "string", stringValue });
  }
}

/**
 * Monta cron de 6 campos (segundos incluídos, formato n8n) a partir da UI.
 * - cfg.agendamento_cron: usado direto se vier preenchido
 * - intervalo_horas + hora_inicio + hora_fim: monta "0 0 H1,H2,... * * *"
 * - dias da semana: se cfg.dias_semana = ["seg","ter",...], adiciona DOW
 */
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
  const wf = cloneTemplate();
  wf.name = workflowName;

  // ---- Schedule ----
  const schedule = findNode(wf, "Schedule Trigger 12h");
  if (schedule) {
    const cron = buildCron(job);
    if (cron) {
      schedule.parameters = { rule: { interval: [{ field: "cronExpression", expression: cron }] } };
    }
    // senão: preserva default do template
  }

  // ---- CONFIG ML: credenciais (sempre substituídas) ----
  const cookie = sanitizeMlCredential(cfg.ml_cookie, ["ML_COOKIE", "COOKIE"]);
  const csrf = sanitizeMlCredential(cfg.ml_csrf_token, ["ML_CSRF", "ML_CSRF_TOKEN", "X_CSRF_TOKEN", "CSRF"]);
  const affiliateTag = sanitizeMlCredential(
    cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag,
    ["ML_AFFILIATE_ID", "ML_AFFILIATE_TAG", "AFFILIATE_ID"],
  );

  const configNode = findNode(wf, "CONFIG ML");
  if (configNode) {
    if (cookie) setConfigField(configNode, "ml_cookie", cookie);
    if (csrf) setConfigField(configNode, "ml_csrf_token", csrf);
    if (affiliateTag) setConfigField(configNode, "ml_affiliate_tag", affiliateTag);

    // Opcionais: só substitui se vier da UI; senão mantém o default do template
    if (cfg.ml_base_url) setConfigField(configNode, "ml_base_url", String(cfg.ml_base_url));
    if (cfg.ml_category_name) setConfigField(configNode, "ml_category_name", String(cfg.ml_category_name));
    if (cfg.max_price != null) setConfigField(configNode, "max_price", String(cfg.max_price));
    if (cfg.final_pick != null) setConfigField(configNode, "final_pick", String(cfg.final_pick));
    if (cfg.max_total != null) setConfigField(configNode, "max_total", String(cfg.max_total));
    if (cfg.min_total != null) setConfigField(configNode, "min_total", String(cfg.min_total));
    if (cfg.max_total_final != null) setConfigField(configNode, "max_total_final", String(cfg.max_total_final));
    if (cfg.min_total_final != null) setConfigField(configNode, "min_total_final", String(cfg.min_total_final));
    if (cfg.min_commission_value != null) setConfigField(configNode, "min_commission_value", String(cfg.min_commission_value));
    if (cfg.commission_rate != null) setConfigField(configNode, "commission_rate", String(cfg.commission_rate));
    if (Array.isArray(cfg.ml_categories) && cfg.ml_categories.length) {
      setConfigField(configNode, "ml_categories", JSON.stringify(cfg.ml_categories, null, 2));
    }
  }

  // ---- Data Table do cliente (Upsert + Get Existing IDs) ----
  const tableId = job.n8n_datatable_id;
  const tableName = job.data_table_name || "ML_SCRAPPER";
  if (tableId) {
    for (const nm of ["Upsert row(s)", "Get Existing IDs"]) {
      const node = findNode(wf, nm);
      if (!node) continue;
      node.parameters = node.parameters || {};
      node.parameters.dataTableId = {
        __rl: true,
        value: tableId,
        mode: "list",
        cachedResultName: tableName,
      };
    }
  }

  // ---- cleanup pra evitar conflitos no POST do n8n ----
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
