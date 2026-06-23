// Worker que processa as campanhas de disparo em execução.
// A cada invocação processa um lote pequeno com delays aleatórios entre envios
// para evitar ban. Executado por cron a cada minuto + chamado manualmente ao Play.
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

const BATCH_SIZE = 5; // mensagens por invocação por campanha
const HARD_MAX_TOTAL_SLEEP_MS = 120_000; // teto de 2min de sleep por execução

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderMessage(template: string, ctx: { nome?: string; telefone: string; variaveis?: Record<string, any> }) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === "nome") return ctx.nome || "tudo bem";
    if (key === "telefone") return ctx.telefone;
    const v = ctx.variaveis?.[key];
    return v != null ? String(v) : "";
  });
}

function normalizePhone(raw: string): string {
  let p = String(raw ?? "").replace(/\D/g, "");
  // Adiciona DDI 55 (Brasil) automaticamente quando faltando.
  // Números brasileiros: 10 dígitos (fixo: DDD+8) ou 11 dígitos (celular: DDD+9).
  if ((p.length === 10 || p.length === 11) && !p.startsWith("55")) {
    p = "55" + p;
  }
  return p;
}

async function evoSendOnce(instance: string, phone: string, text: string) {
  const url = `${EVO_URL}/message/sendText/${instance}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text, delay: 1200, linkPreview: false }),
  });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t.slice(0, 300) };
}

async function evoSend(instance: string, rawPhone: string, text: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, status: 400, body: "telefone inválido" };
  return await evoSendOnce(instance, phone, text);
}

async function processCampanha(campanha: any, totalSleptMs: { v: number }) {
  if (!campanha.instancia_id) {
    console.log("campanha sem instancia, pulando", campanha.id);
    return { sent: 0, errors: 0, reason: "sem_instancia" };
  }
  const mensagens: string[] = Array.isArray(campanha.mensagens) ? campanha.mensagens : [];
  if (!mensagens.length) return { sent: 0, errors: 0, reason: "sem_mensagens" };

  // Respeita pausa de lote
  if (campanha.pausa_ate) {
    const until = new Date(campanha.pausa_ate).getTime();
    if (until > Date.now()) {
      return { sent: 0, errors: 0, reason: "em_pausa_de_lote", pausa_ate: campanha.pausa_ate };
    }
  }

  const loteTamanho = Math.max(1, Number(campanha.lote_tamanho ?? 10));
  const pausaLoteMin = Math.max(0, Number(campanha.pausa_lote_min ?? 15));

  const { data: pendentes } = await admin
    .from("disparo_contatos")
    .select("*")
    .eq("campanha_id", campanha.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(loteTamanho);



  if (!pendentes || pendentes.length === 0) {
    // marcar como concluida
    await admin.from("disparo_campanhas").update({ status: "concluida" }).eq("id", campanha.id);
    return { sent: 0, errors: 0, reason: "vazio_concluida" };
  }

  // Telefones já enviados nessa campanha (normalizados), para evitar duplicata
  const { data: jaEnviados } = await admin
    .from("disparo_contatos")
    .select("telefone")
    .eq("campanha_id", campanha.id)
    .eq("status", "enviado");
  const sentSet = new Set<string>(
    (jaEnviados ?? []).map((r: any) => normalizePhone(r.telefone))
  );

  let sent = 0;
  let errors = 0;

  for (const contato of pendentes) {
    // Recheck status (pode ter sido pausada)
    const { data: refresh } = await admin
      .from("disparo_campanhas").select("status").eq("id", campanha.id).maybeSingle();
    if (!refresh || refresh.status !== "executando") {
      console.log("campanha não mais executando, parando", campanha.id);
      break;
    }

    const phoneNorm = normalizePhone(contato.telefone);
    if (sentSet.has(phoneNorm)) {
      // já foi disparado pra esse número nessa campanha — marca como duplicado e pula
      await admin.from("disparo_contatos").update({
        status: "enviado",
        enviado_em: new Date().toISOString(),
        erro: "duplicado (mesmo número já enviado)",
      }).eq("id", contato.id);
      continue;
    }
    sentSet.add(phoneNorm);

    const template = pickRandom(mensagens);
    const text = renderMessage(template, {
      nome: contato.nome,
      telefone: contato.telefone,
      variaveis: contato.variaveis ?? {},
    });

    const result = await evoSend(campanha.instancia_id, contato.telefone, text);

    if (result.ok) {
      await admin.from("disparo_contatos").update({
        status: "enviado",
        enviado_em: new Date().toISOString(),
        erro: null,
      }).eq("id", contato.id);
      sent++;
    } else {
      await admin.from("disparo_contatos").update({
        status: "erro",
        erro: `${result.status}: ${result.body}`,
      }).eq("id", contato.id);
      errors++;
    }

    // Delay aleatório antes do próximo envio
    const dMin = Math.max(1, Number(campanha.delay_min_seg ?? 8));
    const dMax = Math.max(dMin, Number(campanha.delay_max_seg ?? 20));
    const sleepMs = (dMin + Math.random() * (dMax - dMin)) * 1000;
    totalSleptMs.v += sleepMs;
    if (totalSleptMs.v > HARD_MAX_TOTAL_SLEEP_MS) {
      console.log("teto de sleep atingido, parando lote");
      break;
    }
    await new Promise((r) => setTimeout(r, sleepMs));
  }

  // Atualiza contador enviados
  const { count } = await admin
    .from("disparo_contatos")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanha.id)
    .eq("status", "enviado");

  // Verifica se ainda há pendentes; se sim, agenda pausa de lote
  const { count: pendCount } = await admin
    .from("disparo_contatos")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanha.id)
    .eq("status", "pendente");

  const update: Record<string, unknown> = { enviados: count ?? 0 };
  if ((pendCount ?? 0) === 0) {
    update.status = "concluida";
    update.pausa_ate = null;
  } else if ((sent + errors) > 0 && pausaLoteMin > 0) {
    update.pausa_ate = new Date(Date.now() + pausaLoteMin * 60_000).toISOString();
  }
  await admin.from("disparo_campanhas").update(update).eq("id", campanha.id);

  return { sent, errors, proxima_pausa_ate: update.pausa_ate ?? null };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let specificCampanhaId: string | null = url.searchParams.get("campanhaId");
    if (!specificCampanhaId && req.method === "POST") {
      try {
        const body = await req.json();
        specificCampanhaId = body?.campanhaId ?? null;
      } catch { /* ignore */ }
    }

    let q = admin.from("disparo_campanhas").select("*").eq("status", "executando");
    if (specificCampanhaId) q = q.eq("id", specificCampanhaId);
    const { data: campanhas, error } = await q;
    if (error) return json({ error: error.message }, 500);

    if (!campanhas || campanhas.length === 0) {
      return json({ ok: true, processed: 0, reason: "nenhuma_em_execucao" });
    }

    const totalSlept = { v: 0 };
    const results: any[] = [];
    for (const c of campanhas) {
      try {
        const r = await processCampanha(c, totalSlept);
        results.push({ id: c.id, nome: c.nome, ...r });
      } catch (e) {
        console.error("erro processando", c.id, e);
        results.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
      }
      if (totalSlept.v > HARD_MAX_TOTAL_SLEEP_MS) break;
    }
    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error("disparo-worker error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
