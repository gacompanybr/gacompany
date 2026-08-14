// Edge Function: social-publish
// Publica no Instagram (feed, story, reels) e/ou Facebook Page.
// Body: { integration_id, caption, image_url, tipo?, targets: ["instagram"|"facebook"] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const META_API = "https://graph.facebook.com/v21.0";

function isVideo(url: string) {
  const u = url.toLowerCase().split("?")[0];
  return u.endsWith(".mp4") || u.endsWith(".mov") || u.endsWith(".m4v");
}

async function waitContainerReady(containerId: string, token: string, maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await fetch(
      `${META_API}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    const j = await r.json();
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
      throw new Error(`Container ${containerId} status=${j.status_code} ${j.status ?? ""}`);
    }
    await new Promise((res) => setTimeout(res, 2500));
  }
  throw new Error(`Container ${containerId} não ficou pronto em ${maxMs}ms`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const {
      integration_id, caption = "", image_url, image_urls, tipo = "post", targets = ["instagram"],
    } = await req.json();

    const midias: string[] = Array.isArray(image_urls) && image_urls.length
      ? image_urls.filter((u: unknown) => typeof u === "string" && u)
      : image_url ? [image_url] : [];
    const primeira = midias[0];

    if (!integration_id || !primeira) {
      return new Response(
        JSON.stringify({ error: "integration_id e image_url são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (tipo === "carrossel" && midias.length < 2) {
      return new Response(
        JSON.stringify({ error: "Carrossel exige entre 2 e 10 imagens" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const carrossel = midias.slice(0, 10);

    const { data: integ, error } = await admin
      .from("social_media_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();
    if (error || !integ) throw new Error("Integração não encontrada");

    const token = integ.access_token;
    const results: Record<string, unknown> = {};
    const video = isVideo(primeira);


    if (targets.includes("instagram")) {
      if (!integ.ig_business_id) {
        throw new Error("Esta página não tem conta Instagram Business vinculada");
      }

      // Determine media_type
      let mediaPayload: Record<string, unknown> = { access_token: token };
      if (tipo === "story") {
        mediaPayload.media_type = "STORIES";
        if (video) mediaPayload.video_url = image_url;
        else mediaPayload.image_url = image_url;
      } else if (tipo === "reels") {
        if (!video) throw new Error("Reels exige arquivo de vídeo (.mp4)");
        mediaPayload.media_type = "REELS";
        mediaPayload.video_url = image_url;
        mediaPayload.caption = caption;
      } else if (tipo === "carrossel") {
        throw new Error("Carrossel ainda não é suportado pela publicação automática");
      } else {
        // feed post
        if (video) {
          mediaPayload.media_type = "VIDEO";
          mediaPayload.video_url = image_url;
        } else {
          mediaPayload.image_url = image_url;
        }
        mediaPayload.caption = caption;
      }

      const createRes = await fetch(`${META_API}/${integ.ig_business_id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mediaPayload),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        throw new Error(`IG create (${tipo}): ${createJson?.error?.message ?? JSON.stringify(createJson)}`);
      }

      // Vídeos/reels/stories de vídeo precisam aguardar processamento
      if (video || tipo === "reels" || tipo === "story") {
        try {
          await waitContainerReady(createJson.id, token);
        } catch (e) {
          // Para foto de story, normalmente fica pronto imediato; ignore se falhar
          if (video || tipo === "reels") throw e;
        }
      }

      const pubRes = await fetch(`${META_API}/${integ.ig_business_id}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createJson.id, access_token: token }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) {
        throw new Error(`IG publish (${tipo}): ${pubJson?.error?.message ?? JSON.stringify(pubJson)}`);
      }
      results.instagram = pubJson;
    }

    if (targets.includes("facebook")) {
      if (!integ.fb_page_id) throw new Error("Integração sem fb_page_id");
      let fbRes: Response;
      let fbJson: any;

      if (tipo === "story") {
        // Stories de Facebook Page exigem fluxo de upload (start/transfer/finish).
        // Simplificação: tentar via /photo_stories com url da imagem.
        if (video) {
          throw new Error("Story de vídeo no Facebook Page ainda não suportado");
        }
        fbRes = await fetch(`${META_API}/${integ.fb_page_id}/photo_stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: image_url, access_token: token }),
        });
      } else if (video || tipo === "reels") {
        fbRes = await fetch(`${META_API}/${integ.fb_page_id}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_url: image_url, description: caption, access_token: token }),
        });
      } else {
        fbRes = await fetch(`${META_API}/${integ.fb_page_id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: image_url, caption, access_token: token }),
        });
      }
      fbJson = await fbRes.json();
      if (!fbRes.ok) {
        throw new Error(`FB publish (${tipo}): ${fbJson?.error?.message ?? JSON.stringify(fbJson)}`);
      }
      results.facebook = fbJson;
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
