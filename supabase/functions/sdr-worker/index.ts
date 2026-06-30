// Worker do SDR — chamado a cada minuto pelo pg_cron.
// Para cada campanha 'running': dispara aberturas dentro do budget de RPM,
// envia follow-ups (24h e 48h) e respeita cooldowns.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function splitMessage(text: string): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  if (raw.includes("|||")) return raw.split("|||").map((s) => s.trim()).filter(Boolean);
  const byParagraph = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (byParagraph.length > 1) return byParagraph;
  if (raw.length <= 250 && raw.split(/\n/).length <= 3) return [raw];
  const sentences = raw.match(/[^.!?\n]+[.!?\n]+/g) ?? [raw];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > 200 && cur.length > 0) { chunks.push(cur.trim()); cur = s; }
    else cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(Boolean);
}

const SPLIT_DELAY_MS = 8000;

async function evoSend(instance: string, number: string, text: string): Promise<boolean> {
  const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("evoSend fail", instance, number, r.status, t.slice(0, 300));
    return false;
  }
  return true;
}

async function sendInBubbles(instance: string, number: string, text: string): Promise<{ sent: string[]; failed: string[] }> {
  const parts = splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ok = await evoSend(instance, number, parts[i]);
    if (ok) sent.push(parts[i]); else failed.push(parts[i]);
    if (i < parts.length - 1) await sleep(SPLIT_DELAY_MS);
  }
  return { sent, failed };
}

async function logAssistant(lead: any, instance: string, parts: string[], failed: string[]) {
  const rows = [
    ...parts.map((m) => ({ mensagem: m, role: "assistant" as const })),
    ...failed.map((m) => ({ mensagem: `[FALHA AO ENVIAR] ${m}`, role: "assistant" as const })),
  ];
  if (!rows.length) return;
  await admin.from("whatsapp_conversas").insert(rows.map((r) => ({
    portfolio_id: lead.portfolio_id,
    instance_name: instance,
    contato_telefone: String(lead.telefone).replace(/\D/g, ""),
    contato_nome: lead.nome_resolvido ?? lead.nome ?? null,
    role: r.role,
    mensagem: r.mensagem,
    sdr_lead_id: lead.id,
  })));
}

async function resolveName(instance: string, lead: any): Promise<string> {
  if (lead.nome && lead.nome.trim()) return lead.nome.trim();
  try {
    const r = await fetch(`${EVO_URL}/chat/findContacts/${instance}`, {
      method: "POST",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ where: { remoteJid: `${lead.telefone}@s.whatsapp.net` } }),
    });
    if (r.ok) {
      const body = await r.json();
      const arr = Array.isArray(body) ? body : body?.contacts ?? [];
      const name = arr[0]?.pushName ?? arr[0]?.name ?? null;
      if (name && String(name).trim()) return String(name).trim();
    }
  } catch { /* ignore */ }
  return "você";
}

function buildIdentidade(nomeAtendente: string | null): string {
  const n = nomeAtendente?.trim();
  return n
    ? `Seu nome é ${n}. Apresente-se com esse nome quando fizer sentido (ex: "Sou ${n} da GA Company"). NUNCA use placeholders entre colchetes ou chaves como [Seu Nome], [Nome], {nome}, etc. — se faltar algum dado, simplesmente omita.`
    : `Não invente nome próprio para você. Apresente-se apenas como "da GA Company". NUNCA use placeholders entre colchetes ou chaves como [Seu Nome], [Nome], etc.`;
}

const PLACEHOLDER_RE = /\[[^\]]{1,40}\]|\{[^}]{1,40}\}/;

