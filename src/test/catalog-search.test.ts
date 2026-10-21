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
describe("Palavras de conversa não zeram a busca", () => {
  it("ignora palavras fora da planilha quando há palavra de produto", () => {
    expect(queryCatalogProducts(products, { consulta: "parafusadeira entrega hoje" }).total).toBe(5500);
  });
  it("palavra de produto com erro de digitação não vira ruído", () => {
    expect(queryCatalogProducts(products, { consulta: "parafusadeita entrega" }).total).toBe(5500);
  });
  it("mantém busca concluída quando nenhuma palavra existe na planilha", () => {
    const r = queryCatalogProducts(products, { consulta: "caixa dagua" });
    expect(r.total).toBe(0);
    expect(r.pesquisa_concluida).toBe(true);
  });
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

describe("Primeira consulta por nomes populares e parciais", () => {
  // Exact rows observed in the linked sheet; no generated commercial data.
  const sheet = [
    { codigo: "", nome: "TUBO ESGOTO 50MMX6MT KRONA", categoria: "1460", marca: "", especificacoes: "Ativo", preco: "18", estoque: "31,99", unidade: "0" },
    { codigo: "618341747982", nome: "TINTA MIL INTERNA VERDE ESMERALDA 3L", categoria: "1736", marca: "", especificacoes: "Ativo", preco: "30,9", estoque: "13", unidade: "0" },
    { codigo: "outra-tinta", nome: "TINTA BRANCA 3L", categoria: "", marca: "", especificacoes: "", preco: "", estoque: "0", unidade: "" },
  ];
  for (const consulta of ["Vocês têm cano de esgoto?", "tubo de esgoto", "esgoto", "TUBO ESGOTO 50MMX6MT KRONA", "canos de esgoto"]) {
    it(`localiza esgoto sem insistência: ${consulta}`, () => {
      const result = contextualCatalogSearch(sheet, [consulta]);
      expect(result?.result.produtos).toEqual([sheet[0]]);
      expect(result?.result.produtos[0].preco).toBe("18");
      expect(result?.result.produtos[0].estoque).toBe("31,99");
    });
  }
  it("mantém o termo parcial como restrição, em vez de retornar todas as tintas", () => {
    expect(queryCatalogProducts(sheet, { consulta: "tinta esmeral" }).produtos).toEqual([sheet[1]]);
  });
  it("aceita acento, espaços, plural e ordem de palavras", () => {
    expect(queryCatalogProducts(sheet, { consulta: "  esméraldas   tintas " }).produtos).toEqual([sheet[1]]);
  });
  it("não relaxa a dimensão quando usa um nome popular", () => {
    expect(queryCatalogProducts(sheet, { consulta: "cano esgoto 100MMX6MT" }).total).toBe(0);
  });
  it("registra termos alternativos pesquisados sobre o mesmo conjunto completo", () => {
    const result = queryCatalogProducts(sheet, { consulta: "cano esgoto" });
    expect(result.consultas_executadas).toContain("tubo esgoto");
    expect(result.produtos_analisados).toBe(3);
  });
  it("singulariza plurais irregulares de outras categorias", () => {
    const product = { ...sheet[0], nome: "CONEXAO SOLDAVEL PVC" };
    expect(queryCatalogProducts([product], { consulta: "conexões soldáveis" }).total).toBe(1);
    expect(queryCatalogProducts([{ ...product, nome: "CONEXAO ROSCAVEL PVC" }], { consulta: "conexões soldáveis" }).total).toBe(0);
  });
});

describe("Busca em camadas com equivalências (spec de nomes populares)", () => {
  const base = { categoria: "", marca: "", unidade: "un" };
  const sheet = [
    { ...base, codigo: "1", nome: "TINTA MIL INTERNA VERDE ESMERALDA 3L", especificacoes: "Ativo", preco: "30,9", estoque: "13" },
    { ...base, codigo: "2", nome: "TINTA MIL INTERNA VERDE ESMERALDA 15L", especificacoes: "Ativo", preco: "85", estoque: "4" },
    { ...base, codigo: "3", nome: "TINTA ESMERALDA STALUX NOVOLAR 15LT", especificacoes: "Ativo", preco: "120", estoque: "2" },
    { ...base, codigo: "4", nome: "TUBO DE COBRE PANC 1/2", especificacoes: "Ativo", preco: "90", estoque: "7" },
    { ...base, codigo: "5", nome: "TOMADA CANOA BRANCA", especificacoes: "Ativo", preco: "12", estoque: "30" },
    { ...base, codigo: "6", nome: "TUBO SOLD 25MM X 6MT", especificacoes: "Ativo", preco: "22", estoque: "15" },
    { ...base, codigo: "7", nome: "TUBO ESGOTO 50MMX6MT KRONA", especificacoes: "Ativo", preco: "18", estoque: "31" },
    { ...base, codigo: "8", nome: "CAIXA D'AGUA 1000L", especificacoes: "Ativo", preco: "350", estoque: "3" },
    { ...base, codigo: "9", nome: "TINTA LATEX BRANCA 15L", especificacoes: "Ativo", preco: "50", estoque: "5" },
    { ...base, codigo: "10", nome: "TINTA ECONOMICA 15L", especificacoes: "Ativo", preco: "10", estoque: "0" },
    { ...base, codigo: "11", nome: "TINTA INATIVA 1L", especificacoes: "Inativo", preco: "5", estoque: "9" },
  ];
  const codigos = (consulta: string, extra: object = {}) => queryCatalogProducts(sheet, { consulta, ...extra }).produtos.map((p) => p.codigo);

  it("tinta esmeralda inclui os 3 itens", () => {
    expect(codigos("tinta esmeralda")).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });
  it("tinta mil esmeralda inclui os 2 itens TINTA MIL", () => {
    const found = codigos("tinta mil esmeralda");
    expect(found).toEqual(expect.arrayContaining(["1", "2"]));
    expect(found).not.toContain("3");
  });
  it("cano de cobre acha TUBO DE COBRE PANC e não acha tomada CANOA", () => {
    const found = codigos("cano de cobre");
    expect(found).toContain("4");
    expect(found).not.toContain("5");
  });
  it("cano de água acha TUBO SOLD pela equivalência com soldável", () => {
    const result = queryCatalogProducts(sheet, { consulta: "cano de água" });
    expect(result.produtos.map((p) => p.codigo)).toContain("6");
    expect(result.camada).toBe("equivalencias");
  });
  it("cano de água 25mm mantém a medida como restrição", () => {
    expect(codigos("cano de água 25mm")).toEqual(["6"]);
  });
  it("cano de esgoto acha TUBO ESGOTO", () => {
    expect(codigos("cano de esgoto")).toContain("7");
  });
  it("caixa dagua, caixa d água e caixa d'água retornam o mesmo resultado", () => {
    const expected = codigos("caixa dagua");
    expect(expected).toEqual(["8"]);
    expect(codigos("caixa d água")).toEqual(expected);
    expect(codigos("caixa d'água")).toEqual(expected);
  });
  it("tubo de cobre e cano de cobre retornam o mesmo resultado", () => {
    expect(codigos("tubo de cobre")).toEqual(codigos("cano de cobre"));
  });
  it("tinta por menor preço começa no mais barato com preço > 0 e estoque > 0", () => {
    const result = queryCatalogProducts(sheet, { consulta: "tinta", ordenar: "menor_preco" });
    expect(result.produtos[0].codigo).toBe("1");
    expect(result.produtos.map((p) => p.codigo)).not.toContain("11");
  });
  it("nenhum resultado expõe coluna de custo", () => {
    for (const product of queryCatalogProducts(sheet, { consulta: "tinta" }).produtos) {
    expect(Object.keys(product).sort()).toEqual(["categoria", "codigo", "especificacoes", "estoque", "marca", "nome", "preco", "unidade"]);
    }
  });
  it("linha Inativo fica fora da busca e volta só com incluir_inativos", () => {
    expect(codigos("inativa")).toEqual([]);
    expect(codigos("inativa", { incluir_inativos: true })).toEqual(["11"]);
  });
  it("informa total_encontrado, retornados, tem_mais e camada", () => {
    const result = queryCatalogProducts(sheet, { consulta: "tinta esmeralda" });
    expect(result.total_encontrado).toBe(3);
    expect(result.retornados).toBe(3);
    expect(result.tem_mais).toBe(false);
    expect(result.camada).toBe("and");
  });
});
