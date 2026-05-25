// Edge Function: meta-oauth-callback
// Recebe o "code" do Facebook OAuth, troca por access_token de longa duração,
// descobre as páginas + contas IG Business do usuário e salva no banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const META_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const APP_ID = Deno.env.get("META_APP_ID")!;
  const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const url = new URL(req.url);
  const isGet = req.method === "GET";

  let code: string | null = null;
  let portfolio_id: string | null = null;
  let redirect_uri: string | null = null;

  if (isGet) {
    code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (state) {
      try {
        const parsed = JSON.parse(atob(state));
        portfolio_id = parsed.portfolio_id ?? null;
        redirect_uri = parsed.redirect_uri ?? null;
      } catch { /* ignore */ }
    }
  } else {
    const body = await req.json().catch(() => ({}));
    code = body.code ?? null;
    portfolio_id = body.portfolio_id ?? null;
    redirect_uri = body.redirect_uri ?? null;
  }

  if (!code || !portfolio_id || !redirect_uri) {
    return new Response(JSON.stringify({ error: "Missing code/portfolio_id/redirect_uri" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1) Trocar code por short-lived token
    const tokenUrl = `${META_API}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirect_uri)}&code=${encodeURIComponent(code)}`;
    const tokRes = await fetch(tokenUrl);
    const tokJson = await tokRes.json();
    if (!tokRes.ok) throw new Error(tokJson?.error?.message ?? "Falha ao trocar code");
    const shortToken: string = tokJson.access_token;

    // 2) Trocar por long-lived (~60 dias)
    const llUrl = `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`;
    const llRes = await fetch(llUrl);
    const llJson = await llRes.json();
    if (!llRes.ok) throw new Error(llJson?.error?.message ?? "Falha ao gerar long-lived token");
    const userToken: string = llJson.access_token;
    const expiresIn: number = llJson.expires_in ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Pegar user id
    const meRes = await fetch(`${META_API}/me?access_token=${userToken}`);
    const me = await meRes.json();
    const fbUserId = me.id;

    // 4) Listar páginas (com page access token + ig_business)
    const pagesRes = await fetch(`${META_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`);
    const pagesJson = await pagesRes.json();
    const pages = pagesJson.data ?? [];

    if (!pages.length) {
      return new Response(JSON.stringify({ ok: false, error: "Nenhuma página encontrada. Vincule uma página do Facebook no Business Manager." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saved: any[] = [];
    for (const p of pages) {
      const ig = p.instagram_business_account;
      const { error } = await admin.from("social_media_integrations").upsert({
        portfolio_id,
        fb_user_id: fbUserId,
        fb_page_id: p.id,
        fb_page_name: p.name,
        ig_business_id: ig?.id ?? null,
        ig_username: ig?.username ?? null,
        access_token: p.access_token, // PAGE token (não expira, recomendado para posts)
        token_expires_at: expiresAt,
        status: "active",
        last_error: null,
      }, { onConflict: "portfolio_id,fb_page_id" });
      if (!error) saved.push({ page: p.name, ig: ig?.username ?? null });
    }

    // Se for GET (vindo do redirect), devolver HTML que fecha popup
    if (isGet) {
      const html = `<!doctype html><html><body><script>
        if (window.opener) { window.opener.postMessage({ type: 'meta-oauth-success', saved: ${JSON.stringify(saved)} }, '*'); window.close(); }
        else { document.body.innerHTML = '<h2>Conectado! Pode fechar esta aba.</h2>'; }
      </script></body></html>`;
      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html" } });
    }

    return new Response(JSON.stringify({ ok: true, saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isGet) {
      const html = `<!doctype html><html><body><script>
        if (window.opener) { window.opener.postMessage({ type: 'meta-oauth-error', error: ${JSON.stringify(msg)} }, '*'); window.close(); }
        else { document.body.innerHTML = '<h2>Erro: ${msg.replace(/</g, "&lt;")}</h2>'; }
      </script></body></html>`;
      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html" } });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
