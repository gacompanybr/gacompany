// Gerencia conexões WhatsApp (Evolution API) por portfólio.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function evo(path: string, init: RequestInit = {}) {
  const r = await fetch(`${EVO_URL}${path}`, {
    ...init,
    headers: {
      apikey: EVO_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { ok: r.ok, status: r.status, body };
}

function extractQr(body: any): string | null {
  if (!body || typeof body !== "object") return typeof body === "string" && body.length > 80 ? body : null;
  const direct = body.base64 ?? body.code ?? body.pairingCode ?? body.qrcode?.base64 ?? body.qrcode?.code;
  if (typeof direct === "string" && direct.length > 20) return direct;
  for (const v of Object.values(body)) {
    const found = extractQr(v);
    if (found) return found;
  }
  return null;
}

async function wait(ms: number) { await new Promise((r) => setTimeout(r, ms)); }

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
  console.log("webhook ensure status:", setWebhook.status, JSON.stringify(setWebhook.body).slice(0, 300));
  return setWebhook;
}

async function ensureSettings(instanceName: string) {
  const settings = await evo(`/settings/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      rejectCall: false,
      msgCall: "",
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
      syncFullHistory: false,
    }),
  });
  console.log("settings ensure status:", settings.status, JSON.stringify(settings.body).slice(0, 300));
  return settings;
}

function cleanInstanceName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9_-]/g, "") : "";
}

function cleanPhoneNumber(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function extractOwnerPhone(body: any): string | null {
  const arr = Array.isArray(body) ? body : [body];
  const owner = arr[0]?.instance?.owner ?? arr[0]?.ownerJid ?? arr[0]?.owner ?? arr[0]?.number ?? null;
  return owner && String(owner).includes("@") ? String(owner).split("@")[0] : null;
}

function getInstanceName(row: any): string {
  return String(row?.instance?.instanceName ?? row?.instanceName ?? row?.name ?? "");
}

function getInstanceState(row: any): string {
  return String(row?.instance?.state ?? row?.state ?? row?.connectionStatus ?? "unknown");
}

async function findOpenInstanceForPortfolio(portfolioId: string, preferred?: string | null) {
  const shortId = String(portfolioId).replace(/-/g, "").slice(0, 8);
  const prefix = `port_${shortId}_`;
  const list = await evo("/instance/fetchInstances");
  const rows = Array.isArray(list.body) ? list.body : [list.body];
  const matches = rows
    .map((row: any) => ({ row, name: getInstanceName(row), state: getInstanceState(row) }))
    .filter((item) => item.name.startsWith(prefix));
  return matches.find((item) => item.name === preferred && item.state === "open")
    ?? matches.find((item) => item.state === "open")
    ?? null;
}

async function listInstancesForPortfolio(portfolioId: string) {
  const shortId = String(portfolioId).replace(/-/g, "").slice(0, 8);
  const prefix = `port_${shortId}_`;
  const list = await evo("/instance/fetchInstances");
  const rows = Array.isArray(list.body) ? list.body : [list.body];
  return rows
    .map((row: any) => ({ row, name: getInstanceName(row), state: getInstanceState(row) }))
    .filter((item) => item.name.startsWith(prefix));
}

async function deleteInstance(name: string) {
  const logout = await evo(`/instance/logout/${name}`, { method: "DELETE" });
  const deleted = await evo(`/instance/delete/${name}`, { method: "DELETE" });
  console.log("delete instance", JSON.stringify({ name, logout: logout.status, deleted: deleted.status }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution não configurada" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { action, portfolioId, instanceName: requestedInstanceName, phone, testText } = await req.json();
    if (!action || !portfolioId) return json({ error: "action e portfolioId obrigatórios" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: hasAccess } = await admin.rpc("has_portfolio_access", {
      _user_id: user.id, _portfolio_id: portfolioId,
    });
    if (!hasAccess) return json({ error: "Sem acesso" }, 403);

    const { data: existing } = await admin
      .from("whatsapp_connections").select("*").eq("portfolio_id", portfolioId).maybeSingle();

    if (action === "connect") {
      const shortId = String(portfolioId).replace(/-/g, "").slice(0, 8);

      // Apaga todas as instâncias anteriores deste portfólio para evitar sessão zumbi/orfã.
      const oldInstances = await listInstancesForPortfolio(portfolioId);
      const namesToDelete = new Set(oldInstances.map((item) => item.name));
      if (existing?.instance_name) namesToDelete.add(existing.instance_name);
      for (const name of namesToDelete) await deleteInstance(name);
      if (namesToDelete.size) await wait(1200);

      // Nome novo a cada conexão garante QR limpo
      const instanceName = `port_${shortId}_${Date.now().toString(36).slice(-5)}`;

      const createInstance = async (name: string) => evo("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: name,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      const getQr = async (name: string) => {
        let lastRaw: any = null;
        for (const delay of [800, 1500, 2000, 2500, 3000]) {
          await wait(delay);
          const qr = await evo(`/instance/connect/${name}`);
          lastRaw = qr.body;
          const code = extractQr(qr.body);
          console.log(`getQr ${name} after ${delay}ms -> hasCode=${!!code}`);
          if (code) return { code, raw: qr.body };
        }
        return { code: null as string | null, raw: lastRaw };
      };

      const create = await createInstance(instanceName);
      console.log("evo create status:", create.status);
      let qrCode = extractQr(create.body);
      let raw: any = create.body;

      if (!qrCode) {
        const firstQr = await getQr(instanceName);
        qrCode = firstQr.code;
        raw = firstQr.raw;
      }

      await ensureWebhook(instanceName);


      // Upsert na tabela
      await admin.from("whatsapp_connections").upsert({
        portfolio_id: portfolioId,
        instance_name: instanceName,
        status: "connecting",
      }, { onConflict: "portfolio_id" });

      await admin.from("whatsapp_agents")
        .update({ instancia_id: instanceName })
        .eq("portfolio_id", portfolioId);

      if (!qrCode) return json({ error: "QR não retornado pela Evolution.", raw });
      return json({ instanceName, qr: qrCode });
    }

    if (action === "status") {
      if (!existing?.instance_name) return json({ state: "disconnected" });
      await ensureWebhook(existing.instance_name);
      const s = await evo(`/instance/connectionState/${existing.instance_name}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? "unknown";
      if (state === "open") {
        await ensureSettings(existing.instance_name);
        const info = await evo(`/instance/fetchInstances?instanceName=${existing.instance_name}`);
        const phone = extractOwnerPhone(info.body);
        await admin.from("whatsapp_connections")
          .update({ status: "connected", phone })
          .eq("portfolio_id", portfolioId);
      } else {
        await admin.from("whatsapp_connections")
          .update({ status: state === "close" ? "disconnected" : state })
          .eq("portfolio_id", portfolioId);
      }
      return json({ state });
    }

    if (action === "repair") {
      const openInstance = await findOpenInstanceForPortfolio(portfolioId, existing?.instance_name);
      const instanceName = openInstance?.name ?? existing?.instance_name;
      if (!instanceName) return json({ ok: false, state: "disconnected" });
      const restarted = await evo(`/instance/restart/${instanceName}`, { method: "POST" });
      console.log("repair restart", JSON.stringify({ instanceName, status: restarted.status, body: restarted.body }).slice(0, 500));
      await wait(2500);
      await ensureSettings(instanceName);
      await ensureWebhook(instanceName);
      const s = await evo(`/instance/connectionState/${instanceName}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? openInstance?.state ?? "unknown";
      await admin.from("whatsapp_connections")
        .update({ instance_name: instanceName, status: state === "open" ? "connected" : state === "close" ? "disconnected" : state })
        .eq("portfolio_id", portfolioId);
      await admin.from("whatsapp_agents")
        .update({ instancia_id: instanceName })
        .eq("portfolio_id", portfolioId);
      return json({ ok: state === "open", state, instanceName, restarted: { status: restarted.status, ok: restarted.ok } });
    }

    if (action === "diagnose-delivery") {
      const instanceName = cleanInstanceName(requestedInstanceName) || existing?.instance_name;
      if (!instanceName) return json({ ok: false, state: "disconnected", error: "Sem instância conectada" }, 409);

      const targetPhone = cleanPhoneNumber(phone);
      await ensureWebhook(instanceName);

      const connection = await evo(`/instance/connectionState/${instanceName}`);
      const info = await evo(`/instance/fetchInstances?instanceName=${instanceName}`);
      const ownerPhone = cleanPhoneNumber(extractOwnerPhone(info.body));
      if (targetPhone && ownerPhone && targetPhone === ownerPhone) {
        return json({ ok: false, instanceName, error: "Recusei enviar teste para o número dono da instância.", ownerPhone }, 400);
      }
      const whatsappNumbers = targetPhone
        ? await evo(`/chat/whatsappNumbers/${instanceName}`, {
          method: "POST",
          body: JSON.stringify({ numbers: [targetPhone] }),
        })
        : null;

      let sendCheck: any = null;
      let statusCheck: any = null;
      let messageCheck: any = null;
      if (targetPhone && typeof testText === "string" && testText.trim()) {
        sendCheck = await evo(`/message/sendText/${instanceName}`, {
          method: "POST",
          body: JSON.stringify({
            number: targetPhone,
            text: testText.trim(),
          }),
        });
        const sentId = sendCheck.body?.key?.id;
        if (sentId) {
          await wait(2500);
          statusCheck = await evo(`/chat/findStatusMessage/${instanceName}`, {
            method: "POST",
            body: JSON.stringify({ where: { id: sentId } }),
          });
          messageCheck = await evo(`/chat/findMessages/${instanceName}`, {
            method: "POST",
            body: JSON.stringify({ where: { key: { id: sentId } } }),
          });
        }
      }

      return json({
        ok: true,
        instanceName,
        connection: { status: connection.status, body: connection.body },
        instanceInfo: { status: info.status, body: info.body },
        whatsappNumbers: whatsappNumbers ? { status: whatsappNumbers.status, body: whatsappNumbers.body } : null,
        sendCheck: sendCheck ? { status: sendCheck.status, body: sendCheck.body } : null,
        statusCheck: statusCheck ? { status: statusCheck.status, body: statusCheck.body } : null,
        messageCheck: messageCheck ? { status: messageCheck.status, body: messageCheck.body } : null,
      });
    }

    if (action === "adopt-instance") {
      const instanceName = cleanInstanceName(requestedInstanceName);
      if (!instanceName) return json({ error: "instanceName obrigatório" }, 400);

      await ensureWebhook(instanceName);
      const s = await evo(`/instance/connectionState/${instanceName}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? "unknown";
      const info = await evo(`/instance/fetchInstances?instanceName=${instanceName}`);
      const phone = extractOwnerPhone(info.body);
      const connected = state === "open";

      if (!connected) {
        return json({ ok: false, state, instanceName, error: "Instância não está conectada" }, 409);
      }

      await admin.from("whatsapp_connections").upsert({
        portfolio_id: portfolioId,
        instance_name: instanceName,
        status: "connected",
        phone,
      }, { onConflict: "portfolio_id" });
      await admin.from("whatsapp_agents")
        .update({ instancia_id: instanceName })
        .eq("portfolio_id", portfolioId);

      return json({ ok: true, state, instanceName, phone });
    }

    if (action === "disconnect") {
      const instances = await listInstancesForPortfolio(portfolioId);
      const namesToDelete = new Set(instances.map((item) => item.name));
      if (existing?.instance_name) namesToDelete.add(existing.instance_name);
      for (const name of namesToDelete) await deleteInstance(name);
      await admin.from("whatsapp_connections")
        .update({ status: "disconnected", phone: null })
        .eq("portfolio_id", portfolioId);
      await admin.from("whatsapp_agents")
        .update({ instancia_id: null })
        .eq("portfolio_id", portfolioId);
      return json({ ok: true });
    }

    return json({ error: "action inválido" }, 400);
  } catch (e) {
    console.error("whatsapp-connection error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
