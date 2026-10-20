// Worker do SDR — chamado a cada minuto pelo pg_cron.
// Para cada campanha 'running': dispara aberturas dentro do budget de RPM,
// envia follow-ups (24h e 48h) e respeita cooldowns.
import { createClient } from "npm:@supabase/supabase-js@2";
import { canSendContactFollowup, canSendContactProspecting } from "../_shared/contact-followup-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GOOGLE_CLOUD_TTS_API_KEY = Deno.env.get("GOOGLE_CLOUD_TTS_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const MAX_BUBBLES = 4;

function splitMessage(text: string): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  let parts: string[];
  if (raw.includes("|||")) {
    parts = raw.split("|||").map((s) => s.trim()).filter(Boolean);
  } else {
    const byParagraph = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (byParagraph.length > 1) {
      parts = byParagraph;
    } else if (raw.length <= 250 && raw.split(/\n/).length <= 3) {
      parts = [raw];
    } else {
      const sentences = raw.match(/[^.!?\n]+[.!?\n]+/g) ?? [raw];
      const chunks: string[] = [];
      let cur = "";
      for (const s of sentences) {
        if ((cur + s).length > 200 && cur.length > 0) { chunks.push(cur.trim()); cur = s; }
        else cur += s;
      }
      if (cur.trim()) chunks.push(cur.trim());
      parts = chunks.filter(Boolean);
    }
  }
  // Nunca mandar mais que MAX_BUBBLES — se sobrar, junta o resto na última bolha
  if (parts.length > MAX_BUBBLES) {
    const head = parts.slice(0, MAX_BUBBLES - 1);
    const tail = parts.slice(MAX_BUBBLES - 1).join(" ");
    parts = [...head, tail];
  }
  return parts;
}

const SPLIT_DELAY_MS = 8000;

type SendResult = { ok: boolean; invalidNumber: boolean };

async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!GOOGLE_CLOUD_TTS_API_KEY || !text.trim()) return null;
  try {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(GOOGLE_CLOUD_TTS_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: text.trim() },
        voice: { languageCode: "pt-BR", name: "pt-BR-Chirp3-HD-Leda" },
        audioConfig: { audioEncoding: "OGG_OPUS", speakingRate: 1.06 },
      }),
    });
    if (!r.ok) {
      console.error("Google TTS fail", r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const body = await r.json();
    return typeof body?.audioContent === "string" && body.audioContent ? body.audioContent : null;
  } catch (e) {
    console.error("Google TTS exception", e);
    return null;
  }
}

async function evoSendAudio(instance: string, number: string, text: string, portfolioId?: string | null): Promise<SendResult> {
  const audio = await synthesizeSpeech(text);
  if (!audio) return { ok: false, invalidNumber: false };
  if (portfolioId && !await canSendContactProspecting(admin, portfolioId, number)) return { ok: false, invalidNumber: false };
  try {
    const r = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
      // Evolution aceita o conteúdo base64 puro neste endpoint. O prefixo data URI
      // faz a mídia ser rejeitada como "Owned media" inválida.
      body: JSON.stringify({ number, audio }),
    });
    if (r.ok) {
      try {
        const body = await r.clone().json().catch(() => null);
        const msgId = body?.key?.id ?? body?.message?.key?.id ?? body?.data?.key?.id ?? null;
        if (msgId && portfolioId) {
          await admin.from("whatsapp_sent_messages_log").upsert(
            { portfolio_id: portfolioId, instance_name: instance, phone: number, message_id: String(msgId) },
            { onConflict: "message_id", ignoreDuplicates: true },
          );
        }
      } catch { /* log best-effort */ }
      return { ok: true, invalidNumber: false };
    }
    const responseText = await r.text();
    console.error("evoSendAudio fail", instance, number, r.status, responseText.slice(0, 300));
    return { ok: false, invalidNumber: r.status === 400 && /"exists"\s*:\s*false/i.test(responseText) };
  } catch (e) {
    console.error("evoSendAudio exception", instance, number, e);
    return { ok: false, invalidNumber: false };
  }
}

