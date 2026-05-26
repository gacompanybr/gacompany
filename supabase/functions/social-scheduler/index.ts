// Edge Function: social-scheduler
// Roda a cada minuto (pg_cron). Busca posts agendados com data_agendada <= now()
// e dispara a publicação via social-publish.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: due, error } = await admin
    .from("social_posts")
    .select("*")
    .eq("status", "agendado")
    .lte("data_agendada", new Date().toISOString())
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const post of due ?? []) {
    try {
      const { data: integ } = await admin
        .from("social_media_integrations")
        .select("*")
        .eq("portfolio_id", post.portfolio_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!integ) throw new Error("Nenhuma integração Meta ativa para este portfólio");
      if (!post.imagem_url) throw new Error("Post sem imagem");

      const plats = Array.isArray(post.plataformas) ? post.plataformas : [];
      const targets: string[] = [];
      if (plats.includes("instagram")) targets.push("instagram");
      if (plats.includes("facebook")) targets.push("facebook");
      if (targets.length === 0) throw new Error("Nenhuma plataforma Meta selecionada");

      const caption = [post.legenda ?? post.conteudo ?? "", post.hashtags ?? ""]
        .filter(Boolean).join("\n\n");

      const pubRes = await fetch(`${SUPABASE_URL}/functions/v1/social-publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          integration_id: integ.id,
          caption,
          image_url: post.imagem_url,
          targets,
        }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) throw new Error(pubJson?.error ?? "Falha ao publicar");

      await admin.from("social_posts").update({ status: "publicado" }).eq("id", post.id);
      results.push({ id: post.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_posts").update({ status: "falhou" }).eq("id", post.id);
      results.push({ id: post.id, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
