// Worker de disparo de e-mails (lote limitado por execução) via Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const LOTE = 20;                 // e-mails por execução
const DELAY_MS = 600;            // pausa entre envios
const LOCK_MIN = 3;              // lease de single-flight
const FROM_DEFAULT = "contato@gacompany.online";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const TRACK = `${SUPABASE_URL}/functions/v1/email-track`;

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(tpl: string, vars: Record<string, string>) {
  return String(tpl ?? "").replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    const found = Object.keys(vars).find((v) => v.toLowerCase() === key);
    return found ? (vars[found] ?? "") : m;
  });
}

function montarHtml(texto: string, camp: any, destId: string) {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px;color:#1a1a1a">${esc(p).replace(/\n/g, "<br />")}</p>`)
    .join("");

  const cta = camp.link_url
    ? `<p style="margin:22px 0"><a href="${TRACK}?t=click&d=${destId}&u=${encodeURIComponent(camp.link_url)}"
         style="background:#fea60f;color:#111;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">
         ${esc(camp.link_label || "Saber mais")}</a></p>`
    : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:28px 24px">
${paragrafos}${cta}
<hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0 12px" />
<p style="font-size:11px;color:#8a8a8a;line-height:1.5;margin:0">
${esc(camp.remetente_nome || "GA Company")} —
<a href="${TRACK}?t=unsub&d=${destId}" style="color:#8a8a8a">não quero mais receber estes e-mails</a>.
</p>
</div>
<img src="${TRACK}?t=open&d=${destId}" width="1" height="1" alt="" style="display:block" />
</body></html>`;
}

async function enviarResend(params: {
  from: string; to: string; subject: string; html: string; text: string; unsubUrl: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: {
        "List-Unsubscribe": `<${params.unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.name || `resend ${res.status}`;
    return { ok: false, status: res.status, error: String(msg), id: "" };
  }
  return { ok: true, status: 200, error: "", id: (data as any)?.id ?? "" };
}

async function processarCampanha(camp: any) {
  const { data: pendentes } = await sb
    .from("email_destinatarios")
    .select("id, email, nome, empresa, variaveis")
    .eq("campanha_id", camp.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(LOTE);

  if (!pendentes || pendentes.length === 0) {
    await sb.from("email_campanhas")
      .update({ status: "concluida", lock_until: null })
      .eq("id", camp.id);
    return { campanha_id: camp.id, enviados: 0, concluida: true };
  }

  const from = `${camp.remetente_nome || "GA Company"} <${camp.remetente_email || FROM_DEFAULT}>`;
  let enviados = 0;
  let pausar: string | null = null;

  for (const d of pendentes) {
    const vars: Record<string, string> = {
      nome: d.nome ?? "",
      empresa: d.empresa ?? "",
      email: d.email,
      ...(d.variaveis && typeof d.variaveis === "object" ? d.variaveis as Record<string, string> : {}),
    };
    const assunto = render(camp.assunto, vars);
    const texto = render(camp.corpo, vars);
    const html = montarHtml(texto, camp, d.id);
    const textoFinal = camp.link_url ? `${texto}\n\n${camp.link_url}` : texto;

    const r = await enviarResend({
      from, to: d.email, subject: assunto, html, text: textoFinal,
      unsubUrl: `${TRACK}?t=unsub&d=${d.id}`,
    });

    if (r.ok) {
      enviados++;
      await sb.from("email_destinatarios").update({
        status: "enviado",
        provider_id: r.id,
        enviado_em: new Date().toISOString(),
        erro: null,
      }).eq("id", d.id);
    } else {
      // 401/403/402 = configuração/bloqueio: para tudo e avisa o dono
      if ([401, 402, 403].includes(r.status)) {
        pausar = r.error;
        break;
      }
      if (r.status === 429) { pausar = `Limite do provedor: ${r.error}`; break; }
      await sb.from("email_destinatarios")
        .update({ status: "falhou", erro: r.error })
        .eq("id", d.id);
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  const { count: restantes } = await sb
    .from("email_destinatarios")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", camp.id)
    .eq("status", "pendente");

  await sb.from("email_campanhas").update({
    enviados: (camp.enviados ?? 0) + enviados,
    status: pausar ? "pausada" : (restantes ?? 0) > 0 ? "enviando" : "concluida",
    ultimo_erro: pausar,
    lock_until: null,
  }).eq("id", camp.id);

  return { campanha_id: camp.id, enviados, restantes: restantes ?? 0, pausada: !!pausar, erro: pausar };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY não configurada. Adicione a chave do provedor de e-mail." }, 400);
    }
    const body = await req.json().catch(() => ({}));
    const agora = new Date().toISOString();

    let q = sb.from("email_campanhas")
      .select("*")
      .eq("status", "enviando")
      .or(`lock_until.is.null,lock_until.lt.${agora}`)
      .limit(3);
    if (body?.campanha_id) q = sb.from("email_campanhas").select("*").eq("id", body.campanha_id).limit(1);

    const { data: camps, error } = await q;
    if (error) return json({ error: error.message }, 500);
    if (!camps || camps.length === 0) return json({ skipped: "nenhuma campanha para enviar" });

    const resultados: any[] = [];
    for (const camp of camps) {
      if (camp.status !== "enviando") { resultados.push({ campanha_id: camp.id, skipped: camp.status }); continue; }
      if (camp.lock_until && new Date(camp.lock_until) > new Date()) {
        resultados.push({ campanha_id: camp.id, skipped: "em execução" });
        continue;
      }
      const lock = new Date(Date.now() + LOCK_MIN * 60_000).toISOString();
      const { data: locked } = await sb.from("email_campanhas")
        .update({ lock_until: lock })
        .eq("id", camp.id)
        .eq("status", "enviando")
        .select("id")
        .maybeSingle();
      if (!locked) { resultados.push({ campanha_id: camp.id, skipped: "lock" }); continue; }

      try {
        resultados.push(await processarCampanha(camp));
      } catch (e) {
        await sb.from("email_campanhas").update({
          status: "pausada", ultimo_erro: (e as Error).message, lock_until: null,
        }).eq("id", camp.id);
        resultados.push({ campanha_id: camp.id, erro: (e as Error).message });
      }
    }
    return json({ resultados });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
