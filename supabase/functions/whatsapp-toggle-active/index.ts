// Ativa/desativa o agente IA do WhatsApp de forma manual.
// - active=true: ativa workflow do n8n e aponta webhook da Evolution para o n8n.
// - active=false: desativa workflow do n8n e DESLIGA o webhook da Evolution
//   (assim nenhum sistema externo recebe a mensagem para responder).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") || "").replace(/\/+$/, "");
const N8N_API_KEY = Deno.env.get("N8N_API_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function n8n(path: string, init: RequestInit = {}) {
  const r = await fetch(`${N8N_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep */ }
  return { ok: r.ok, status: r.status, body };
}

async function setEvolutionWebhook(instanceName: string, opts: { enabled: boolean; url?: string }) {
  const payload = {
    webhook: {
      enabled: opts.enabled,
      url: opts.url ?? "",
      webhookByEvents: false,
      webhook_by_events: false,
      byEvents: false,
      base64: false,
      events: opts.enabled ? ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] : [],
    },
    enabled: opts.enabled,
    url: opts.url ?? "",
    webhookByEvents: false,
    webhook_by_events: false,
    base64: false,
    byEvents: false,
    events: opts.enabled ? ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] : [],
  };
  const r = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  console.log("evo webhook toggle", opts.enabled, r.status, text.slice(0, 200));
  return { ok: r.ok, status: r.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { portfolioId, active } = await req.json();
    if (!portfolioId || typeof active !== "boolean") {
      return json({ error: "portfolioId e active obrigatórios" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: hasAccess } = await admin.rpc("has_portfolio_access", {
      _user_id: user.id, _portfolio_id: portfolioId,
    });
    if (!hasAccess) return json({ error: "Sem acesso" }, 403);

    const { data: agent } = await admin
      .from("whatsapp_agents").select("*").eq("portfolio_id", portfolioId).maybeSingle();
    if (!agent) return json({ error: "Agente não encontrado" }, 404);

    const { data: conn } = await admin
      .from("whatsapp_connections").select("*").eq("portfolio_id", portfolioId).maybeSingle();
    const instanceName = conn?.instance_name || agent.instancia_id;

    // 1) Atualiza status no DB
    await admin.from("whatsapp_agents")
      .update({ status: active ? "active" : "inactive" })
      .eq("id", agent.id);

    const result: any = { ok: true, status: active ? "active" : "inactive" };

    // 2) n8n: ativa/desativa workflow se existir
    if (agent.n8n_workflow_id && N8N_BASE_URL && N8N_API_KEY) {
      const path = active
        ? `/workflows/${agent.n8n_workflow_id}/activate`
        : `/workflows/${agent.n8n_workflow_id}/deactivate`;
      const r = await n8n(path, { method: "POST" });
      result.n8n = { ok: r.ok, status: r.status };
      if (!r.ok) console.warn("n8n toggle failed", r.status, JSON.stringify(r.body).slice(0, 300));
    }

    // 3) Evolution webhook: liga/desliga
    if (instanceName) {
      if (active) {
        const N8N_HOST = N8N_BASE_URL.replace(/\/api\/v\d+$/, "");
        const webhookPath = agent.n8n_webhook_path || `wa-${portfolioId}`;
        const webhookUrl = `${N8N_HOST}/webhook/${webhookPath}`;
        result.evolution = await setEvolutionWebhook(instanceName, { enabled: true, url: webhookUrl });
      } else {
        result.evolution = await setEvolutionWebhook(instanceName, { enabled: false });
      }
    }

    return json(result);
  } catch (e) {
    console.error("whatsapp-toggle-active error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
