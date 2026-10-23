import { describe, expect, it } from "vitest";
import { safeAgentEnabled, extractTeamMarker, splitCompleteMessage, summarySimilarity, stopRequested } from "../../supabase/functions/_shared/agent-safe-policy";
import { nextAgentOpening, safeWithinHours } from "../../supabase/functions/_shared/agent-safe-context";
import { catalogQueries, searchCatalogQueries } from "../../supabase/functions/_shared/catalog-multi";
import { agentResponsesBody, createAgentGateway } from "../../supabase/functions/_shared/agent-gateway";
describe("protected agent rollout", () => {
  it("does not enable existing agents without an explicit flag", () => expect(safeAgentEnabled({ portfolio_id: "other" })).toBe(false));
  it("never enables Lopes Saúde even with the flag enabled", () => expect(safeAgentEnabled({ portfolio_id: "bab9656f-f264-4930-9483-c66733394364", melhorias_enabled: true })).toBe(false));
  it("never changes SDR", () => expect(safeAgentEnabled({ portfolio_id: "other", melhorias_enabled: true }, true)).toBe(false));
  it("enables only opted-in receptive agents", () => expect(safeAgentEnabled({ portfolio_id: "other", melhorias_enabled: true })).toBe(true));
  it("recognizes stop requests but not ordinary product refusal", () => { expect(stopRequested("parar de receber mensagens")).toBe(true); expect(stopRequested("não quero esse tubo")).toBe(false); });
  it("uses Jaccard threshold 0.8 for same-topic deduplication", () => { expect(summarySimilarity("instalação ar condicionado amanhã", "instalação ar condicionado amanhã preço")).toBe(0.8); expect(summarySimilarity("instalação ar condicionado", "desconto tinta")).toBe(0); });
});
describe("complete inbound content", () => {
  it("keeps five product groups and their full prices", () => {
    const groups = Array.from({ length: 5 }, (_, i) => `Produto ${i}\nPreço R$ ${i + 10},00`);
    expect(splitCompleteMessage(groups.join("\n\n"))).toEqual(groups);
  });
  it("retains every group even above six blocks", () => { const groups = Array.from({ length: 9 }, (_, i) => `Produto ${i}`); expect(splitCompleteMessage(groups.join("\n\n")).join("\n\n")).toBe(groups.join("\n\n")); });
  it("never breaks a product line", () => { const line = "a".repeat(1000); expect(splitCompleteMessage(`Produto 1\n${line}`)).toContain(line); });
  it("removes valid, malformed and unfinished internal markers", () => {
    expect(extractTeamMarker("Certo [[EQUIPE|humano|instalação]]")).toEqual({ text: "Certo", handoff: { tipo: "humano", resumo: "instalação" } });
    expect(extractTeamMarker("Certo [[errado]] [[EQUIPE|?").text).toBe("Certo");
  });
});
describe("opening time and catalog context", () => {
  const agent = { horarios_por_dia: { sex: { enabled: true, inicio: "08:00", fim: "18:00" }, sab: { enabled: false }, dom: { enabled: false }, seg: { enabled: true, inicio: "08:00", fim: "18:00" } } };
  it("skips closed weekend days using São Paulo timezone", () => expect(nextAgentOpening(agent, new Date("2026-10-23T22:00:00Z"))).toBe("segunda-feira às 08:00"));
  it("handles UTC time before local opening", () => { expect(safeWithinHours(agent, new Date("2026-10-23T10:00:00Z"))).toBe(false); expect(nextAgentOpening(agent, new Date("2026-10-23T10:00:00Z"))).toBe("sexta-feira às 08:00"); });
  it("splits three requested products without swallowing the budget request", () => expect(catalogQueries("cano de cobre, tinta esmeralda, cano de água, quero orçamento")).toEqual(["cano de cobre", "tinta esmeralda", "cano de água"]));
  it("keeps product context when asking o de 25", () => expect(catalogQueries("o de 25", ["tubo soldavel 20mm"])[0]).toContain("tubo soldavel"));
  it("caps multi-item searches at eight", () => expect(catalogQueries(Array.from({ length: 10 }, (_, i) => `produto ${i}`).join(","))).toHaveLength(8));
  it("does not fabricate an unavailable size", () => {
    const products = [{ codigo: "1", categoria: "", nome: "TUBO SOLDAVEL 20mm", marca: "", especificacoes: "", preco: "15,00", unidade: "m", estoque: "5" }];
    expect(searchCatalogQueries(products, ["tubo soldavel 25mm"])[0].total).toBe(0);
  });
});
describe("Responses request and retries", () => {
  it("retains output cap, stateless reasoning and streaming", () => expect(agentResponsesBody("openai/gpt-6-astra", [], 1200)).toMatchObject({ max_output_tokens: 1200, stream: true, store: false, reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"] }));
  it("never retries terminal provider denial", async () => { let calls = 0; const gateway = createAgentGateway("test", async () => { calls++; return new Response(JSON.stringify({ message: "denied" }), { status: 403 }); }); await expect(gateway("openai/gpt-6-astra", [], 1200)).rejects.toMatchObject({ status: 403 }); expect(calls).toBe(1); });
  it("reads streamed output and carries the gateway run id into the next call", async () => {
    const headers: string[] = []; const gateway = createAgentGateway("test", async (_url, init) => { headers.push(new Headers(init?.headers).get("X-Lovable-AIG-Run-ID") ?? ""); return new Response('data: {"type":"response.output_text.delta","delta":"Olá"}\n\ndata: {"type":"response.completed","response":{"output":[]}}\n\n', { headers: { "X-Lovable-AIG-Run-ID": "gateway-run" } }); });
    expect((await gateway("openai/gpt-6-astra", [], 1200)).text).toBe("Olá"); await gateway("openai/gpt-6-astra", [], 1200); expect(headers).toEqual(["", "gateway-run"]);
  });
});