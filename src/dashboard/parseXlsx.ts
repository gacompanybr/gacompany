import * as XLSX from "xlsx";
import { AdAccount, Campaign } from "./types";

// Heuristic parser for Meta Ads exports (PT-BR or EN headers).
// Detects header row, maps columns, supports account-level or per-campaign rows.
const HEADER_KEYS = {
  campaign: ["nome da campanha", "campaign name", "campanha"],
  account: ["nome da conta", "account name"],
  reach: ["alcance", "reach"],
  impressions: ["impressões", "impressions"],
  spent: ["valor usado", "amount spent", "valor gasto"],
  budget: ["orçamento", "budget"],
  leads: ["leads na meta", "leads", "resultados"],
  conv: ["conversas por mensagem iniciadas", "messaging conversations started"],
  costConv: ["custo por conversa", "cost per messaging"],
  costLead: ["custo por lead", "cost per lead", "custo por resultado"],
  currency: ["moeda", "currency"],
  start: ["início dos relatórios", "reporting starts"],
  end: ["encerramento dos relatórios", "reporting ends"],
};

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
    if (cells.some((c) => HEADER_KEYS.reach.includes(c)) && cells.some((c) => HEADER_KEYS.impressions.includes(c))) {
      return i;
    }
  }
  return -1;
}

function indexOfAny(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.includes(h.toLowerCase().trim()));
}

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export type ParsedAccount = {
  account: AdAccount;
  warnings: string[];
};

export function parseMetaAdsWorkbook(file: ArrayBuffer, fallbackName = "Nova Conta"): ParsedAccount {
  const wb = XLSX.read(file, { type: "array" });
  const warnings: string[] = [];

  // Prefer "Raw Data" sheet, fallback first
  const sheetName =
    wb.SheetNames.find((n) => /raw/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) throw new Error("Não foi possível encontrar o cabeçalho da planilha.");

  const headers = rows[headerIdx].map((c) => String(c ?? ""));
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c != null && c !== ""));

  const idx = {
    campaign: indexOfAny(headers, HEADER_KEYS.campaign),
    account: indexOfAny(headers, HEADER_KEYS.account),
    reach: indexOfAny(headers, HEADER_KEYS.reach),
    impressions: indexOfAny(headers, HEADER_KEYS.impressions),
    spent: indexOfAny(headers, HEADER_KEYS.spent),
    budget: indexOfAny(headers, HEADER_KEYS.budget),
    leads: indexOfAny(headers, HEADER_KEYS.leads),
    conv: indexOfAny(headers, HEADER_KEYS.conv),
    costConv: indexOfAny(headers, HEADER_KEYS.costConv),
    costLead: indexOfAny(headers, HEADER_KEYS.costLead),
    currency: indexOfAny(headers, HEADER_KEYS.currency),
    start: indexOfAny(headers, HEADER_KEYS.start),
    end: indexOfAny(headers, HEADER_KEYS.end),
  };

  const campaigns: Campaign[] = [];
  let currency = "BRL";
  let startDate = "";
  let endDate = "";
  let accountName = fallbackName;

  // Use only the row that has an account name (skip the empty-name duplicate row)
  const validRows = dataRows.filter((r) => {
    if (idx.account === -1) return true;
    const v = r[idx.account];
    return v != null && String(v).trim() !== "";
  });

  const useRows = validRows.length ? validRows : dataRows;

  useRows.forEach((r, i) => {
    if (idx.currency !== -1 && r[idx.currency]) currency = String(r[idx.currency]);
    if (idx.start !== -1 && r[idx.start]) startDate = String(r[idx.start]).slice(0, 10);
    if (idx.end !== -1 && r[idx.end]) endDate = String(r[idx.end]).slice(0, 10);
    if (idx.account !== -1 && r[idx.account]) accountName = String(r[idx.account]);

    const cName =
      idx.campaign !== -1 && r[idx.campaign]
        ? String(r[idx.campaign])
        : `Campanha ${i + 1}`;

    const leads = idx.leads !== -1 ? num(r[idx.leads]) : 0;
    const conv = idx.conv !== -1 ? num(r[idx.conv]) : 0;
    const spent = idx.spent !== -1 ? num(r[idx.spent]) : 0;
    const budget = idx.budget !== -1 ? num(r[idx.budget]) : 0;
    const impressions = idx.impressions !== -1 ? num(r[idx.impressions]) : 0;
    const reach = idx.reach !== -1 ? num(r[idx.reach]) : 0;

    // Choose primary result: prefer conversations if present, else leads
    const useConv = conv > 0;
    const results = useConv ? conv : leads;
    const resultType = useConv ? "Conversas iniciadas" : "Leads gerados";
    const costPerResult =
      useConv && idx.costConv !== -1
        ? num(r[idx.costConv])
        : idx.costLead !== -1
        ? num(r[idx.costLead])
        : results > 0
        ? spent / results
        : 0;

    if (idx.campaign === -1) {
      // Account-level: split into 2 logical campaigns if both leads & conv exist
      if (conv > 0) {
        campaigns.push({
          id: `c-conv-${i}`,
          name: "Captação - Conversas",
          results: conv,
          resultType: "Conversas iniciadas",
          costPerResult: idx.costConv !== -1 ? num(r[idx.costConv]) : conv ? spent / conv : 0,
          budget,
          spent,
          impressions,
          reach,
          date: startDate,
        });
      }
      if (leads > 0) {
        campaigns.push({
          id: `c-lead-${i}`,
          name: "Captação - Leads",
          results: leads,
          resultType: "Leads na Meta",
          costPerResult: idx.costLead !== -1 ? num(r[idx.costLead]) : leads ? spent / leads : 0,
          budget: 0,
          spent: 0,
          impressions: 0,
          reach: 0,
          date: startDate,
        });
      }
      if (conv === 0 && leads === 0) {
        campaigns.push({
          id: `c-${i}`,
          name: cName,
          results: 0,
          resultType: "Sem resultado",
          costPerResult: 0,
          budget,
          spent,
          impressions,
          reach,
          date: startDate,
        });
      }
    } else {
      campaigns.push({
        id: `c-${i}`,
        name: cName,
        results,
        resultType,
        costPerResult,
        budget,
        spent,
        impressions,
        reach,
        date: startDate,
      });
    }
  });

  if (!campaigns.length) warnings.push("Nenhuma campanha foi identificada.");

  const account: AdAccount = {
    id: `acc-${Date.now()}`,
    name: accountName,
    currency,
    startDate,
    endDate,
    resultDescription:
      "Resultados de Meta Ads no período selecionado (conversas iniciadas e/ou leads).",
    campaigns,
  };

  return { account, warnings };
}
