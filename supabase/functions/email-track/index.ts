// Rastreio de e-mails: pixel de abertura, redirecionamento de clique e descadastro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// GIF transparente 1x1
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("d");
  const tipo = url.searchParams.get("t") ?? "open";
  const destino = url.searchParams.get("u");

  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    try {
      const { data: row } = await sb
        .from("email_destinatarios")
        .select("id, abertos, cliques, aberto_em, clicado_em")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        if (tipo === "click") {
          await sb.from("email_destinatarios").update({
            cliques: (row.cliques ?? 0) + 1,
            clicado_em: row.clicado_em ?? new Date().toISOString(),
            aberto_em: row.aberto_em ?? new Date().toISOString(),
            abertos: row.aberto_em ? row.abertos : (row.abertos ?? 0) + 1,
          }).eq("id", id);
        } else if (tipo === "unsub") {
          await sb.from("email_destinatarios")
            .update({ status: "descadastrado" })
            .eq("id", id);
        } else {
          await sb.from("email_destinatarios").update({
            abertos: (row.abertos ?? 0) + 1,
            aberto_em: row.aberto_em ?? new Date().toISOString(),
          }).eq("id", id);
        }
      }
    } catch (_e) {
      // nunca quebra a experiência do destinatário
    }
  }

  if (tipo === "click" && destino) {
    let alvo = destino;
    if (!/^https?:\/\//i.test(alvo)) alvo = `https://${alvo}`;
    return new Response(null, { status: 302, headers: { Location: alvo } });
  }

  if (tipo === "unsub") {
    return new Response(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
       <meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Descadastro concluído</title></head>
       <body style="font-family:system-ui,sans-serif;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
       <div style="text-align:center;max-width:420px;padding:24px">
         <h1 style="color:#fea60f;font-size:20px">Pronto!</h1>
         <p style="color:#bbb;font-size:14px">Você não receberá mais e-mails desta lista.</p>
       </div></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
});
