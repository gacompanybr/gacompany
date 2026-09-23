import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CatalogError,
  extractGoogleSheetCsvUrl,
  normalizeCatalogValue,
  parseCatalogCsv,
  searchCatalogProducts,
} from "../_shared/product-catalog.ts";

Deno.test("extrai id e gid do link do Google Sheets", () => {
  assertEquals(
    extractGoogleSheetCsvUrl("https://docs.google.com/spreadsheets/d/abc_123/edit#gid=456"),
    "https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=456",
  );
});

Deno.test("recusa links que não são do Google Sheets", () => {
  const error = assertThrows(
    () => extractGoogleSheetCsvUrl("https://example.com/spreadsheets/d/abc/edit"),
    CatalogError,
  );
  assertEquals(error.code, "invalid_link");
});

Deno.test("normaliza categorias conforme a regra", () => {
  assertEquals(normalizeCatalogValue("Tijólo - Bloco d'Água"), "tijolo_bloco_dagua");
});

Deno.test("lê CSV com vírgula, ponto e vírgula e aspas", () => {
  const csv = [
    "CÓDIGO;Categoria;Nome;Marca;Especificações;Preço;Unidade;Estoque",
    '001;Tinta;"Tinta, premium";Marca X;"Uso interno; lavável";"R$ 49,90";Lata;12',
  ].join("\n");
  const products = parseCatalogCsv(csv);
  assertEquals(products[0], {
    codigo: "001",
    categoria: "Tinta",
    nome: "Tinta, premium",
    marca: "Marca X",
    especificacoes: "Uso interno; lavável",
    preco: "R$ 49,90",
    unidade: "Lata",
    estoque: "12",
  });
});

Deno.test("informa todas as colunas faltantes", () => {
  const error = assertThrows(() => parseCatalogCsv("codigo,categoria,nome\n1,Tinta,A"), CatalogError);
  assertEquals(error.message, "Colunas faltando: marca, especificacoes, preco, unidade, estoque.");
});

Deno.test("busca categoria normalizada e limita produtos a 60", () => {
  const products = Array.from({ length: 65 }, (_, index) => ({
    codigo: String(index + 1),
    categoria: "Tijolo-Bloco",
    nome: `Produto ${index + 1}`,
    marca: "Marca",
    especificacoes: "",
    preco: "R$ 1,00",
    unidade: "un",
    estoque: "10",
  }));
  const result = searchCatalogProducts(products, "tijolo bloco");
  assertEquals(result.total, 65);
  assertEquals(result.produtos.length, 60);
});

Deno.test("lista categorias quando não encontra produtos", () => {
  const products = [{
    codigo: "1",
    categoria: "Tintas",
    nome: "Produto",
    marca: "Marca",
    especificacoes: "",
    preco: "10",
    unidade: "un",
    estoque: "2",
  }];
  const result = searchCatalogProducts(products, "chuveiro");
  assertEquals(result, {
    categoria: "chuveiro",
    total: 0,
    produtos: [],
    categorias_disponiveis: ["Tintas"],
  });
});