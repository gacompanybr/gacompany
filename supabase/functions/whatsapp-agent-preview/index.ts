// Preview do agente WhatsApp — usa Lovable AI Gateway (gratuito)
import { createClient } from "npm:@supabase/supabase-js@2";
import { boundedCatalogResponse, catalogResponseFallback, MAX_CATALOG_TOOL_ROUNDS } from "../_shared/catalog-response.ts";
import { fetchProductCatalog } from "../_shared/product-catalog.ts";
import { queryCatalogProducts, productSearchTool, contextualCatalogSearch, catalogGroundingInstruction } from "../_shared/catalog-search.ts";
import { safeAgentEnabled } from "../_shared/agent-safe-policy.ts";
import { generateSafeAgentResponse } from "../_shared/agent-safe-response.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY não configurado" }, 500);
    }

    const body = await req.json();
    // Fetch protected options server-side; never accept an opt-in supplied by the browser.
    if (body.portfolioId) {
      const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) return json({ error: "Serviço indisponível" }, 500);
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth.user) return json({ error: "Não autenticado" }, 401);
      const { data: access } = await admin.rpc("has_portfolio_access", { _user_id: auth.user.id, _portfolio_id: body.portfolioId });
      if (!access) return json({ error: "Sem acesso ao cliente" }, 403);
      const { data: configured } = await admin.from("whatsapp_agents").select("*").eq("portfolio_id", body.portfolioId).maybeSingle();
      if (configured && safeAgentEnabled(configured)) {
        if (typeof body.userMessage !== "string" || !body.userMessage.trim() || body.userMessage.length > 10000) return json({ error: "Mensagem inválida" }, 400);
        const turns = (Array.isArray(body.messages) ? body.messages : []).filter((m: any) => ["user", "assistant"].includes(m?.role) && typeof m?.content === "string").slice(-60).map((m: any) => ({ role: m.role, mensagem: m.content.slice(0, 10000) }));
        turns.push({ role: "user", mensagem: body.userMessage });
        let snapshot: Awaited<ReturnType<typeof fetchProductCatalog>> | undefined, failed = false;
        if (configured.catalogo_url) try { snapshot = await fetchProductCatalog(configured.catalogo_url); } catch { failed = true; }
        const result = await generateSafeAgentResponse(configured, turns, LOVABLE_API_KEY, snapshot, failed);
        if (result.gatewayError) return json({ error: result.gatewayError.message }, result.gatewayError.status);
        return json({ reply: result.text, parts: result.parts, handoff_preview: result.handoff, fallback: result.fallback });
      }
    }
    const { systemPrompt, userMessage, messages = [], model = "openai/gpt-6-astra", temperature = 0.7, maxTokens = 500 } = body;
    const catalogoUrl = typeof body.catalogoUrl === "string" ? body.catalogoUrl.trim() : "";
    let catalog: Awaited<ReturnType<typeof fetchProductCatalog>> | undefined;
    if (catalogoUrl) {
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) return json({ error: "Serviço indisponível." }, 500);
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth, error } = await admin.auth.getUser(token);
      if (error || !auth.user) return json({ error: "Não autenticado." }, 401);
      const { data: access, error: accessError } = await admin.rpc("has_portfolio_access", { _user_id: auth.user.id, _portfolio_id: body.portfolioId });
      if (accessError || !access) return json({ error: "Você não tem acesso a este cliente." }, 403);
      catalog = await fetchProductCatalog(catalogoUrl);
    }

    if (!userMessage) return json({ error: "userMessage obrigatório" }, 400);

    // Mapear modelo configurado para o gateway
    const modelMap: Record<string, string> = {
      gemini: "openai/gpt-6-astra",
      openai: "openai/gpt-5-mini",
    };
    const finalModel = modelMap[model] ?? model;

    const history = Array.isArray(messages)
      ? messages
          .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
          .slice(-30)
      : [];

    let found = catalog ? contextualCatalogSearch(catalog, [...history.filter((m: any) => m.role === "user").map((m: any) => m.content), userMessage]) : null;
    const aiMessages: any[] = [
      { role: "system", content: systemPrompt ?? "Você é um assistente prestativo." },
      { role: "system", content: "Use o histórico como memória e responda a última mensagem. Não reinicie a conversa se já existe contexto." },
      ...history, { role: "user", content: userMessage },
      ...(catalog ? [{ role: "system", content: `${catalogGroundingInstruction}\nRESULTADO INTERNO: ${JSON.stringify(found?.result ?? "nenhum produto identificado; use buscar_produtos")}` }] : []),
    ];
    async function callAi(toolsEnabled: boolean) { const request = (signal?: AbortSignal) => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: finalModel,
        messages: aiMessages,
        ...(toolsEnabled ? { tools: [productSearchTool] } : {}),
        // temperature omitida: gpt-6-astra aceita apenas o valor padrão
        max_tokens: maxTokens,
      }),
    }); return catalog ? boundedCatalogResponse(request, () => catalogResponseFallback(found?.result)) : request(); }
    let resp = await callAi(Boolean(catalog) && !found);

    if (resp.status === 429) return json({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }, 429);
    if (resp.status === 402) return json({ error: "Créditos esgotados. Adicione créditos em Settings → Workspace → Usage." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return json({ error: "Falha ao gerar resposta" }, 500);
    }

    let data = await resp.json();
    for (let round = 0; catalog && round < MAX_CATALOG_TOOL_ROUNDS; round++) {
      const message = data.choices?.[0]?.message;
      if (!message?.tool_calls?.length) break;
      aiMessages.push(message);
      for (const tool of message.tool_calls) {
        let result: unknown;
        try {
          result = tool.function?.name === "buscar_produtos" ? queryCatalogProducts(catalog, JSON.parse(tool.function.arguments ?? "{}")) : { erro: "Ferramenta desconhecida" };
          if (tool.function?.name === "buscar_produtos") found = { consulta: userMessage, result: result as ReturnType<typeof queryCatalogProducts> };
        } catch { result = { erro: "Consulta inválida", pesquisa_concluida: false }; }
        aiMessages.push({ role: "tool", tool_call_id: tool.id, content: JSON.stringify(result) });
      }
      aiMessages.push({ role: "system", content: "A consulta terminou. Responda agora, inclusive se não encontrou o produto; não execute mais buscas." });
      resp = await callAi(false);
      if (!resp.ok) return json({ error: "Falha ao consultar catálogo", status: resp.status, details: await resp.text() }, resp.status);
      data = await resp.json();
    }
    const reply = data.choices?.[0]?.message?.content?.trim() || catalogResponseFallback(found?.result);
    const parts = splitMessage(reply);
    return json({ reply: parts.join("\n\n"), parts });
  } catch (e) {
    console.error("whatsapp-agent-preview error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function splitMessage(text: string): string[] {
  let raw = (text ?? "").trim();
  if (!raw) return [];
  raw = raw.replace(/^["'`]+|["'`]+$/g, "").replace(/\n?\s*\|\|\|\s*\n?/g, " ||| ").trim();
  if (raw.includes("|||")) return raw.split("|||").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const paragraphs = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.slice(0, 4);
  if (raw.length <= 250 && raw.split(/\n/).length <= 3) return [raw];
  const sentences = raw.match(/[^.!?\n]+[.!?\n]+/g) ?? [raw];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 200 && current.trim()) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 4);
}
