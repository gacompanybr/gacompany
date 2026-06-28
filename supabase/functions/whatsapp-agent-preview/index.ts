// Preview do agente WhatsApp — usa Lovable AI Gateway (gratuito)
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
    const { systemPrompt, userMessage, messages = [], model = "google/gemini-2.5-flash", temperature = 0.7, maxTokens = 500 } = body;

    if (!userMessage) return json({ error: "userMessage obrigatório" }, 400);

    // Mapear modelo configurado para o gateway
    const modelMap: Record<string, string> = {
      gemini: "google/gemini-2.5-flash",
      openai: "openai/gpt-5-mini",
    };
    const finalModel = modelMap[model] ?? model;

    const history = Array.isArray(messages)
      ? messages
          .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
          .slice(-30)
      : [];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: finalModel,
        messages: [
          { role: "system", content: systemPrompt ?? "Você é um assistente prestativo." },
          { role: "system", content: "Use o histórico como memória e responda a última mensagem. Não reinicie a conversa se já existe contexto." },
          ...history,
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (resp.status === 429) return json({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }, 429);
    if (resp.status === 402) return json({ error: "Créditos esgotados. Adicione créditos em Settings → Workspace → Usage." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return json({ error: "Falha ao gerar resposta" }, 500);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? "(sem resposta)";
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
