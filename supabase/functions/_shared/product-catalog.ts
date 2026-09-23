import Papa from "npm:papaparse@5.4.1";

export const REQUIRED_CATALOG_COLUMNS = [
  "codigo",
  "categoria",
  "nome",
  "marca",
  "especificacoes",
  "preco",
  "unidade",
  "estoque",
] as const;

export type CatalogProduct = Record<(typeof REQUIRED_CATALOG_COLUMNS)[number], string>;

export class CatalogError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CatalogError";
  }
}

export function normalizeCatalogValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function extractGoogleSheetCsvUrl(sheetUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(sheetUrl.trim());
  } catch {
    throw new CatalogError("Link inválido do Google Sheets.", "invalid_link");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "docs.google.com") {
    throw new CatalogError("Link inválido do Google Sheets.", "invalid_link");
  }

  const match = parsed.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!match?.[1]) throw new CatalogError("Link inválido do Google Sheets.", "invalid_link");

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const gid = parsed.searchParams.get("gid") ?? hashParams.get("gid");
  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export`);
  exportUrl.searchParams.set("format", "csv");
  if (gid && /^\d+$/.test(gid)) exportUrl.searchParams.set("gid", gid);
  return exportUrl.toString();
}

export function parseCatalogCsv(csv: string): CatalogProduct[] {
  const parsed = Papa.parse<string[]>(csv, {
    delimiter: "",
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length && !parsed.data.length) {
    throw new CatalogError("Não foi possível ler o CSV da planilha.", "invalid_csv");
  }

  const rows = parsed.data;
  const rawHeaders = rows[0] ?? [];
  const headerIndexes = new Map<string, number>();
  rawHeaders.forEach((header, index) => {
    const normalized = normalizeCatalogValue(String(header).replace(/^\uFEFF/, "").trim());
    if (normalized && !headerIndexes.has(normalized)) headerIndexes.set(normalized, index);
  });

  const missing = REQUIRED_CATALOG_COLUMNS.filter((column) => !headerIndexes.has(column));
  if (missing.length) {
    throw new CatalogError(`Colunas faltando: ${missing.join(", ")}.`, "missing_columns");
  }

  return rows.slice(1).flatMap((row) => {
    const product = Object.fromEntries(
      REQUIRED_CATALOG_COLUMNS.map((column) => [column, String(row[headerIndexes.get(column) ?? -1] ?? "")]),
    ) as CatalogProduct;
    return Object.values(product).some((value) => value !== "") ? [product] : [];
  });
}

export async function fetchProductCatalog(sheetUrl: string): Promise<CatalogProduct[]> {
  const csvUrl = extractGoogleSheetCsvUrl(sheetUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(csvUrl, { signal: controller.signal, redirect: "follow" });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const body = await response.text();
    const startsAsHtml = /^\s*(?:<!doctype\s+html|<html)/i.test(body);
    if (!response.ok || contentType.includes("text/html") || startsAsHtml) {
      throw new CatalogError(
        "Planilha não compartilhada. Compartilhe como 'Qualquer pessoa com o link: Leitor'.",
        "not_shared",
      );
    }
    return parseCatalogCsv(body);
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CatalogError("A planilha demorou mais de 10 segundos para responder.", "timeout");
    }
    throw new CatalogError("Não foi possível acessar a planilha.", "fetch_failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function listCatalogCategories(products: CatalogProduct[]): string[] {
  return Array.from(new Set(products.map((product) => product.categoria).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function searchCatalogProducts(products: CatalogProduct[], requestedCategory: string) {
  const categoria = normalizeCatalogValue(requestedCategory);
  const matches = products
    .filter((product) => normalizeCatalogValue(product.categoria) === categoria)
    .slice(0, 60)
    .map(({ codigo, nome, marca, especificacoes, preco, unidade, estoque }) => ({
      codigo,
      nome,
      marca,
      especificacoes,
      preco,
      unidade,
      estoque,
    }));

  return matches.length
    ? { categoria, total: matches.length, produtos: matches }
    : { categoria, total: 0, produtos: [], categorias_disponiveis: listCatalogCategories(products) };
}