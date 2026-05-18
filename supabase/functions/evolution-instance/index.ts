// Gerencia instâncias Evolution API para os agentes WhatsApp
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
  for (const value of Object.values(body)) {
    const found = extractQr(value);
    if (found) return found;
  }
  return null;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

    const { action, agentId } = await req.json();
    if (!action || !agentId) return json({ error: "action e agentId obrigatórios" }, 400);

    // Buscar agente + checar acesso
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: agent, error: aerr } = await admin
      .from("whatsapp_agents").select("*").eq("id", agentId).maybeSingle();
    if (aerr || !agent) return json({ error: "Agente não encontrado" }, 404);

    const { data: hasAccess } = await admin.rpc("has_portfolio_access", {
      _user_id: user.id, _portfolio_id: agent.portfolio_id,
    });
    if (!hasAccess) return json({ error: "Sem acesso" }, 403);

    let instanceName = agent.instancia_id ?? `lopes_${agentId.slice(0, 8)}`;

    if (action === "connect") {
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
        for (const delay of [700, 1500, 2500]) {
          await wait(delay);
          const qr = await evo(`/instance/connect/${name}`);
          lastRaw = qr.body;
          const code = extractQr(qr.body);
          if (code) return { code, raw: qr.body };
        }
        return { code: null as string | null, raw: lastRaw };
      };

      // Cria instância (idempotente)
      let create = await createInstance(instanceName);
      console.log("evo create status:", create.status, "body:", JSON.stringify(create.body).slice(0, 600));
      if (!create.ok && create.status !== 403 && create.status !== 409) {
        if (create.status >= 500) {
          return json({ error: "Falha ao criar instância", status: create.status, detail: create.body }, 500);
        }
      }

      // Buscar QR (pode vir já no create ou no connect)
      let qrCode: string | null = extractQr(create.body);
      let raw: any = create.body;

      if (!qrCode) {
        const firstQr = await getQr(instanceName);
        qrCode = firstQr.code;
        raw = firstQr.raw;

        // Quando a Evolution fica presa em { count: 0 }, a instância existe mas não emite QR.
        // Apaga a sessão zumbi e recria com nome novo para liberar um QR válido.
        if (!qrCode && raw?.count === 0) {
          await evo(`/instance/logout/${instanceName}`, { method: "DELETE" });
          await evo(`/instance/delete/${instanceName}`, { method: "DELETE" });
          await wait(900);
          instanceName = `lopes_${agentId.slice(0, 8)}_${Date.now().toString(36).slice(-5)}`;
          create = await createInstance(instanceName);
          console.log("evo recreate status:", create.status, "body:", JSON.stringify(create.body).slice(0, 600));
          qrCode = extractQr(create.body);
          raw = create.body;
          if (!qrCode) {
            const retryQr = await getQr(instanceName);
            qrCode = retryQr.code;
            raw = retryQr.raw;
          }
        }
      }

      console.log("evolution connect raw:", JSON.stringify(raw).slice(0, 500));

      await admin.from("whatsapp_agents").update({
        status: "connecting",
        instancia_id: instanceName,
      }).eq("id", agentId);

      if (!qrCode) {
        return json({ error: "QR não retornado pela Evolution. A instância foi recriada, mas a API continuou retornando count:0.", raw });
      }
      return json({ instanceName, qr: qrCode, raw });
    }

    if (action === "status") {
      const s = await evo(`/instance/connectionState/${instanceName}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? "unknown";
      // open = conectado
      if (state === "open") {
        // pegar número
        const info = await evo(`/instance/fetchInstances?instanceName=${instanceName}`);
        const arr = Array.isArray(info.body) ? info.body : [info.body];
        const me = arr[0]?.instance?.owner ?? arr[0]?.owner ?? null;
        const phone = me ? String(me).split("@")[0] : null;
        await admin.from("whatsapp_agents").update({
          status: "active",
          telefone: phone,
        }).eq("id", agentId);
      }
      return json({ state, raw: s.body });
    }

    if (action === "disconnect") {
      await evo(`/instance/logout/${instanceName}`, { method: "DELETE" });
      await evo(`/instance/delete/${instanceName}`, { method: "DELETE" });
      await admin.from("whatsapp_agents").update({
        status: "inactive", instancia_id: null, telefone: null,
      }).eq("id", agentId);
      return json({ ok: true });
    }

    if (action === "groups") {
      // Lista grupos da instância
      const g = await evo(`/group/fetchAllGroups/${instanceName}?getParticipants=false`);
      const arr = Array.isArray(g.body) ? g.body : (g.body?.groups ?? []);
      const groups = arr.map((x: any) => ({
        id: x.id ?? x.remoteJid ?? x.jid,
        nome: x.subject ?? x.name ?? x.id,
      })).filter((x: any) => x.id);
      return json({ groups });
    }

    return json({ error: "action inválido" }, 400);
  } catch (e) {
    console.error("evolution-instance error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
