import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ID = Deno.env.get("MERCADOLIVRE_APP_ID")!;
const SECRET = Deno.env.get("MERCADOLIVRE_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/ml-oauth-callback`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Mercado Livre</title>
     <style>body{font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
     .card{background:#1a1a1a;padding:32px;border-radius:12px;max-width:480px;text-align:center;border:1px solid #333}
     h1{color:#FEA60F;margin:0 0 12px;font-size:20px}p{color:#bbb;line-height:1.5;margin:8px 0}
     .ok{color:#4ade80}.err{color:#f87171}</style></head>
     <body><div class="card">${body}<p style="margin-top:24px;font-size:13px;color:#666">Pode fechar esta aba e voltar ao painel.</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // portfolio_id
  const error = url.searchParams.get("error");

  if (error) {
    return html(`<h1 class="err">Erro na conexão</h1><p>${error}: ${url.searchParams.get("error_description") ?? ""}</p>`, 400);
  }
  if (!code || !state) {
    return html(`<h1 class="err">Parâmetros faltando</h1><p>code ou state ausentes.</p>`, 400);
  }

  // state = "portfolio_id" (legado) ou "portfolio_id:robo_id"
  const [portfolioId, roboId] = state.split(":");


  try {
    // Troca code por access_token
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: APP_ID,
        client_secret: SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return html(`<h1 class="err">Falha ao trocar code por token</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`, 400);
    }

    const { access_token, refresh_token, expires_in, scope, user_id } = tokenData;

    // Busca nickname
    let nickname: string | null = null;
    try {
      const meRes = await fetch(`https://api.mercadolibre.com/users/${user_id}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (meRes.ok) nickname = (await meRes.json()).nickname ?? null;
    } catch (_) {}

    const expires_at = new Date(Date.now() + (expires_in ?? 21600) * 1000).toISOString();

    // Se tem robo_id, vincula ao robô (1 robô = 1 conexão). Senão, fallback no portfolio.
    const row: any = {
      portfolio_id: portfolioId,
      ml_user_id: String(user_id),
      nickname,
      access_token,
      refresh_token,
      expires_at,
      scope,
      status: "active",
      last_error: null,
    };
    if (roboId) row.robo_campanha_id = roboId;

    const onConflict = roboId ? "robo_campanha_id" : "portfolio_id,ml_user_id";
    const { error: upErr } = await admin
      .from("mercadolivre_integracoes")
      .upsert(row, { onConflict });


    if (upErr) {
      return html(`<h1 class="err">Erro ao salvar</h1><p>${upErr.message}</p>`, 500);
    }

    return html(`<h1 class="ok">✓ Mercado Livre conectado</h1>
      <p><strong>${nickname ?? user_id}</strong></p>
      <p>Token válido até ${new Date(expires_at).toLocaleString("pt-BR")}.</p>`);
  } catch (e) {
    return html(`<h1 class="err">Erro inesperado</h1><p>${(e as Error).message}</p>`, 500);
  }
});