async function aiOpening(nome: string, nicho: string, motivo: string, nomeAtendente: string | null): Promise<string> {
  const prompt =
    `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\n` +
    `Gere uma abertura natural de WhatsApp para ${nome} do segmento ${nicho}.\n` +
    `Use este motivo como base: ${motivo}.\n` +
    `Quebre em 3 a 4 mensagens curtas de 1-2 linhas cada, separadas por |||.\n` +
    `Seja direto, humano, sem parecer script. Termine com CTA para call de 15 min.\n` +
    `Retorne APENAS as mensagens separadas por |||. Sem explicação e SEM placeholders entre colchetes/chaves.`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 350,
      }),
    });
    if (!r.ok) throw new Error(`ai ${r.status}`);
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content?.trim();
    if (txt && !PLACEHOLDER_RE.test(txt)) return txt;
    if (txt) console.warn("aiOpening retornou placeholder, indo pro fallback:", txt.slice(0, 140));
  } catch (e) {
    console.error("aiOpening fail", e);
  }
  // Fallback determinístico
  const eu = nomeAtendente?.trim() ? `Sou ${nomeAtendente.trim()} da GA Company` : `Aqui é da GA Company`;
  return [
    `Oi ${nome}! Tudo bem?`,
    `${eu} — agência especializada em crescimento pra ${nicho}.`,
    `${motivo.slice(0, 180)}`,
    `Topa uma call rápida de 15 minutos pra te mostrar como podemos ajudar?`,
  ].join("|||");
}

async function aiFollowup(nome: string, nicho: string, motivo: string, isFinal: boolean, nomeAtendente: string | null): Promise<string> {
  const prompt = isFinal
    ? `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\nEscreva um follow-up FINAL e gentil de WhatsApp para ${nome} (${nicho}) que não respondeu. Tom leve, sem cobrança, encerrando o contato mas deixando porta aberta. Motivo original: ${motivo}. Quebre em 2 mensagens curtas com |||. Retorne só as mensagens, sem placeholders entre colchetes/chaves.`
    : `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\nEscreva um follow-up curto e simpático de WhatsApp para ${nome} (${nicho}) que não respondeu. Motivo original: ${motivo}. Reforce brevemente o valor e proponha de novo a call de 15 min. Quebre em 2 mensagens curtas com |||. Retorne só as mensagens, sem placeholders entre colchetes/chaves.`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 220,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content?.trim();
      if (txt && !PLACEHOLDER_RE.test(txt)) return txt;
      if (txt) console.warn("aiFollowup retornou placeholder, indo pro fallback:", txt.slice(0, 140));
    }
  } catch { /* ignore */ }
  return isFinal
    ? `Oi ${nome}, sem problema se agora não for o momento.|||Deixo a porta aberta se quiser conversar mais pra frente! 🙏`
    : `Oi ${nome}, passando aqui só pra confirmar se você viu minha mensagem.|||Topa marcar 15 min essa semana?`;
}

