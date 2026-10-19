import { describe, it, expect } from "vitest";
import { queryCatalogProducts, searchOptionsFromMessage } from "../../supabase/functions/_shared/catalog-search";
const products = Array.from({ length: 5500 }, (_, i) => ({ codigo: String(100000 + i), nome: `Parafusadeira Bosch modelo ${i} 220V`, categoria: "Ferramentas elétricas", marca: "Bosch", especificacoes: "Mandril 10mm", preco: String(5500 - i), estoque: "10", unidade: "un" }));
describe("Catálogo completo", () => {
  for (const position of [0, 2750, 5499]) it(`localiza registro ${position + 1} da base de 5500`, () => {
    expect(queryCatalogProducts(products, { consulta: products[position].codigo }).produtos[0]).toEqual(products[position]);
  });
  it("encontra nome parcial sem depender da categoria", () => { expect(queryCatalogProducts(products, { consulta: "parafusad" }).total).toBe(5500); });
  it("aceita erro de digitação sem misturar voltagem", () => { expect(queryCatalogProducts(products, { consulta: "parafusadeita 220V" }).total).toBe(5500); expect(queryCatalogProducts(products, { consulta: "parafusadeira 110V" }).total).toBe(0); });
  it("ordena menor preço na base completa antes de limitar", () => { expect(queryCatalogProducts(products, { consulta: "parafusadeira", ordenar: "menor_preco" }).produtos[0].codigo).toBe("105499"); });
  it("ordena maior preço na base completa", () => { expect(queryCatalogProducts([...products].reverse(), { consulta: "parafusadeira", ordenar: "maior_preco" }).produtos[0].codigo).toBe("100000"); });
  it("pagina sem perda de registros", () => {
    const ids = new Set(Array.from({ length: 92 }, (_, i) => queryCatalogProducts(products, { consulta: "parafusadeira", pagina: i + 1 }).produtos).flat().map((p) => p.codigo));
    expect(ids.size).toBe(5500);
  });
  it("não exclui preço vazio ou estoque zero", () => {
    const product = { ...products[0], preco: "", estoque: "0", especificacoes: "Descrição extensa com detalhes adicionais de instalação e iluminação" };
    expect(queryCatalogProducts([product], { consulta: "iluminacao", ordenar: "menor_preco" }).produtos[0]).toEqual(product);
  });
  it("lê atualização no próximo conjunto", () => { expect(queryCatalogProducts([{ ...products[0], preco: "R$ 49,90" }], { consulta: "100000" }).produtos[0].preco).toBe("R$ 49,90"); });
  it("identifica intenção de preço em pergunta real", () => { expect(searchOptionsFromMessage("qual parafusadeira mais barata").ordenar).toBe("menor_preco"); });
});