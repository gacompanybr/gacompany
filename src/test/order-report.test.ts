import { describe, expect, it, vi } from "vitest";
import { dispatchOrder, validateOrder, type OrderDraft } from "../../supabase/functions/_shared/order-report";

const catalog = [{ codigo: "1", nome: "Tinta Mil Verde Esmeralda 3L", categoria: "Tinta", marca: "Mil", especificacoes: "", preco: "30,90", unidade: "UN", estoque: "13" },
  { codigo: "2", nome: "Kit Flex 3 Peças Roma", categoria: "Kit", marca: "Roma", especificacoes: "", preco: "32,10", unidade: "UN", estoque: "0" }];
const turns = [{ role: "user", mensagem: "Sou Bruno" }, { role: "user", mensagem: "Quero comprar", created_at: "2026-10-20T13:40:55Z" }];
const draft: OrderDraft = { intent: true, confirmed: true, confirmation: "Quero comprar", customer: "Bruno", items: catalog.map(p => ({ codigo: p.codigo, nome: p.nome, quantity: 1, unit_price: Number(p.preco.replace(",", ".")) })), modality: "entrega", address: "Avenida Antônio de Barros Muniz, Centro", cep: "56280-025", freight: "A calcular", notes: "Número do endereço a confirmar" };
function database(group: string | null = "120363348833251576@g.us", duplicate = false) {
  const rows: any[] = [];
  const admin = { from(table: string) {
    const chain: any = { select: () => chain, eq: () => chain,
      insert: (row: any) => { rows.push({ table, ...row }); return chain; },
      update: (row: any) => { rows.push({ table, ...row }); return chain; },
      single: async () => table === "whatsapp_agents" ? { data: { report_group_id: group, instancia_id: "own-instance" } } : duplicate ? { error: { code: "23505" }, data: { status: "accepted" } } : { data: { id: "reservation" } },
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    }; return chain;
  } }; return { admin, rows };
}
describe("confirmed product orders", () => {
  it("computes exact total of products independently of freight", () => {
    expect(validateOrder(draft, catalog, turns).total).toBe(63);
  });
  it("does not block pending freight", () => {
    expect(validateOrder(draft, catalog, turns).freight).toBe("A calcular");
  });
  it("requires the customer confirmation from the actual history", () => {
    expect(() => validateOrder({ ...draft, confirmation: "Confirmo tudo" }, catalog, turns)).toThrow();
  });
  it("rejects prices not confirmed against the catalog", () => {
    expect(() => validateOrder({ ...draft, items: [{ ...draft.items[0], unit_price: 3 }] }, catalog, turns)).toThrow();
  });
  it("requires delivery address and CEP", () => {
    expect(() => validateOrder({ ...draft, cep: "" }, catalog, turns)).toThrow();
  });
  it("allows pickup without delivery address", () => {
    expect(validateOrder({ ...draft, modality: "retirada", address: "", cep: "" }, catalog, turns).modality).toBe("retirada");
  });
  it("identifica o produto com palavras em outra ordem e medida decimal", () => {
    const sheet = [{ codigo: "9", nome: "ESPACADOR NIVELADOR EASY SPIN 2MM CORTAG", categoria: "", marca: "", especificacoes: "", preco: "7,30", unidade: "UN", estoque: "50" }];
    const item = { codigo: "", nome: "Espaçador Nivelador Cortag Easy Spin 2,0mm", quantity: 2, unit_price: 7.3 };
    const order = validateOrder({ ...draft, items: [item] }, sheet, turns);
    expect(order.items[0].codigo).toBe("9");
    expect(order.total).toBe(14.6);
  });
  it("sends only to the group's own saved agent configuration and records acceptance", async () => {
    const { admin, rows } = database();
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: { id: "real-message-id" } })));
    expect((await dispatchOrder(admin, { id: "agent", portfolio_id: "portfolio" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "https://evo.example", "secret", transport)).status).toBe("accepted");
    expect(JSON.parse(transport.mock.calls[0][1].body).number).toBe("120363348833251576@g.us");
    expect(rows.some(r => r.status === "accepted" && r.message_id === "real-message-id")).toBe(true);
  });
  it("never falls back to a number or group if no group is saved", async () => {
    const { admin } = database(null); const transport = vi.fn();
    expect((await dispatchOrder(admin, { id: "agent", portfolio_id: "p" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "url", "key", transport)).status).toBe("failed");
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not resend an already reserved order", async () => {
    const { admin } = database(undefined, true); const transport = vi.fn();
    await dispatchOrder(admin, { id: "agent", portfolio_id: "p" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "url", "key", transport);
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not automatically retry a timeout or claim success", async () => {
    const { admin } = database(); const transport = vi.fn().mockRejectedValue(new Error("timeout"));
    expect((await dispatchOrder(admin, { id: "agent", portfolio_id: "p" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "url", "key", transport)).status).toBe("uncertain");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("retries only an explicit rate-limit rejection safely", async () => {
    const { admin } = database();
    const transport = vi.fn().mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: { id: "accepted-after-rejection" } })));
    const result = await dispatchOrder(admin, { id: "agent", portfolio_id: "p" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "url", "key", transport);
    expect(result.status).toBe("accepted");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("does not retry a server error whose delivery is uncertain", async () => {
    const { admin } = database(); const transport = vi.fn().mockResolvedValue(new Response("Unknown", { status: 500 }));
    const result = await dispatchOrder(admin, { id: "agent", portfolio_id: "p" }, "5514997605588", "key", validateOrder(draft, catalog, turns), "CASA DO ELETRICISTA", "url", "key", transport);
    expect(result.status).toBe("uncertain");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});import { orderChanges, formatOrderUpdate } from "../../supabase/functions/_shared/order-report";
describe("order updates after the group report", () => {
  const sent = validateOrder(draft, catalog, turns);
  it("reports a payment method informed after sending", () => {
    const changes = orderChanges(sent, { ...sent, payment: "Pix" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain("FORMA DE PAGAMENTO INFORMADA: Pix");
  });
  it("reports a changed CEP and switch to pickup", () => {
    expect(orderChanges(sent, { ...sent, cep: "56280-000" })[0]).toBe("CEP: 56280-000");
    expect(orderChanges(sent, { ...sent, modality: "retirada" })).toContain("Modalidade: retirada");
  });
  it("sends nothing when nothing changed", () => {
    expect(orderChanges(sent, { ...sent })).toHaveLength(0);
  });
  it("identifies the original order in the update", () => {
    expect(formatOrderUpdate(sent, ["CEP: 1"], "5514", "CASA DO ELETRICISTA", "Bruno")).toContain("ATUALIZAÇÃO DE PEDIDO — CASA DO ELETRICISTA");
  });
});
