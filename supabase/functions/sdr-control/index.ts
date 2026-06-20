// Controla o ciclo de vida de uma campanha SDR.
// Body: { campaignId, action: "start" | "pause" | "resume" | "finish" | "delete", ratePerHour? }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { campaignId, action, ratePerHour } = await req.json();
    if (!campaignId || !action) return json({ error: "campaignId e action obrigatórios" }, 400);

    const { data: campaign } = await admin.from("sdr_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaign) return json({ error: "Campanha não encontrada" }, 404);

    const { data: hasAccess } = await admin.rpc("has_portfolio_access", { _user_id: user.id, _portfolio_id: campaign.portfolio_id });
    if (!hasAccess) return json({ error: "Sem acesso" }, 403);

    const patch: Record<string, unknown> = {};
    if (typeof ratePerHour === "number") patch.rate_per_hour = Math.max(1, Math.min(500, ratePerHour));

    if (action === "start") {
      if (!["draft", "paused"].includes(campaign.status)) return json({ error: `Não pode iniciar a partir de ${campaign.status}` }, 400);
      patch.status = "running";
    } else if (action === "pause") {
      if (campaign.status !== "running") return json({ error: "Só campanhas em execução podem ser pausadas" }, 400);
      patch.status = "paused";
    } else if (action === "resume") {
      if (campaign.status !== "paused") return json({ error: "Só campanhas pausadas podem ser retomadas" }, 400);
      patch.status = "running";
    } else if (action === "finish") {
      patch.status = "finished";
      patch.finished_at = new Date().toISOString();
    } else if (action === "delete") {
      await admin.from("sdr_campaigns").delete().eq("id", campaignId);
      return json({ ok: true, deleted: true });
    } else {
      return json({ error: "action inválido" }, 400);
    }

    const { data: updated, error } = await admin.from("sdr_campaigns").update(patch).eq("id", campaignId).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, campaign: updated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
