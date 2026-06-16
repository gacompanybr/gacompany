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

async function evoSend(instance: string, phone: string, text: string) {
  const url = `${EVO_URL}/message/sendText/${instance}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text, delay: 1200, linkPreview: false }),
  });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t.slice(0, 300) };
}

async function processCampanha(campanha: any, totalSleptMs: { v: number }) {
  if (!campanha.instancia_id) {
    console.log("campanha sem instancia, pulando", campanha.id);
    return { sent: 0, errors: 0, reason: "sem_instancia" };
  }
  const mensagens: string[] = Array.isArray(campanha.mensagens) ? campanha.mensagens : [];
  if (!mensagens.length) return { sent: 0, errors: 0, reason: "sem_mensagens" };

  const { data: pendentes } = await admin
    .from("disparo_contatos")
    .select("*")
    .eq("campanha_id", campanha.id)
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!pendentes || pendentes.length === 0) {
    // marcar como concluida
    await admin.from("disparo_campanhas").update({ status: "concluida" }).eq("id", campanha.id);
    return { sent: 0, errors: 0, reason: "vazio_concluida" };
  }

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
  await admin.from("disparo_campanhas").update({ enviados: count ?? 0 }).eq("id", campanha.id);

  return { sent, errors };
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
