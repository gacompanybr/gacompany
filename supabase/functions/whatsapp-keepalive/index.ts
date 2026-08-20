// Keepalive das instâncias WhatsApp na Evolution API.
// Executa a cada 5 min via pg_cron. Para cada instância cadastrada:
//   1. consulta /instance/connectionState
//   2. se state != "open", tenta /instance/restart e depois /instance/connect
//   3. atualiza whatsapp_connections.status
// Objetivo: evitar que campanhas falhem por sessão caída sem ninguém perceber.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function evo(path: string, init: RequestInit = {}) {
  const r = await fetch(`${EVO_URL}${path}`, {
    ...init,
    headers: { apikey: EVO_KEY, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, body };
}

async function ensureWebhook(instanceName: string) {
  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const setWebhook = await evo(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhook_by_events: false,
        byEvents: false,
        base64: false,
        webhookBase64: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"],
      },
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhook_by_events: false,
      webhookBase64: false,
      webhook_base64: false,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"],
    }),
  });
  return { status: setWebhook.status, ok: setWebhook.ok };
}

async function ensureSettings(instanceName: string) {
  const settings = await evo(`/settings/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      rejectCall: false,
      msgCall: "",
      groupsIgnore: false,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
      syncFullHistory: false,
    }),
  });
  return { status: settings.status, ok: settings.ok };
}

async function checkAndRevive(instanceName: string) {
  const state = await evo(`/instance/connectionState/${instanceName}`);
  const s = state.body?.instance?.state ?? state.body?.state ?? null;

  if (s === "open") {
    const settings = await ensureSettings(instanceName);
    const webhook = await ensureWebhook(instanceName);
    // Só grava se o status realmente mudou (evita UPDATE a cada 5 min por instância)
    await admin.from("whatsapp_connections")
      .update({ status: "connected", updated_at: new Date().toISOString() })
      .eq("instance_name", instanceName)
      .neq("status", "connected");

    return { instanceName, state: s, action: "ensure_settings_webhook", settings, webhook };
  }

  // Tenta restart + connect
  const restart = await evo(`/instance/restart/${instanceName}`, { method: "POST" });
  // Pequena espera p/ Evolution subir a sessão
  await new Promise((r) => setTimeout(r, 1500));
  const connect = await evo(`/instance/connect/${instanceName}`);
  const after = await evo(`/instance/connectionState/${instanceName}`);
  const sAfter = after.body?.instance?.state ?? after.body?.state ?? null;
  const settings = sAfter === "open" ? await ensureSettings(instanceName) : null;
  const webhook = sAfter === "open" ? await ensureWebhook(instanceName) : null;

  const nextStatus = sAfter === "open" ? "connected" : (sAfter === "connecting" ? "connecting" : "disconnected");
  await admin.from("whatsapp_connections")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("instance_name", instanceName)
    .neq("status", nextStatus);


  return {
    instanceName,
    stateBefore: s,
    stateAfter: sAfter,
    action: "restart+connect",
    restartStatus: restart.status,
    connectStatus: connect.status,
    settings,
    webhook,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Junta nomes de instância de várias fontes (whatsapp_connections,
    // robo_campanhas.instancia_id, disparo_campanhas.instancia_id).
    const names = new Set<string>();

    const { data: conns } = await admin
      .from("whatsapp_connections")
      .select("instance_name")
      .not("instance_name", "is", null);
    for (const c of conns ?? []) if (c.instance_name) names.add(c.instance_name);

    const { data: robos } = await admin
      .from("robo_campanhas")
      .select("instancia_id, status")
      .eq("status", "ativo");
    for (const r of robos ?? []) if (r.instancia_id) names.add(r.instancia_id);

    const { data: disp } = await admin
      .from("disparo_campanhas")
      .select("instancia_id, status")
      .in("status", ["executando", "pausada"]);
    for (const d of disp ?? []) if (d.instancia_id) names.add(d.instancia_id);

    const results: any[] = [];
    for (const name of names) {
      try {
        results.push(await checkAndRevive(name));
      } catch (e) {
        results.push({ instanceName: name, error: e instanceof Error ? e.message : String(e) });
      }
    }

    console.log("[whatsapp-keepalive] processed", results.length, results);
    return j({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error("whatsapp-keepalive error", e);
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
