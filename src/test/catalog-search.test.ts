import { describe, it, expect } from "vitest";
import { queryCatalogProducts, searchOptionsFromMessage, contextualCatalogSearch } from "../../supabase/functions/_shared/catalog-search";
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
describe("Pedido genérico de tubo", () => {
  const tubes = ["TUBO DE COBRE 15MM", "TUBO PVC 25MM", "TUBO DE COBRE 22MM"].map((nome, i) => ({ ...products[0], codigo: String(i), nome, categoria: "Tubos", marca: "", especificacoes: "" }));
  for (const quantity of ["três", "3"]) it(`separa ${quantity} metros da escolha do tubo`, () => {
    expect(contextualCatalogSearch(tubes, [`Me vê um orçamento de ${quantity} metros de tubo`])?.result.produtos.map(p => p.nome)).toEqual(tubes.map(p => p.nome));
  });
  it("preserva a medida especificada pelo cliente", () => {
    expect(contextualCatalogSearch(tubes, ["3 metros de tubo de cobre 15mm"])?.result.produtos.map(p => p.nome)).toEqual(["TUBO DE COBRE 15MM"]);
  });
});
describe("Planilha com colunas desalinhadas", () => {
  const sheet = [
    { codigo: "618341747982", categoria: "1736", nome: "TINTA MIL INTERNA VERDE ESMERALDA 3L", marca: "", especificacoes: "Ativo", preco: "30,9", unidade: "0", estoque: "13" },
    { codigo: "", categoria: "2710", nome: "TORNEIRA CROMADA YORA", marca: "", especificacoes: "Ativo", preco: "45", unidade: "0", estoque: "2" },
  ];
  it("categoria chutada errada não esconde produto achado pelo nome", () => { expect(queryCatalogProducts(sheet, { consulta: "torneira", categoria: "Metais sanitários" }).produtos[0].nome).toBe("TORNEIRA CROMADA YORA"); });
  it("usa o produto pedido antes quando a última mensagem é só 'Veja aí'", () => { expect(contextualCatalogSearch(sheet, ["Me vê uma torneira então", "Certo", "Veja aí"])?.result.produtos[0].nome).toBe("TORNEIRA CROMADA YORA"); });
  it("não lista códigos numéricos como categorias", () => { expect(queryCatalogProducts(sheet, { consulta: "geladeira" }).categorias_disponiveis).toEqual([]); });
});
describe("Consulta sem resultados", () => {
  it("não substitui caixa d’água ausente pela torneira de uma pergunta antiga", () => {
    const sheet = [{ ...products[0], nome: "TORNEIRA CROMADA", categoria: "Metais", especificacoes: "", marca: "" }];
    const search = contextualCatalogSearch(sheet, ["torneira", "tem caixa d'água de 2.000 litros?"]);
    expect(search?.consulta).toBe("tem caixa d'água de 2.000 litros?");
    expect(search?.result.total).toBe(0);
    expect(search?.result.pesquisa_concluida).toBe(true);
    expect(search?.result.produtos_analisados).toBe(1);
  });
  it("2000 litros não corresponde a 1000 litros e aceita escrita 2.000 L", () => {
    const sheet = [1000, 2000].map(capacity => ({ ...products[0], nome: `CAIXA DAGUA ${capacity}L`, categoria: "", marca: "", especificacoes: "" }));
    expect(contextualCatalogSearch(sheet, ["caixa d'água de 2.000 litros"])?.result.produtos.map(p => p.nome)).toEqual(["CAIXA DAGUA 2000L"]);
  });
  it("tubo ausente encerra a busca de todas as 5500 linhas", () => {
    const search = contextualCatalogSearch(products, ["três metros de tubo"]);
    expect(search?.result.total).toBe(0);
    expect(search?.result.produtos_analisados).toBe(5500);
    expect(search?.result.pesquisa_concluida).toBe(true);
  });
});
