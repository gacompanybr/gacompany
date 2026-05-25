// Edge Function: social-publish
// Publica post no Instagram (feed/foto) e/ou Facebook Page.
// Body: { integration_id, caption, image_url, targets: ["instagram"|"facebook"] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const META_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { integration_id, caption = "", image_url, targets = ["instagram"] } = await req.json();
    if (!integration_id || !image_url) {
      return new Response(JSON.stringify({ error: "integration_id e image_url são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integ, error } = await admin.from("social_media_integrations").select("*").eq("id", integration_id).single();
    if (error || !integ) throw new Error("Integração não encontrada");

    const results: any = {};
    const token = integ.access_token;

    if (targets.includes("instagram")) {
      if (!integ.ig_business_id) throw new Error("Esta página não tem conta Instagram Business vinculada");
      // 1) create container
      const createRes = await fetch(`${META_API}/${integ.ig_business_id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url, caption, access_token: token }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(`IG create: ${createJson?.error?.message ?? "erro"}`);

      // 2) publish
      const pubRes = await fetch(`${META_API}/${integ.ig_business_id}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createJson.id, access_token: token }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) throw new Error(`IG publish: ${pubJson?.error?.message ?? "erro"}`);
      results.instagram = pubJson;
    }

    if (targets.includes("facebook")) {
      const fbRes = await fetch(`${META_API}/${integ.fb_page_id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image_url, caption, access_token: token }),
      });
      const fbJson = await fbRes.json();
      if (!fbRes.ok) throw new Error(`FB publish: ${fbJson?.error?.message ?? "erro"}`);
      results.facebook = fbJson;
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
