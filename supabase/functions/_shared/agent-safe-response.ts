import { createAgentGateway, AgentGatewayError } from "./agent-gateway.ts";
import { buildSafeAgentPrompt } from "./agent-safe-context.ts";
import { catalogQueries, searchCatalogQueries, safeCatalogGrounding } from "./catalog-multi.ts";
import { extractTeamMarker, DEFAULT_SAFE_FALLBACK, handoffEnabled, splitCompleteMessage } from "./agent-safe-policy.ts";
import type { SearchProduct } from "./catalog-search.ts";
export const multiProductTool = {
  type: "function", name: "buscar_produtos", description: "Consulte separadamente até oito produtos. Retorna até dez opções reais por consulta, mantendo medida e modelo. Uma rodada somente.", strict: true,
  parameters: { type: "object", additionalProperties: false, required: ["consultas"], properties: { consultas: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } } } },
};
export async function generateSafeAgentResponse(agent: any, turns: { role: string; mensagem: string }[], apiKey: string,
  catalog?: SearchProduct[], catalogFailed = false, onSearch?: (query: string, result: any) => void, transport: typeof fetch = fetch) {
  const gateway = createAgentGateway(apiKey, transport);
  const last = turns.filter(t => t.role === "user").at(-1)?.mensagem ?? "";
  const cap = Math.min(Math.max(Number(agent.max_tokens ?? 1200), 500), 3000);
  const model = ({ gemini: "openai/gpt-6-astra", openai: "openai/gpt-5-mini" } as Record<string,string>)[agent.modelo_ia] ?? (agent.modelo_ia?.startsWith("openai/") ? agent.modelo_ia : "openai/gpt-5-mini");
  const input: any[] = [{ role: "system", content: buildSafeAgentPrompt(agent, turns) },
    ...(catalog ? [{ role: "system", content: safeCatalogGrounding }] : []),
    ...(catalogFailed ? [{ role: "system", content: "A leitura de produtos falhou. Não diga que não tem o item nem invente preço. Responda naturalmente deixando a informação pendente para pessoa. Use marcador falha_busca se habilitado." }] : []),
    ...turns.slice(-60).map(t => ({ role: t.role === "user" ? "user" : "assistant", content: t.mensagem })),
  ];
  if (agent._orderResult) input.splice(1, 0, { role: "system", content: `Resultado real do pedido: ${JSON.stringify(agent._orderResult)}. Somente accepted/delivered permite dizer que o pedido foi enviado. Frete a calcular não bloqueia. Nunca confirme pagamento.` });
  let searches: any[] = [];
  if (catalog && agent.catalog_multi_enabled) {
    searches = searchCatalogQueries(catalog, catalogQueries(last, turns.filter(t => t.role === "user").slice(0, -1).map(t => t.mensagem)));
    searches.forEach(r => onSearch?.(r.consulta, r));
    input.splice(1, 0, { role: "system", content: `SUGESTÃO AUTOMÁTICA (pode estar incompleta; confirme com buscar_produtos): ${JSON.stringify(searches)}` });
  }
  let fallback = false, gatewayError: AgentGatewayError | undefined;
  let responseText = "";
  try {
    let response = await gateway(model, input, cap, catalog && agent.catalog_multi_enabled ? [multiProductTool] : undefined);
    if (response.calls.length) {
      if (response.calls.length > 8) throw new Error("Limite de consultas excedido");
      input.push(...response.output);
      const queriesByCall = response.calls.map((call: any) => {
        const args = JSON.parse(call.arguments ?? "{}");
        if (call.name !== "buscar_produtos" || !Array.isArray(args.consultas) || args.consultas.some((q: unknown) => typeof q !== "string" || !q.trim() || q.length > 500)) throw new Error("Consulta inválida");
        return args.consultas as string[];
      });
      if (queriesByCall.reduce((n: number, queries: string[]) => n + queries.length, 0) > 8) throw new Error("Limite de oito produtos excedido");
      for (let i = 0; i < response.calls.length; i++) {
        const results = catalog ? searchCatalogQueries(catalog, queriesByCall[i]) : [];
        results.forEach(r => onSearch?.(r.consulta, r)); searches.push(...results);
        input.push({ type: "function_call_output", call_id: response.calls[i].call_id, output: JSON.stringify(results) });
      }
      input.push({ role: "system", content: "A rodada de produtos terminou. Responda todos os grupos agora usando os dados, inclusive os itens ausentes. Não faça novas chamadas." });
      response = await gateway(model, input, cap);
    }
    responseText = response.text;
    if (!responseText.trim()) throw new Error("Resposta vazia");
  } catch (error) {
    if (error instanceof AgentGatewayError) gatewayError = error;
    fallback = true; responseText = agent.mensagem_fallback?.trim() || DEFAULT_SAFE_FALLBACK;
  }
  const parsed = extractTeamMarker(responseText);
  let handoff = parsed.handoff;
  if (fallback) handoff = { tipo: "falha_ia", resumo: last.slice(0, 300) };
  else if (catalogFailed) handoff ??= { tipo: "falha_busca", resumo: last.slice(0, 300) };
  else if (!handoff && /falar com|atendimento humano|atendente|pessoa|reclamação|reclamacao/i.test(last)) handoff = { tipo: "humano", resumo: last.slice(0, 300) };
  else if (!handoff && /passar|encaminhar|confirmar com.*equipe|avisar.*equipe/i.test(parsed.text)) handoff = { tipo: "duvida", resumo: last.slice(0, 300) };
  else if (!handoff && searches.some(r => r.total > 0 && r.produtos.some((p: SearchProduct) => !p.preco.trim())) && /preço|preco|valor|orçamento|orcamento|quanto/i.test(last)) handoff = { tipo: "sem_preco", resumo: last.slice(0, 300) };
  return { text: parsed.text || DEFAULT_SAFE_FALLBACK, parts: splitCompleteMessage(parsed.text || DEFAULT_SAFE_FALLBACK),
    handoff: handoffEnabled(agent) ? handoff : null, fallback, gatewayError, searches };
}