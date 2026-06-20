// Gerencia conexões WhatsApp (Evolution API) por portfólio.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") || "").replace(/\/+$/, "");
const N8N_API_KEY = Deno.env.get("N8N_API_KEY") || "";

async function n8nApi(path: string, init: RequestInit = {}) {
  if (!N8N_BASE_URL || !N8N_API_KEY) return null;
  try {
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
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    console.error("n8n api error", e);
    return null;
  }
}

async function deleteN8nWorkflow(id: string) {
  if (!id) return;
  await n8nApi(`/workflows/${id}/deactivate`, { method: "POST" });
  const del = await n8nApi(`/workflows/${id}`, { method: "DELETE" });
  console.log("n8n workflow deleted", id, del?.status);
}

// Remove TODOS os workflows do n8n criados pelo sistema que não estão mais
// associados a nenhum agent (n8n_workflow_id na tabela whatsapp_agents).
async function cleanupOrphanN8nWorkflows(admin: ReturnType<typeof createClient>) {
  if (!N8N_BASE_URL || !N8N_API_KEY) return;
  const list = await n8nApi("/workflows?limit=250");
  if (!list?.ok) return;
  const items = Array.isArray(list.body?.data) ? list.body.data : (Array.isArray(list.body) ? list.body : []);
  const candidates = items.filter((w: any) => String(w?.name || "").startsWith("WhatsApp Agent —"));
  if (!candidates.length) return;
  const { data: agents } = await admin.from("whatsapp_agents").select("n8n_workflow_id");
  const inUse = new Set((agents || []).map((a: any) => String(a.n8n_workflow_id || "")).filter(Boolean));
  for (const w of candidates) {
    const id = String(w.id);
    if (!inUse.has(id)) {
      await deleteN8nWorkflow(id);
    }
  }
}


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

    const reqBody = await req.json();
    const { action, portfolioId, instanceName: requestedInstanceName, phone, testText, reportGroupId, reportGroupName, reportPayload, trigger } = reqBody;
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

      // Apaga workflows antigos do n8n referenciados pelo agente (evita duplicatas)
      const { data: agentRow } = await admin
        .from("whatsapp_agents").select("n8n_workflow_id").eq("portfolio_id", portfolioId).maybeSingle();
      if (agentRow?.n8n_workflow_id) {
        await deleteN8nWorkflow(agentRow.n8n_workflow_id);
        await admin.from("whatsapp_agents")
          .update({ n8n_workflow_id: null, n8n_webhook_path: null })
          .eq("portfolio_id", portfolioId);
      }
      // Limpeza global de workflows órfãos do n8n
      await cleanupOrphanN8nWorkflows(admin);


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
      const s = await evo(`/instance/connectionState/${existing.instance_name}`);
      const state = s.body?.instance?.state ?? s.body?.state ?? "unknown";
      if (state === "open") {
        await ensureSettings(existing.instance_name);
        // Garante que o webhook da Evolution aponta para o webhook LOCAL
        // (que tem memória de 24h e respeita o toggle Ativar/Desativar IA).
        await ensureWebhook(existing.instance_name);
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

      // Apaga o workflow do n8n associado, se existir
      const { data: agentRow } = await admin
        .from("whatsapp_agents").select("n8n_workflow_id").eq("portfolio_id", portfolioId).maybeSingle();
      if (agentRow?.n8n_workflow_id) {
        await deleteN8nWorkflow(agentRow.n8n_workflow_id);
      }
      // Limpeza global de workflows órfãos do n8n
      await cleanupOrphanN8nWorkflows(admin);

      await admin.from("whatsapp_connections")
        .update({ status: "disconnected", phone: null })
        .eq("portfolio_id", portfolioId);
      await admin.from("whatsapp_agents")
        .update({ instancia_id: null, n8n_workflow_id: null, n8n_webhook_path: null, status: "inactive" })
        .eq("portfolio_id", portfolioId);
      return json({ ok: true });
    }

    if (action === "list-groups") {
      const instanceName = existing?.instance_name;
      if (!instanceName) return json({ error: "WhatsApp não conectado" }, 409);
      const r = await evo(`/group/fetchAllGroups/${instanceName}?getParticipants=false`);
      if (!r.ok) return json({ error: "Falha ao buscar grupos", status: r.status, raw: r.body }, 502);
      const rows = Array.isArray(r.body) ? r.body : (Array.isArray(r.body?.groups) ? r.body.groups : []);
      const groups = rows.map((g: any) => ({
        id: String(g.id ?? g.remoteJid ?? g.jid ?? ""),
        name: String(g.subject ?? g.name ?? g.id ?? "(sem nome)"),
        participants_count: Number(g.size ?? g.participantsCount ?? (Array.isArray(g.participants) ? g.participants.length : 0)) || 0,
        avatar_url: g.pictureUrl ?? g.profilePicUrl ?? g.picture ?? null,
      })).filter((g: any) => g.id);
      groups.sort((a: any, b: any) => a.name.localeCompare(b.name));
      return json({ groups });
    }

    if (action === "save-report-group") {
      if (!reportGroupId) {
        await admin.from("whatsapp_agents")
          .update({ report_group_id: null, report_group_name: null })
          .eq("portfolio_id", portfolioId);
        return json({ ok: true, cleared: true });
      }
      await admin.from("whatsapp_agents")
        .update({ report_group_id: reportGroupId, report_group_name: reportGroupName ?? null })
        .eq("portfolio_id", portfolioId);
      return json({ ok: true });
    }

    if (action === "send-report") {
      const instanceName = existing?.instance_name;
      if (!instanceName) return json({ error: "WhatsApp não conectado" }, 409);
      const { data: ag } = await admin
        .from("whatsapp_agents")
        .select("report_group_id, report_group_name")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (!ag?.report_group_id) return json({ error: "Nenhum grupo de relatórios configurado" }, 400);

      const allowedTriggers = ["meeting_confirmed", "human_requested"];
      if (!trigger || !allowedTriggers.includes(String(trigger))) {
        return json({ error: "Gatilho inválido. Use meeting_confirmed ou human_requested." }, 400);
      }

      const p = reportPayload ?? {};
      const required = ["nome", "whatsapp", "empresa", "segmento", "faturamento", "investimento", "servicos_interesse", "area_prioritaria"];
      const missing = required.filter((k) => {
        const v = p[k];
        if (Array.isArray(v)) return v.length === 0;
        return v === undefined || v === null || String(v).trim() === "";
      });
      if (missing.length) return json({ error: "Campos obrigatórios ausentes", missing }, 400);

      const servicos = Array.isArray(p.servicos_interesse) ? p.servicos_interesse.join(", ") : String(p.servicos_interesse);
      const triggerLabel = trigger === "meeting_confirmed" ? "✅ Reunião confirmada" : "🙋 Solicitou falar com humano";
      const text = [
        `📋 *NOVO LEAD — GA COMPANY*`,
        `_${triggerLabel}_`,
        ``,
        `👤 *Lead:* ${p.nome}`,
        `📱 *WhatsApp:* ${p.whatsapp}`,
        `🏢 *Empresa:* ${p.empresa}`,
        `📂 *Segmento:* ${p.segmento}`,
        `💰 *Faturamento Mensal:* ${p.faturamento}`,
        `💵 *Disponível para Investir:* ${p.investimento}`,
        `🎯 *Serviços de Interesse:* ${servicos}`,
        `🔥 *Área Prioritária:* ${p.area_prioritaria}`,
        p.momento_negocio ? `📊 *Momento do Negócio:* ${p.momento_negocio}` : "",
        p.objecao_principal ? `⚠️ *Objeção Principal:* ${p.objecao_principal}` : "",
        p.nivel_interesse ? `🌡️ *Nível de Interesse:* ${p.nivel_interesse}` : "",
        typeof p.guardrail_ativado === "boolean" ? `🛑 *Guardrail Ativado?* ${p.guardrail_ativado ? "sim" : "não"}` : "",
        p.proximo_passo ? `📅 *Próximo Passo:* ${p.proximo_passo}` : "",
      ].filter(Boolean).join("\n");

      const r = await evo(`/message/sendText/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({ number: ag.report_group_id, text }),
      });
      console.log("send-report", JSON.stringify({ instanceName, group: ag.report_group_id, status: r.status, ok: r.ok }));
      if (!r.ok) return json({ error: "Falha ao enviar relatório", status: r.status, raw: r.body }, 502);
      return json({ ok: true, group: ag.report_group_name ?? ag.report_group_id });
    }

    return json({ error: "action inválido" }, 400);

  } catch (e) {
    console.error("whatsapp-connection error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
