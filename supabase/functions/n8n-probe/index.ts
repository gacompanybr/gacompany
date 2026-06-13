import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") || "").replace(/\/+$/, "");
const N8N_API_KEY = Deno.env.get("N8N_API_KEY")!;
Deno.serve(async () => {
  const out: any = { base: N8N_BASE_URL, tests: {} };
  for (const p of ["/api/v1/workflows", "/rest/workflows", "/workflows", "/api/v1/me"]) {
    try {
      const r = await fetch(N8N_BASE_URL + p, { headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" }});
      const t = await r.text();
      out.tests[p] = { status: r.status, body: t.slice(0, 200) };
    } catch (e) { out.tests[p] = { error: String(e) }; }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
});
