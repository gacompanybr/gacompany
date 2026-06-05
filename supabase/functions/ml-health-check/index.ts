// Health check do cookie/CSRF do Mercado Livre Afiliados.
// - Roda via pg_cron a cada 30 min (sem auth) OU manualmente (com SCRAPPER_API_SECRET).
// - Para cada scrapper_job de mercado_livre ativo, testa o endpoint createLink.
// - Salva o resultado em config.ml_cookie_status = { ok, checked_at, status_code, error }.
// - Loga claramente quando o cookie expira para aparecer no console da função.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_SECRET = Deno.env.get("SCRAPPER_API_SECRET") ?? "";

// Permalink real de uma listagem — o endpoint createLink retorna 401 pra URLs
// que não são produto/lista válida (ex.: a home), o que confunde com cookie expirado.
const TEST_PERMALINK = "https://lista.mercadolivre.com.br/perfumes";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

type CookieStatus = {
  ok: boolean;
  checked_at: string;
  status_code: number;
  error: string | null;
  short_url?: string | null;
};

async function testCookie(cookie: string, csrf: string, tag: string): Promise<CookieStatus> {
  const checked_at = new Date().toISOString();
  if (!cookie || !csrf || !tag) {
    return { ok: false, checked_at, status_code: 0, error: "MISSING_CREDENTIALS" };
  }
  try {
    const resp = await fetch(
      "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/json",
          downlink: "10",
          ect: "4g",
          origin: "https://www.mercadolivre.com.br",
          priority: "u=1, i",
          referer: "https://www.mercadolivre.com.br/afiliados/linkbuilder",
          rtt: "50",
          "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent": UA,
          cookie,
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ urls: [TEST_PERMALINK], tag }),
      },
    );
    const status_code = resp.status;
    const raw = await resp.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* ignore */ }

    if (status_code === 401 || status_code === 403) {
      return { ok: false, checked_at, status_code, error: `COOKIE_EXPIRED: ${raw.slice(0, 300)}` };
    }
    const short =
      data?.urls?.[0]?.short_url || data?.urls?.[0]?.shortUrl || data?.short_url || null;
    if (short && /^https?:\/\/meli\.la\//i.test(String(short))) {
      return { ok: true, checked_at, status_code, error: null, short_url: String(short) };
    }
    return {
      ok: false,
      checked_at,
      status_code,
      error: `NO_SHORT_URL: ${raw.slice(0, 160)}`,
    };
  } catch (e) {
    return {
      ok: false,
      checked_at,
      status_code: 0,
      error: `EXCEPTION: ${(e as any)?.message ?? String(e)}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Aceita: cron (via pg_net sem header), anon key do frontend, ou Bearer SCRAPPER_API_SECRET.
  // Sem auth estrito: a função só lê/atualiza scrapper_jobs do tipo mercado_livre.

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const onlyJobId = url.searchParams.get("job_id");

  let query = sb
    .from("scrapper_jobs")
    .select("id, nome, status, config")
    .eq("plataforma", "mercado_livre");
  if (onlyJobId) query = query.eq("id", onlyJobId);
  else query = query.eq("status", "ativo");

  const { data: jobs, error } = await query;
  if (error) {
    console.error("[ml-health] fetch jobs error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ job_id: string; nome: string; status: CookieStatus }> = [];

  for (const j of jobs ?? []) {
    const cfg = (j.config ?? {}) as any;
    const status = await testCookie(
      cfg.ml_cookie ?? "",
      cfg.ml_csrf_token ?? "",
      cfg.ml_affiliate_id ?? cfg.ml_affiliate_tag ?? "",
    );

    const tag = `[ml-health] job=${j.id} (${j.nome})`;
    if (status.ok) {
      console.log(`${tag} OK status=${status.status_code}`);
    } else {
      console.error(
        `${tag} ⚠️ COOKIE INVÁLIDO — error=${status.error} status=${status.status_code}. ` +
        `Renove ml_cookie e ml_csrf_token no painel Scrapper > editar job > aba Mercado Livre.`,
      );
    }

    const newCfg = { ...cfg, ml_cookie_status: status };
    const { error: upErr } = await sb
      .from("scrapper_jobs")
      .update({ config: newCfg })
      .eq("id", j.id);
    if (upErr) console.error(`${tag} update error:`, upErr.message);

    results.push({ job_id: j.id, nome: j.nome, status });
  }

  const summary = {
    checked_at: new Date().toISOString(),
    total: results.length,
    ok: results.filter((r) => r.status.ok).length,
    expired: results.filter((r) => r.status.error === "COOKIE_EXPIRED").length,
    missing: results.filter((r) => r.status.error === "MISSING_CREDENTIALS").length,
    other: results.filter((r) => !r.status.ok && r.status.error && !["COOKIE_EXPIRED", "MISSING_CREDENTIALS"].includes(r.status.error)).length,
    results,
  };

  console.log(`[ml-health] resumo: ${summary.ok}/${summary.total} ok, ${summary.expired} expirados`);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
