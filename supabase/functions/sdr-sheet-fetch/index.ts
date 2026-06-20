// Proxy fetch para Google Sheets via endpoint gviz (CSV).
// Usa gviz/tq em vez de /export porque /export emite redirect 307 -> googleusercontent
// que depende de cookies de sessão e retorna 400 a partir de servidores headless.
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

    const tryUrls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
    ];

    let csv = "";
    let lastStatus = 0;
    for (const url of tryUrls) {
      const resp = await fetch(url, { redirect: "follow" });
      lastStatus = resp.status;
      const text = await resp.text();
      if (resp.ok && text && !text.trim().startsWith("<") && !text.includes("<!DOCTYPE")) {
        csv = text;
        break;
      }
    }

    if (!csv) {
      return json({
        error: `Planilha não acessível (status ${lastStatus}). Compartilhe como 'Qualquer pessoa com o link' e tente novamente.`,
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
