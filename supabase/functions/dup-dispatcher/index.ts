// dup-dispatcher
// Chamado pelo workflow do agente WhatsApp no n8n quando uma mensagem cai em um
// grupo. Recebe o payload bruto da Evolution, descobre se aquele JID é o
// grupo_origem_jid de algum scrapper_job DUP ativo, e encaminha a mesma payload
// para o webhook do workflow DUP daquele job no n8n.
//
// Auth: header `x-dup-secret` deve bater com SCRAPPER_API_SECRET (mesmo segredo
// já compartilhado com os workflows n8n). Sem auth, a função recusa.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dup-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("SCRAPPER_API_SECRET") ?? "";
const N8N_BASE = (Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractRemoteJid(payload: any): string | null {
  const body = payload?.body ?? payload ?? {};
  const data = body?.data ?? {};
  const messages = Array.isArray(data?.messages) ? data.messages : [data];
  for (const m of messages) {
    const jid =
      m?.key?.remoteJid ||
      m?.remoteJid ||
      m?.chatId ||
      m?.from ||
      m?.sender;
    if (jid) return String(jid);
  }
  return null;
}

function dupWebhookPath(jobId: string): string {
  return `dup-${String(jobId).slice(0, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  try {
    const provided = req.headers.get("x-dup-secret") ?? "";
    if (!SECRET || provided !== SECRET) {
      return j({ error: "unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return j({ error: "invalid payload" }, 400);

    const remoteJid = extractRemoteJid(payload);
    if (!remoteJid || !remoteJid.endsWith("@g.us")) {
      return j({ ok: true, skipped: "not a group message" });
    }

    const { data: job, error } = await admin
      .from("scrapper_jobs")
      .select("id, n8n_workflow_id, status")
      .eq("status", "ativo")
      .eq("plataforma", "dup")
      .eq("grupo_origem_jid", remoteJid)
      .maybeSingle();

    if (error) {
      console.error("[dup-dispatcher] db error", error.message);
      return j({ error: error.message }, 500);
    }
    if (!job) return j({ ok: true, skipped: "no matching DUP job", remoteJid });
    if (!N8N_BASE) return j({ error: "N8N_BASE_URL not set" }, 500);

    const N8N_HOST = N8N_BASE.replace(/\/api\/v\d+$/, "");
    const path = dupWebhookPath(job.id);
    const url = `${N8N_HOST}/webhook/${path}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text().catch(() => "");
    console.log("[dup-dispatcher] forwarded", { jobId: job.id, status: r.status, preview: text.slice(0, 200) });
    return j({ ok: r.ok, jobId: job.id, status: r.status, url });
  } catch (e) {
    console.error("[dup-dispatcher] error", e);
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
