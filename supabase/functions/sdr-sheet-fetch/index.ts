// Proxy fetch para Google Sheets via export CSV.
// Resolve o problema de CORS / redirect que impede leitura direta do navegador.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sheetUrl } = await req.json();
    if (!sheetUrl || typeof sheetUrl !== "string") {
      return json({ error: "sheetUrl obrigatório" }, 400);
    }

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return json({ error: "URL inválida do Google Sheets" }, 400);
    const sheetId = match[1];
    const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const resp = await fetch(csvUrl, { redirect: "follow" });

    if (!resp.ok) {
      return json({
        error: "Não foi possível acessar a planilha. Verifique se o compartilhamento está como 'Qualquer pessoa com o link' e tente novamente.",
      }, 400);
    }

    const csv = await resp.text();

    // Detecção: se Google devolveu HTML de login em vez de CSV
    if (csv.trim().startsWith("<") || csv.includes("<!DOCTYPE")) {
      return json({
        error: "Planilha não é pública. Compartilhe como 'Qualquer pessoa com o link' e tente novamente.",
      }, 400);
    }

    return json({ csv });
  } catch (e) {
    return json({ error: (e as Error).message || "Falha ao ler planilha" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
