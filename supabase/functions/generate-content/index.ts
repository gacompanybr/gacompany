// Geração de conteúdo (legendas, copies, criativos) via Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurado" }, 500);

    const { systemPrompt, userPrompt, temperature = 0.85, maxTokens = 900 } = await req.json();
    if (!userPrompt) return json({ error: "userPrompt obrigatório" }, 400);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt ?? "Você é um copywriter sênior brasileiro especializado em marketing digital." },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (resp.status === 429) return json({ error: "Limite de requisições atingido. Aguarde alguns segundos." }, 429);
    if (resp.status === 402) return json({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return json({ error: "Falha ao gerar conteúdo" }, 500);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return json({ content });
  } catch (e) {
    console.error("generate-content error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