async function evoSend(instance: string, number: string, text: string, portfolioId?: string | null): Promise<SendResult> {
  if (portfolioId && !await canSendContactProspecting(admin, portfolioId, number)) return { ok: false, invalidNumber: false };
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (r.ok) {
      // Registra o id da mensagem enviada pelo SISTEMA para que o webhook não
      // confunda com uma mensagem digitada manualmente pela equipe (pausa 3h).
      try {
        const body = await r.clone().json().catch(() => null);
        const msgId = body?.key?.id ?? body?.message?.key?.id ?? body?.data?.key?.id ?? null;
        if (msgId && portfolioId) {
          await admin.from("whatsapp_sent_messages_log").upsert(
            { portfolio_id: portfolioId, instance_name: instance, phone: number, message_id: String(msgId) },
            { onConflict: "message_id", ignoreDuplicates: true },
          );
        }
      } catch { /* log best-effort */ }
      return { ok: true, invalidNumber: false };
    }
    const t = await r.text();
    console.error("evoSend fail", instance, number, r.status, t.slice(0, 300));
    // Evolution retorna 400 com "exists":false quando o número não tem WhatsApp
    const invalid = r.status === 400 && /"exists"\s*:\s*false/i.test(t);
    return { ok: false, invalidNumber: invalid };
  } catch (e) {
    console.error("evoSend exception", instance, number, e);
    return { ok: false, invalidNumber: false };
  }
}

async function sendInBubbles(instance: string, number: string, text: string, portfolioId?: string | null, followupSourceAt?: string): Promise<{ sent: string[]; failed: string[]; invalidNumber: boolean }> {
  const parts = splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  let invalidNumber = false;
  for (let i = 0; i < parts.length; i++) {
    if (followupSourceAt && (!portfolioId || !await canSendContactFollowup(admin, portfolioId, number, followupSourceAt))) break;
    const res = await evoSend(instance, number, parts[i], portfolioId);
    if (res.ok) {
      sent.push(parts[i]);
    } else {
      failed.push(parts[i]);
      if (res.invalidNumber) { invalidNumber = true; break; } // não adianta insistir
    }
    if (i < parts.length - 1) await sleep(SPLIT_DELAY_MS);
  }
  return { sent, failed, invalidNumber };
}

