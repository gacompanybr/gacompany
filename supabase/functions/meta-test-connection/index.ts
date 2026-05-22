// Edge Function: meta-test-connection
// Diagnóstico de token + conta de anúncio Meta (sem persistir nada).
// Body: { access_token, ad_account_id }  OU  { integration_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const V = "v21.0";
const REQUIRED_PERMS = ["ads_read", "business_management"];

async function gFetch(url: string) {
  const r = await fetch(url);
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch { j = { error: { message: t } }; }
  return { ok: r.ok, status: r.status, json: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: any, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: any = {};
  try { body = await req.json(); } catch {}

  let accessToken: string | undefined = body.access_token;
  let adAccountId: string | undefined = body.ad_account_id;

  if (body.integration_id) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin.from("meta_integracoes").select("access_token, ad_account_id").eq("id", body.integration_id).maybeSingle();
    if (!data) return json({ ok: false, error: "Integração não encontrada" }, 404);
    accessToken = data.access_token;
    adAccountId = data.ad_account_id;
  }

  if (!accessToken || !adAccountId) return json({ ok: false, error: "access_token e ad_account_id obrigatórios" }, 400);
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const tk = encodeURIComponent(accessToken);

  const result: any = {
    token: { valid: false }, account: { accessible: false },
    permissions: { ok: false, granted: [] as string[], missing: [] as string[] },
    campaigns: { count: 0 }, errors: [] as string[],
  };

  // 1. /me
  const me = await gFetch(`https://graph.facebook.com/${V}/me?fields=id,name&access_token=${tk}`);
  if (!me.ok) {
    result.errors.push(`Token inválido: ${me.json?.error?.message ?? me.status}`);
    return json({ ok: false, ...result });
  }
  result.token = { valid: true, user_id: me.json.id, name: me.json.name };

  // 2. permissões
  const perm = await gFetch(`https://graph.facebook.com/${V}/me/permissions?access_token=${tk}`);
  if (perm.ok) {
    const granted = (perm.json.data ?? []).filter((p: any) => p.status === "granted").map((p: any) => p.permission);
    result.permissions.granted = granted;
    result.permissions.missing = REQUIRED_PERMS.filter((p) => !granted.includes(p));
    result.permissions.ok = result.permissions.missing.length === 0;
  } else {
    result.errors.push(`Permissões: ${perm.json?.error?.message ?? perm.status}`);
  }

  // 3. conta
  const acc = await gFetch(`https://graph.facebook.com/${V}/${acct}?fields=id,name,account_status,currency&access_token=${tk}`);
  if (!acc.ok) {
    result.errors.push(`Conta inacessível: ${acc.json?.error?.message ?? acc.status}`);
    return json({ ok: false, ...result });
  }
  result.account = { accessible: true, id: acc.json.id, name: acc.json.name, status: acc.json.account_status, currency: acc.json.currency };

  // 4. campanhas (contagem rápida)
  const cmp = await gFetch(`https://graph.facebook.com/${V}/${acct}/campaigns?fields=id&limit=200&access_token=${tk}`);
  if (cmp.ok) result.campaigns.count = (cmp.json.data ?? []).length;
  else result.errors.push(`Campanhas: ${cmp.json?.error?.message ?? cmp.status}`);

  const ok = result.token.valid && result.account.accessible && result.permissions.ok;
  return json({ ok, ...result });
});
