import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { CRM_META_PAGE_ID, mapMetaLead } from "../_shared/meta-instant-lead.ts";
import { resolveMetaPageToken } from "../_shared/meta-page-access.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
type MetaLead = { id: string; created_time?: string; form_id?: string; ad_id?: string; campaign_id?: string; field_data: { name: string; values: string[] }[] };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const dbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("META_CRM_ACCESS_TOKEN");
  if (!dbUrl || !serviceKey || !token) return json({ error: "Integração Meta não configurada" }, 503);
  const admin = createClient(dbUrl, serviceKey);
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Entre no painel" }, 401);
  const { data: userData, error: authError } = await admin.auth.getUser(auth.slice(7));
  if (authError || !userData.user) return json({ error: "Sessão expirada" }, 401);
  const { data: allowed } = await admin.rpc("has_permission", { _user_id: userData.user.id, _permission_key: "integrations.manage" });
  if (!allowed) return json({ error: "Sem permissão para importar leads" }, 403);
  let pageToken: string | undefined;
  try {
    const { data: bindings, error } = await admin.from("crm_meta_bindings").select("form_id,campaign_id,account_id").eq("enabled", true).eq("page_id", CRM_META_PAGE_ID);
    if (error) throw new Error("Falha ao ler vínculos");
    if (!bindings?.length) return json({ error: "Nenhum formulário vinculado" }, 400);
    pageToken = await resolveMetaPageToken(CRM_META_PAGE_ID, token);
    let found = 0, imported = 0, skipped = 0;
    for (const formId of [...new Set(bindings.map(b => b.form_id))]) {
      const formBindings = bindings.filter(b => b.form_id === formId);
      let next: string | null = `https://graph.facebook.com/v26.0/${formId}/leads?fields=id,created_time,form_id,ad_id,campaign_id,field_data&limit=100`;
      for (let page = 0; next && page < 50; page++) {
        const res = await fetch(next, { headers: { Authorization: `Bearer ${pageToken}` }, signal: AbortSignal.timeout(15000) });
        const body = await res.json();
        if (!res.ok || body.error) {
          const msg = typeof body.error?.message === "string" ? body.error.message : "Falha ao consultar a Meta";
          throw new Error(`Meta: ${[token, pageToken].reduce((t, v) => t.split(v!).join("[credencial]"), msg)}`);
        }
        const leads: MetaLead[] = (body.data || []).map((l: MetaLead) => ({ ...l, form_id: l.form_id ?? formId }));
        found += leads.length;
        const ids = leads.map(l => l.id);
        const { data: existing } = ids.length ? await admin.from("crm_leads").select("meta_leadgen_id").in("meta_leadgen_id", ids) : { data: [] };
        const known = new Set((existing || []).map(e => e.meta_leadgen_id));
        for (const lead of leads) {
          if (known.has(lead.id)) { skipped++; continue; }
          const binding = lead.campaign_id ? formBindings.find(b => b.campaign_id === lead.campaign_id) : formBindings[0];
          if (!binding) { skipped++; continue; }
          const { error: insErr } = await admin.from("crm_leads").insert({ ...mapMetaLead(lead), meta_campaign_id: binding.campaign_id, meta_account_id: binding.account_id });
          if (!insErr) imported++;
          else if (insErr.code === "23505") skipped++;
          else throw new Error("Falha ao salvar lead no CRM");
        }
        next = body.paging?.next ?? null;
      }
    }
    console.log("importacao meta", { found, imported, skipped });
    return json({ found, imported, skipped });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Falha na importação" }, 502);
  }
});