async function sendOpeningWithAudio(
  instance: string,
  number: string,
  text: string,
  campaign: any,
  portfolioId?: string | null,
): Promise<{ sent: string[]; failed: string[]; invalidNumber: boolean; audioSent: string[] }> {
  const parts = splitMessage(text);
  const sent: string[] = [];
  const failed: string[] = [];
  const audioSent: string[] = [];
  let invalidNumber = false;
  const longOpeningAsAudio = campaign.audio_enabled === true && campaign.audio_on_intro !== true &&
    campaign.audio_on_long_message === true && text.length >= Number(campaign.audio_long_message_threshold ?? 420);

  if (longOpeningAsAudio) {
    let result = await evoSendAudio(instance, number, text, portfolioId);
    if (result.ok) return { sent: [text], failed, invalidNumber: false, audioSent: [text] };
    if (!result.invalidNumber) {
      return { ...(await sendInBubbles(instance, number, text, portfolioId)), audioSent };
    }
    return { sent, failed: [text], invalidNumber: true, audioSent };
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const shouldUseAudio = campaign.audio_enabled === true && campaign.audio_on_intro === true && i === 0;
    let result: SendResult;
    if (shouldUseAudio) {
      result = await evoSendAudio(instance, number, part, portfolioId);
      if (result.ok) audioSent.push(part);
      else if (!result.invalidNumber) result = await evoSend(instance, number, part, portfolioId);
    } else {
      result = await evoSend(instance, number, part, portfolioId);
    }
    if (result.ok) sent.push(part);
    else {
      failed.push(part);
      if (result.invalidNumber) { invalidNumber = true; break; }
    }
    if (i < parts.length - 1) await sleep(SPLIT_DELAY_MS);
  }
  return { sent, failed, invalidNumber, audioSent };
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

async function aiOpening(nome: string, nicho: string, motivo: string, nomeAtendente: string | null, audioIntro = false): Promise<string> {
  const prompt =
    `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\n` +
    `Gere uma abertura natural de WhatsApp para ${nome} do segmento ${nicho}.\n` +
    `Use este motivo como base (contexto interno, NÃO repita literal): ${motivo}.\n` +
    (audioIntro
      ? `A PRIMEIRA mensagem será um áudio: escreva uma fala única e fluida, com cerca de 50 a 75 palavras (aproximadamente 20 a 30 segundos). Comece se apresentando com o nome correto e GA Company, diga de forma concreta por que entrou em contato com esse negócio e faça uma pergunta leve que convide à conversa. Use frases de conversa, com pontuação natural para respirar; não use listas, siglas, emoji, frases telegráficas nem repita o nome da empresa. Não invente resultados, números ou fatos sobre o lead. Depois, escreva 1 ou 2 mensagens curtas em texto que complementem, sem repetir o áudio. Separe as mensagens com |||.\n`
      : `Quebre em 3 a 4 mensagens curtas de 1-2 linhas cada, separadas por |||.\n`) +
    `FOCO OBRIGATÓRIO (escolha 1 ou 2 ângulos que façam sentido pro nicho — NUNCA use "tráfego pago", "anúncios" ou "ads" como gancho principal):\n` +
    `  • aumentar faturamento / vender mais\n` +
    `  • estruturar e escalar a empresa\n` +
    `  • fortalecer a marca no digital / presença online\n` +
    `  • tirar a dor do atendimento com automação (robôzinho / IA respondendo cliente 24/7)\n` +
    `Fale como consultor de crescimento, não como vendedor de anúncio. Seja direto, humano, sem parecer script. Termine com CTA para call de 15 min.\n` +
    `Retorne APENAS as mensagens separadas por |||. Sem explicação, SEM placeholders entre colchetes/chaves e SEM a palavra "tráfego".`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        messages: [{ role: "user", content: prompt }],
// temperature omitida: gpt-6-astra aceita apenas o valor padrão
        max_tokens: audioIntro ? 450 : 350,
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
  if (audioIntro) return [
    `Oi, ${nome}! Tudo bem? ${eu}. Estou falando com você porque trabalho com negócios do segmento de ${nicho} e queria entender como vocês estão atraindo clientes hoje. A gente ajuda a organizar a presença digital e o atendimento para não deixar oportunidades passarem. Como isso funciona aí no dia a dia?`,
    `Se fizer sentido, podemos conversar por 15 minutos e ver juntos se existe alguma oportunidade para vocês.`,
  ].join("|||");
  return [
    `Oi ${nome}! Tudo bem?`,
    `${eu} — a gente ajuda ${nicho} a vender mais, estruturar o digital e escalar sem depender só do boca a boca.`,
    `Também tiramos a dor do atendimento com um robôzinho que responde cliente na hora, 24/7.`,
    `Topa uma call rápida de 15 min pra eu te mostrar como aplicaria isso no seu negócio?`,
  ].join("|||");
}

async function aiFollowup(nome: string, nicho: string, motivo: string, isFinal: boolean, nomeAtendente: string | null): Promise<string> {
  const foco = `Foque em aumentar faturamento, escalar/estruturar a empresa, fortalecer marca no digital ou tirar a dor do atendimento com automação. NÃO fale de "tráfego pago" nem "anúncios" como gancho.`;
  const prompt = isFinal
    ? `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\nEscreva um follow-up FINAL e gentil de WhatsApp para ${nome} (${nicho}) que não respondeu. Tom leve, sem cobrança, encerrando o contato mas deixando porta aberta. ${foco} Contexto interno (não repita literal): ${motivo}. Quebre em 2 mensagens curtas com |||. Retorne só as mensagens, sem placeholders e sem a palavra "tráfego".`
    : `Você é um SDR da GA Company. ${buildIdentidade(nomeAtendente)}\nEscreva um follow-up curto e simpático de WhatsApp para ${nome} (${nicho}) que não respondeu. ${foco} Contexto interno (não repita literal): ${motivo}. Reforce brevemente o valor (faturamento / escala / marca / atendimento automatizado) e proponha de novo a call de 15 min. Quebre em 2 mensagens curtas com |||. Retorne só as mensagens, sem placeholders e sem a palavra "tráfego".`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        messages: [{ role: "user", content: prompt }],
// temperature omitida: gpt-6-astra aceita apenas o valor padrão
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
      const sourceAt = lead.primeira_mensagem_em ?? lead.created_at;
      if (!await canSendContactFollowup(admin, campaign.portfolio_id, lead.telefone, sourceAt)) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, false, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text, lead.portfolio_id ?? campaign?.portfolio_id ?? null, sourceAt);
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
      const sourceAt = lead.primeira_mensagem_em ?? lead.created_at;
      if (!await canSendContactFollowup(admin, campaign.portfolio_id, lead.telefone, sourceAt)) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, false, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text, lead.portfolio_id ?? campaign?.portfolio_id ?? null, sourceAt);
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
      const sourceAt = lead.primeira_mensagem_em ?? lead.created_at;
      if (!await canSendContactFollowup(admin, campaign.portfolio_id, lead.telefone, sourceAt)) continue;
      const text = await aiFollowup(lead.nome_resolvido ?? "você", lead.nicho, lead.motivo_contato, true, nomeAtendente);
      const { sent, failed } = await sendInBubbles(instance, lead.telefone, text, lead.portfolio_id ?? campaign?.portfolio_id ?? null, sourceAt);
      await logAssistant(lead, instance, sent, failed);
      if (!sent.length) continue;
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
  // Espaçamento uniforme: distribui rate_per_hour ao longo da hora inteira.
  // Ex.: 4/h → 1 abertura a cada 15 min; 20/h → 1 a cada 3 min.
  // Isso evita rajada (mandar tudo no início) e reduz risco de ban.
  const intervalMs = Math.floor(3_600_000 / Math.max(1, campaign.rate_per_hour));

  // Última abertura dessa campanha (pega o maior primeira_mensagem_em)
  const { data: ultimaAbertura } = await admin
    .from("sdr_leads")
    .select("primeira_mensagem_em")
    .eq("campaign_id", campaign.id)
    .not("primeira_mensagem_em", "is", null)
    .order("primeira_mensagem_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastMs = ultimaAbertura?.primeira_mensagem_em
    ? new Date(ultimaAbertura.primeira_mensagem_em).getTime()
    : 0;
  const elapsed = now.getTime() - lastMs;
  const podeDisparar = lastMs === 0 || elapsed >= intervalMs;

  // 0) Devolve para 'pendente' qualquer reserva presa (>10min em 'enviando')
  const stuckCutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
  await admin
    .from("sdr_leads")
    .update({ status: "pendente" })
    .eq("campaign_id", campaign.id)
    .eq("status", "enviando")
    .lte("ultima_mensagem_em", stuckCutoff);

  // 1) Seleciona apenas 1 candidato por tick (respeitando o intervalo acima).
  const { data: candidatos } = podeDisparar
    ? await admin
        .from("sdr_leads")
        .select("id")
        .eq("campaign_id", campaign.id)
        .eq("status", "pendente")
        .or(`cooldown_ate.is.null,cooldown_ate.lte.${nowIso}`)
        .order("created_at", { ascending: true })
        .limit(1)
    : { data: [] as any[] };




  let dispatched = 0;
  let invalidos = 0;

  if (candidatos && candidatos.length > 0) {
    const candidateIds = candidatos.map((c: any) => c.id);
    const { data: reservados } = await admin
      .from("sdr_leads")
      .update({ status: "enviando", ultima_mensagem_em: nowIso })
      .in("id", candidateIds)
      .eq("status", "pendente")
      .select("*");

    for (const lead of reservados ?? []) {
      if (!await canSendContactProspecting(admin, campaign.portfolio_id, lead.telefone)) {
        await admin.from("sdr_leads").update({ status: "pendente" }).eq("id", lead.id);
        continue;
      }
      // Dedupe por telefone: se já existe QUALQUER outro lead com esse número
      // no mesmo portfólio que já foi contatado (enviado/enviando/respondeu/sem_resposta),
      // marca este como duplicado e pula. Isso evita 4-8 aberturas pro mesmo contato
      // quando a planilha tem números repetidos ou campanhas se sobrepõem.
      const telefoneLimpo = String(lead.telefone).replace(/\D/g, "");
      const { data: jaContatado } = await admin
        .from("sdr_leads")
        .select("id")
        .eq("portfolio_id", lead.portfolio_id)
        .eq("telefone", telefoneLimpo)
        .neq("id", lead.id)
        .in("status", ["enviado", "enviando", "respondeu", "sem_resposta"])
        .limit(1);
      if (jaContatado && jaContatado.length > 0) {
        await admin.from("sdr_leads").update({
          status: "invalido",
          ultima_mensagem_em: nowIso,
        }).eq("id", lead.id);
        console.log("lead duplicado (telefone já contatado), pulando", lead.id, telefoneLimpo);
        continue;
      }

      const nameResolved = await resolveName(instance, lead);
      const text = await aiOpening(nameResolved, lead.nicho, lead.motivo_contato, nomeAtendente, campaign.audio_enabled === true && campaign.audio_on_intro === true);
      await sleep(rand(8000, 16000));
      const { sent, failed, invalidNumber, audioSent } = await sendOpeningWithAudio(instance, lead.telefone, text, campaign, lead.portfolio_id ?? campaign?.portfolio_id ?? null);
      const loggedSent = sent.map((message) => audioSent.includes(message) ? `[ÁUDIO] ${message}` : message);
      await logAssistant({ ...lead, nome_resolvido: nameResolved }, instance, loggedSent, failed);
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
      } else if (invalidNumber) {
        // Número não tem WhatsApp — marca como inválido pra não travar a fila
        await admin.from("sdr_leads").update({
          status: "invalido",
          ultima_mensagem_em: nowIso,
        }).eq("id", lead.id);
        invalidos++;
        console.error("lead sem WhatsApp, marcado invalido", lead.id, lead.telefone);
      } else {
        // Falha transitória (instância caiu, rate limit, etc) → volta pra pendente
        // com cooldown de 5min pra tentar depois
        await admin.from("sdr_leads").update({
          status: "pendente",
          cooldown_ate: new Date(now.getTime() + 5 * 60_000).toISOString(),
        }).eq("id", lead.id);
        console.error("falha transitória ao enviar abertura", lead.id);
      }
    }
  }

  return { dispatched, invalidos, fu1: fu1Count, fu2: fu2Count, fu3: fu3Count, followupEnabled };
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
