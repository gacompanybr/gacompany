import { describe, it, expect } from "vitest";
import { boundedCatalogResponse, catalogResponseFallback } from "../../supabase/functions/_shared/catalog-response";

describe("Entrega de resposta de catálogo", () => {
  it("responde com ausência verificada se o modelo trava", async () => {
    let aborted = false;
    const response = await boundedCatalogResponse(signal => {
      signal.addEventListener("abort", () => { aborted = true; });
      return new Promise<Response>(() => {});
    }, () => catalogResponseFallback({ total: 0, pesquisa_concluida: true }), 5);
    expect(aborted).toBe(true);
    expect((await response.json()).choices[0].message.content).toContain("Não encontrei esse produto");
  });
  it("não declara produto ausente quando a leitura falha", async () => {
    const response = await boundedCatalogResponse(async () => { throw new Error("network"); }, () => catalogResponseFallback());
    const reply = (await response.json()).choices[0].message.content;
    expect(reply).toContain("Não consegui concluir");
    expect(reply).not.toContain("Não encontrei");
  });
  it("preserva a resposta normal quando a consulta funciona", async () => {
    const response = await boundedCatalogResponse(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Opção real" } }] })), () => "fallback");
    expect((await response.json()).choices[0].message.content).toBe("Opção real");
  });
  it("erro do gateway também produz resposta enviável", async () => {
    const response = await boundedCatalogResponse(async () => new Response("error", { status: 500 }), () => "Não consegui verificar");
    expect(response.ok).toBe(true);
    expect((await response.json()).choices[0].message.content).toBe("Não consegui verificar");
  });
});