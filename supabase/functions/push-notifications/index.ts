import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const firebaseKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
    if (!url || !serviceKey || !lovableKey || !firebaseKey) return respond({ error: "Notificações não configuradas" }, 500);
    const db = createClient(url, serviceKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";
    const isCron = cronSecret.length > 0 && req.headers.get("x-cron-secret") === cronSecret;
    let bearerRole = "";
    try {
      const token = authorization.replace(/^Bearer\s+/i, "");
      const payload = token.split(".")[1];
      if (payload) bearerRole = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role ?? "";
    } catch { bearerRole = ""; }
    const isDatabaseJob = anonKey.length > 0 && (
      authorization === `Bearer ${anonKey}` || req.headers.get("apikey") === anonKey || bearerRole === "anon"
    );
    if (!isCron && !isDatabaseJob) {
      const requester = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
      const { data: authData } = await requester.auth.getUser();
      if (!authData.user) return respond({ error: "Não autenticado" }, 401);
      const { data: role } = await db.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
      const { data: canManageTasks } = await db.rpc("has_permission", { _user_id: authData.user.id, _permission_key: "tasks.manage" });
      if (!role && !canManageTasks) return respond({ error: "Sem permissão para executar o envio" }, 403);
    }

    await db.rpc("generate_task_deadline_notifications");
    const { data: notifications, error } = await db.from("notifications").select("id,user_id,title,body,data,type").is("pushed_at", null).order("created_at").limit(100);
    if (error) return respond({ error: error.message }, 500);

    let sent = 0;
    for (const notification of notifications ?? []) {
      const preferenceColumn = notification.type === "task_assigned" ? "task_assigned" : notification.type === "task_completed" ? "task_completed" : notification.type === "new_client" ? "new_client" : "task_deadlines";
      const { data: preference } = await db.from("notification_preferences").select("push_enabled,task_assigned,task_completed,new_client,task_deadlines").eq("user_id", notification.user_id).maybeSingle();
      const preferenceEnabled = !preference || (preference.push_enabled && (notification.type === "new_lead" || Boolean((preference as Record<string, unknown>)[preferenceColumn])));
      if (!preferenceEnabled) {
        await db.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", notification.id);
        continue;
      }

      const { data: devices } = await db.from("push_devices").select("id,token").eq("user_id", notification.user_id).eq("active", true);
      for (const device of devices ?? []) {
        const response = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": firebaseKey, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: device.token, notification: { title: notification.title, body: notification.body }, data: { path: "/paineladmin/app", notification_id: notification.id }, webpush: { fcm_options: { link: "/paineladmin/app" } } } }),
        });
        if (response.ok) sent += 1;
        else {
          const details = await response.text();
          if ((response.status === 404 && details.includes("UNREGISTERED")) || (response.status === 400 && details.includes("INVALID_ARGUMENT"))) {
            await db.from("push_devices").update({ active: false }).eq("id", device.id);
          } else console.error(`FCM failed [${response.status}]: ${details}`);
        }
      }
      await db.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", notification.id);
    }
    return respond({ ok: true, sent });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});