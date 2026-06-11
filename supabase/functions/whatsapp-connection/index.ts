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

    const { action, portfolioId } = await req.json();
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

      // Apaga instância anterior (se houver) para evitar sessão zumbi presa em count:0
      if (existing?.instance_name) {
        await evo(`/instance/logout/${existing.instance_name}`, { method: "DELETE" });
        await evo(`/instance/delete/${existing.instance_name}`, { method: "DELETE" });
        await wait(600);
      }

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

      // Registrar webhook para auto-resposta (MESSAGES_UPSERT)
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
      const setWebhook = await evo(`/webhook/set/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT"],
          },
          // formato alternativo aceito por algumas versões
          enabled: true,
          url: webhookUrl,
          events: ["MESSAGES_UPSERT"],
        }),
      });
      console.log("webhook set status:", setWebhook.status, JSON.stringify(setWebhook.body).slice(0, 300));


      // Upsert na tabela
      await admin.from("whatsapp_connections").upsert({
        portfolio_id: portfolioId,
        instance_name: instanceName,
        status: "connecting",
      }, { onConflict: "portfolio_id" });

      if (!qrCode) return json({ error: "QR não retornado pela Evolution.", raw });
      return json({ instanceName, qr: qrCode });
    }

    if (action === "status") {
      if (!existing?.instance_name) return json({ state: "disconnected" });
      const s = await evo(`/instance/connectionState/${existing.instance_name}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? "unknown";
      if (state === "open") {
        const info = await evo(`/instance/fetchInstances?instanceName=${existing.instance_name}`);
        const arr = Array.isArray(info.body) ? info.body : [info.body];
        const owner = arr[0]?.instance?.owner ?? arr[0]?.owner ?? null;
        const phone = owner ? String(owner).split("@")[0] : null;
        await admin.from("whatsapp_connections")
          .update({ status: "connected", phone })
          .eq("portfolio_id", portfolioId);
      }
      return json({ state });
    }

    if (action === "disconnect") {
      if (existing?.instance_name) {
        await evo(`/instance/logout/${existing.instance_name}`, { method: "DELETE" });
        await evo(`/instance/delete/${existing.instance_name}`, { method: "DELETE" });
      }
      await admin.from("whatsapp_connections")
        .update({ status: "disconnected", phone: null })
        .eq("portfolio_id", portfolioId);
      return json({ ok: true });
    }

    return json({ error: "action inválido" }, 400);
  } catch (e) {
    console.error("whatsapp-connection error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
