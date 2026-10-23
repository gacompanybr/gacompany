import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.25.76";
import { CRM_META_PAGE_ID, mapMetaLead, verifyMetaSignature } from "../_shared/meta-instant-lead.ts";
import { matchesMetaBinding } from "../_shared/meta-binding-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const Value = z.object({ leadgen_id: z.string().regex(/^\d+$/), page_id: z.string().regex(/^\d+$/).optional() });
const Envelope = z.object({ object: z.literal("page"), entry: z.array(z.object({
  id: z.string(), changes: z.array(z.object({ field: z.string(), value: z.unknown() })).max(100),
})).max(100) });
const LeadSchema = z.object({
  id: z.string().regex(/^\d+$/),
  created_time: z.string().datetime({ offset: true }).optional(),
  form_id: z.string().optional(), ad_id: z.string().optional(),
  field_data: z.array(z.object({ name: z.string().max(1000), values: z.array(z.string().max(20000)).max(100) })).max(200),
});
const reply = (status: number, body: string) => new Response(body, { status, headers: corsHeaders });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return reply(200, "ok");
  const url = new URL(req.url);
  if (req.method === "GET") {
    const verifyToken = Deno.env.get("META_CRM_VERIFY_TOKEN");
    if (!verifyToken) return reply(503, "Verification not configured");
    if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== verifyToken) return reply(403, "Verification rejected");
    const challenge = url.searchParams.get("hub.challenge");
    return challenge && /^\d{1,100}$/.test(challenge) ? reply(200, challenge) : reply(400, "Invalid challenge");
  }
  if (req.method !== "POST") return reply(405, "Method not allowed");
  const secret = Deno.env.get("META_CRM_APP_SECRET");
  const token = Deno.env.get("META_CRM_ACCESS_TOKEN");
  const dbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !token || !dbUrl || !serviceKey) return reply(503, "Integration not configured");
  const raw = await req.text();
  if (raw.length > 1_000_000) return reply(413, "Payload too large");
  if (!(await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret))) return reply(401, "Invalid signature");
  let parsed;
  try { parsed = Envelope.safeParse(JSON.parse(raw)); } catch { return reply(400, "Invalid JSON"); }
  if (!parsed.success) return reply(400, "Invalid event");
  const admin = createClient(dbUrl, serviceKey);
  try {
    const { data: bindings, error: bindingsError } = await admin.from("crm_meta_bindings").select("page_id,form_id,campaign_id,account_id,enabled").eq("enabled", true).eq("page_id", CRM_META_PAGE_ID);
    if (bindingsError) throw new Error("Binding lookup failed");
    if (!bindings?.length) return reply(200, "EVENT_RECEIVED");
    for (const entry of parsed.data.entry) {
      if (entry.id !== CRM_META_PAGE_ID) continue;
      for (const change of entry.changes) {
        if (change.field !== "leadgen") continue;
        const value = Value.safeParse(change.value);
        if (!value.success) return reply(400, "Invalid lead event");
        if (value.data.page_id && value.data.page_id !== CRM_META_PAGE_ID) continue;
        const { data: existing, error: lookupError } = await admin.from("crm_leads").select("id").eq("meta_leadgen_id", value.data.leadgen_id).maybeSingle();
        if (lookupError) throw new Error("CRM lookup failed");
        if (existing) continue;
        const graphUrl = new URL(`https://graph.facebook.com/v26.0/${value.data.leadgen_id}`);
        graphUrl.searchParams.set("fields", "id,created_time,form_id,ad_id,field_data");
        const response = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) {
          // Never log provider bodies: they can contain credentials or lead data.
          console.error("Meta lead retrieval failed", { status: response.status });
          return reply(503, "Meta lead retrieval failed; delivery must be retried");
        }
        const lead = LeadSchema.safeParse(await response.json());
        if (!lead.success || lead.data.id !== value.data.leadgen_id) throw new Error("Invalid lead details");
        if (!bindings.some(b => b.form_id === lead.data.form_id)) {
          console.log("lead ignorado: formulario sem vinculo", { leadgen_id: value.data.leadgen_id, form_id: lead.data.form_id });
          continue;
        }
        let binding;
        if (lead.data.ad_id) {
          if (!/^\d+$/.test(lead.data.ad_id)) throw new Error("Invalid ad identity");
          const adUrl = new URL(`https://graph.facebook.com/v26.0/${lead.data.ad_id}`);
          adUrl.searchParams.set("fields", "campaign_id,account_id");
          const adResponse = await fetch(adUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
          if (!adResponse.ok) return reply(503, "Ad attribution lookup failed; delivery must be retried");
          const ad = await adResponse.json();
          binding = bindings.find(b => matchesMetaBinding(b, entry.id, lead.data.form_id, ad.campaign_id) && b.account_id === `act_${ad.account_id}`);
        } else {
          // Leads de teste da Meta nao trazem anuncio: usa o vinculo do formulario.
          binding = bindings.find(b => b.form_id === lead.data.form_id);
        }
        if (!binding) {
          console.log("lead ignorado: vinculo nao corresponde", { leadgen_id: value.data.leadgen_id, form_id: lead.data.form_id, ad_id: lead.data.ad_id ?? null });
          continue;
        }
        const { error } = await admin.from("crm_leads").insert({ ...mapMetaLead(lead.data), meta_campaign_id: binding.campaign_id, meta_account_id: binding.account_id });
        if (error && error.code !== "23505") throw new Error("CRM insert failed");
        if (!error) console.log("lead importado", { leadgen_id: value.data.leadgen_id, form_id: lead.data.form_id, campaign_id: binding.campaign_id });
      }
    }
    return reply(200, "EVENT_RECEIVED");
  } catch {
    console.error("Meta CRM import did not complete");
    return reply(503, "Import failed; delivery must be retried");
  }
});