async function processCampaign(campaign: any) {
  const ratePerMinute = Math.max(1, Math.ceil(campaign.rate_per_hour / 60));

  // Pega instância conectada do portfólio
  const { data: conn } = await admin
    .from("whatsapp_connections").select("instance_name, status").eq("portfolio_id", campaign.portfolio_id).maybeSingle();
  if (!conn?.instance_name || conn.status !== "connected") {
    console.log("campanha sem WhatsApp conectado", campaign.id);
    return { skipped: "no-connection" };
  }
  const instance = conn.instance_name;
  const now = new Date();
  const nowIso = now.toISOString();

  // Busca o nome do atendente + flag de follow-up ativo
  const { data: agentRow } = await admin
    .from("whatsapp_agents")
    .select("nome_atendente, sdr_followup_enabled")
    .eq("portfolio_id", campaign.portfolio_id)
    .maybeSingle();
  const nomeAtendente: string | null = agentRow?.nome_atendente?.trim() || null;
  const followupEnabled: boolean = agentRow?.sdr_followup_enabled !== false;

  let fu1Count = 0, fu2Count = 0, fu3Count = 0;
  if (followupEnabled) {
    // Cadência (sobre ultima_mensagem_em, só leads que ainda não responderam):
    //   FU1: 30 min de silêncio
    //   FU2: 4 h após FU1
    //   FU3 (final): 24 h após FU2
    const fu1Cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const { data: fu1 } = await admin
      .from("sdr_leads")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "enviado")
      .eq("follow_up_count", 0)
      .lte("ultima_mensagem_em", fu1Cutoff)
      .limit(ratePerMinute);

    for (const lead of fu1 ?? []) {
      if (lead.cooldown_ate && new Date(lead.cooldown_ate) > now) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, false, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text);
      await logAssistant(lead, instance, sent, failed);
      if (sent.length) {
        await admin.from("sdr_leads").update({
          follow_up_count: 1,
          ultima_mensagem_em: nowIso,
          mensagens_trocadas: (lead.mensagens_trocadas ?? 0) + sent.length,
        }).eq("id", lead.id);
      }
      await sleep(rand(8000, 16000));
    }
    fu1Count = (fu1 ?? []).length;

    const fu2Cutoff = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();
    const { data: fu2 } = await admin
      .from("sdr_leads")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "enviado")
      .eq("follow_up_count", 1)
      .lte("ultima_mensagem_em", fu2Cutoff)
      .limit(ratePerMinute);

    for (const lead of fu2 ?? []) {
      if (lead.cooldown_ate && new Date(lead.cooldown_ate) > now) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, false, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text);
      await logAssistant(lead, instance, sent, failed);
      if (sent.length) {
        await admin.from("sdr_leads").update({
          follow_up_count: 2,
          ultima_mensagem_em: nowIso,
          mensagens_trocadas: (lead.mensagens_trocadas ?? 0) + sent.length,
        }).eq("id", lead.id);
      }
      await sleep(rand(8000, 16000));
    }
    fu2Count = (fu2 ?? []).length;

    // FU final (24h após FU2) — limite máximo de tentativas
    const fu3Cutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const { data: fu3 } = await admin
      .from("sdr_leads")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "enviado")
      .eq("follow_up_count", 2)
      .lte("ultima_mensagem_em", fu3Cutoff)
      .limit(ratePerMinute);

    for (const lead of fu3 ?? []) {
      if (lead.cooldown_ate && new Date(lead.cooldown_ate) > now) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, true, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text);
      await logAssistant(lead, instance, sent, failed);
      await admin.from("sdr_leads").update({
        follow_up_count: 3,
        status: "sem_resposta",
        ultima_mensagem_em: nowIso,
        mensagens_trocadas: (lead.mensagens_trocadas ?? 0) + sent.length,
      }).eq("id", lead.id);
      await sleep(rand(8000, 16000));
    }
    fu3Count = (fu3 ?? []).length;
  } else {
    console.log("follow-up SDR desativado para portfolio", campaign.portfolio_id);
  }


  // === Aberturas ===
  const { data: pending } = await admin
    .from("sdr_leads")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(ratePerMinute);

  let dispatched = 0;
  for (const lead of pending ?? []) {
    const nameResolved = await resolveName(instance, lead);
    const text = await aiOpening(nameResolved, lead.nicho, lead.motivo_contato, nomeAtendente);
    await sleep(rand(8000, 16000));
    const { sent, failed } = await sendInBubbles(instance, lead.telefone, text);
    await logAssistant({ ...lead, nome_resolvido: nameResolved }, instance, sent, failed);
    if (sent.length) {
      await admin.from("sdr_leads").update({
        enviado: true,
        status: "enviado",
        nome_resolvido: nameResolved,
        primeira_mensagem_em: nowIso,
        ultima_mensagem_em: nowIso,
        mensagens_trocadas: sent.length,
      }).eq("id", lead.id);
      dispatched++;
    } else {
      // Mantém pendente para retry no próximo tick
      console.error("falha total ao enviar abertura", lead.id);
    }
  }

  return { dispatched, fu1: (fu1 ?? []).length, fu2: (fu2 ?? []).length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data: campaigns } = await admin.from("sdr_campaigns").select("*").eq("status", "running");
    const results: any[] = [];
    for (const c of campaigns ?? []) {
      try {
        // Roda campanhas em paralelo? Sequencial é mais seguro pro rate-limit por instância.
        const r = await processCampaign(c);
        results.push({ campaignId: c.id, ...r });
      } catch (e) {
        console.error("campaign error", c.id, e);
        results.push({ campaignId: c.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, results });
  } catch (e) {
    console.error("sdr-worker error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
