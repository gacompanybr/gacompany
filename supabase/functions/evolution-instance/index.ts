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

    const instanceName = agent.instancia_id ?? `lopes_${agentId.slice(0, 8)}`;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;

    if (action === "connect") {
      // Cria instância (idempotente: se já existe, ignora)
      const create = await evo("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        }),
      });
      // Se já existe, pega o QR atual
      if (!create.ok && create.status !== 403 && create.status !== 409) {
        // 403/409 = "já existe" em algumas versões; outros erros falham
        if (create.status >= 500) return json({ error: "Falha ao criar instância", detail: create.body }, 500);
      }

      // Buscar QR
      const qr = await evo(`/instance/connect/${instanceName}`);
      const qrCode = qr.body?.base64 ?? qr.body?.qrcode?.base64 ?? qr.body?.code ?? null;

      await admin.from("whatsapp_agents").update({
        status: "connecting",
        instancia_id: instanceName,
      }).eq("id", agentId);

      return json({ instanceName, qr: qrCode, raw: qr.body });
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
