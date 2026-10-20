export const MAX_CATALOG_TOOL_ROUNDS = 1;
export const CATALOG_RESPONSE_TIMEOUT_MS = 15000;

export function catalogResponseFallback(result?: { total: number; pesquisa_concluida: boolean } | null): string {
  if (result?.pesquisa_concluida && result.total === 0) {
    return "Não encontrei esse produto com as características pedidas no catálogo consultado. Você gostaria de verificar outra opção?";
  }
  return "Não consegui concluir a verificação agora. Pode me confirmar o nome e a medida do produto, por favor?";
}

// Includes network AND body reading; a stalled model cannot leave a catalog request silent.
export async function boundedCatalogResponse(
  request: (signal: AbortSignal) => Promise<Response>, fallback: () => string,
  timeoutMs = CATALOG_RESPONSE_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const safeResponse = () => new Response(JSON.stringify({ choices: [{ message: { content: fallback() }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  try {
    return await Promise.race([
      (async () => {
        const response = await request(controller.signal);
        if (!response.ok) return safeResponse();
        const body = await response.text();
        JSON.parse(body);
        return new Response(body, { headers: { "Content-Type": "application/json" } });
      })(),
      new Promise<Response>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(safeResponse()); }, timeoutMs); }),
    ]);
  } catch {
    return safeResponse();
  } finally {
    if (timer) clearTimeout(timer);
  }
}