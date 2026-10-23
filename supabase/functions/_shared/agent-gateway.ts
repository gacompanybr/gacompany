export class AgentGatewayError extends Error {
  constructor(public status: number, message: string, public terminal = true) { super(message); }
}
export function agentResponsesBody(model: string, input: unknown[], maxOutput: number, tools?: unknown[]) {
  return { model, input, stream: true, store: false, max_output_tokens: maxOutput,
    ...(model === "openai/chat-latest" ? {} : { reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"] }),
    ...(tools?.length ? { tools, parallel_tool_calls: true } : {}),
  };
}
export function createAgentGateway(apiKey: string, transport: typeof fetch = fetch) {
  let runId: string | undefined;
  return async (model: string, input: unknown[], maxOutput: number, tools?: unknown[]) => {
    const requestBody = agentResponsesBody(model, input, maxOutput, tools);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = new Headers({ "Lovable-API-Key": apiKey, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" });
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      response = await transport("https://ai.gateway.lovable.dev/v1/responses", { method: "POST", headers, body: JSON.stringify(requestBody) });
      runId ??= response.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (response.ok) break;
      const raw = await response.text();
      let error: any;
      try { error = JSON.parse(raw); } catch { error = {}; }
      const message = error.message ?? error.error?.message ?? `Falha no atendimento automático (${response.status})`;
      const transient = (response.status === 429 || response.status >= 500) && error.props?.retryable !== false;
      if (!transient || attempt === 1) throw new AgentGatewayError(response.status, message, !transient);
      const delay = Number(response.headers.get("Retry-After"));
      if (delay > 5) throw new AgentGatewayError(response.status, message, false);
      await new Promise(resolve => setTimeout(resolve, delay > 0 ? delay * 1000 : 1200 + Math.random() * 500));
    }
    if (!response?.body) throw new AgentGatewayError(502, "Resposta do atendimento vazia", false);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", output: any[] = [], content = "";
    const handle = (line: string) => {
      if (!line.startsWith("data:")) return;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return;
      const event = JSON.parse(raw);
      if (event.type === "response.output_text.delta") content += event.delta ?? "";
      if (event.type === "response.completed" || event.type === "response.incomplete") output = event.response?.output ?? [];
      if (event.type === "response.refusal.delta" || event.type === "response.refusal.done") throw new AgentGatewayError(403, "O provedor recusou este atendimento");
      if (event.type === "error" || event.type === "response.failed") throw new AgentGatewayError(event.error?.status ?? 502, event.error?.message ?? event.response?.error?.message ?? "Falha na geração", true);
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
        for (const line of lines) handle(line);
      }
      if (buffer) handle(buffer);
    } finally { reader.releaseLock(); }
    if (output.some(item => item.type === "message" && item.content?.some((p: any) => p.type === "refusal"))) throw new AgentGatewayError(403, "O provedor recusou este atendimento");
    const completedText = output.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(part => part.type === "output_text").map(part => part.text).join("\n");
    return { text: completedText || content, output, calls: output.filter(item => item.type === "function_call"), runId };
  };
}