// Robô de cobrança: envia a mensagem de cobrança de cada cliente.
// Modo manual  -> body { configId, origem: "manual" } (valida acesso do usuário).
// Modo automático (cron) -> body {} : varre configs ativas cujo dia_vencimento == hoje (America/Sao_Paulo).
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));
}

// Data de hoje em America/Sao_Paulo (YYYY-MM-DD)
function todaySP(): { iso: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return { iso: parts, day: Number(parts.slice(-2)) };
}

async function sendOne(cfg: any, origem: "manual" | "automatico") {
  const valor = Number(cfg.valor ?? 0);
  const text = String(cfg.mensagem_template ?? "").replaceAll("/valor/", formatBRL(valor));
  const number = String(cfg.contato_telefone ?? "").replace(/\D/g, "");

  let status = "enviado";
  let erro: string | null = null;

  if (!number || !cfg.sender_instance || !text) {
    status = "erro";
    erro = "configuração incompleta (número, instância ou mensagem)";
  } else {
    try {
      const r = await fetch(`${EVO_URL}/message/sendText/${cfg.sender_instance}`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number, text, delay: 1200, linkPreview: false }),
      });
      if (!r.ok) {
        status = "erro";
        erro = `evolution_${r.status}: ${(await r.text()).slice(0, 300)}`;
      }
    } catch (e) {
      status = "erro";
      erro = (e as Error).message;
    }
  }

  await admin.from("cobranca_envios").insert({
    config_id: cfg.id,
    portfolio_id: cfg.portfolio_id,
    valor,
    contato_telefone: number,
    mensagem: text,
    origem,
    status,
    erro,
  });

  return { configId: cfg.id, status, erro };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution não configurada" }, 500);

    let body: any = {};
    try { body = await req.json(); } catch { /* cron manda vazio */ }

    // ---- Modo manual ----
    if (body?.configId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Não autenticado" }, 401);
      const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supa.auth.getUser();
      if (!user) return json({ error: "Não autenticado" }, 401);

      const { data: cfg } = await admin
        .from("cobranca_config").select("*").eq("id", body.configId).maybeSingle();
      if (!cfg) return json({ error: "Configuração não encontrada" }, 404);

      const { data: hasAccess } = await admin.rpc("has_portfolio_access", {
        _user_id: user.id, _portfolio_id: cfg.portfolio_id,
      });
      if (!hasAccess) return json({ error: "Sem acesso" }, 403);

      const res = await sendOne(cfg, "manual");
      if (res.status === "erro") return json({ ok: false, ...res }, 200);
      return json({ ok: true, ...res });
    }

    // ---- Modo automático (cron) ----
    const { iso, day } = todaySP();
    const { data: configs, error } = await admin
      .from("cobranca_config")
      .select("*")
      .eq("ativo", true)
      .eq("dia_vencimento", day);
    if (error) throw new Error(error.message);

    const results: unknown[] = [];
    for (const cfg of configs ?? []) {
      if (cfg.last_sent_on === iso) continue; // já enviou hoje

      // reserva ANTES de enviar (antiduplicidade)
      const { data: claimed } = await admin
        .from("cobranca_config")
        .update({ last_sent_on: iso })
        .eq("id", cfg.id)
        .or(`last_sent_on.is.null,last_sent_on.neq.${iso}`)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      results.push(await sendOne(cfg, "automatico"));
    }

    return json({ ok: true, date: iso, day, candidates: configs?.length ?? 0, sent: results.length, results });
  } catch (e) {
    console.error("cobranca-send:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
