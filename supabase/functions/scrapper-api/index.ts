import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SECRET = Deno.env.get("SCRAPPER_API_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const ML_APP_ID = Deno.env.get("MERCADOLIVRE_APP_ID") ?? "";
const ML_SECRET = Deno.env.get("MERCADOLIVRE_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- Cron helpers ---------------------------------------------------------
function parseCronField(expr: string, min: number, max: number): number[] {
  const out = new Set<number>();
  for (const part of expr.split(",")) {
    const [range, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo = min, hi = max;
    if (range !== "*" && range !== "") {
      if (range.includes("-")) {
        const [a, b] = range.split("-").map((x) => parseInt(x, 10));
        lo = a; hi = b;
      } else {
        lo = hi = parseInt(range, 10);
      }
    }
    for (let v = lo; v <= hi; v++) {
      if ((v - lo) % step === 0) out.add(v);
    }
  }
  return [...out].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

function lastCronTick(cron: string, now: Date): Date | null {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const mins = parseCronField(parts[0], 0, 59);
    const hours = parseCronField(parts[1], 0, 23);
    const doms = parseCronField(parts[2], 1, 31);
    const mons = parseCronField(parts[3], 1, 12);
    const dows = parseCronField(parts[4], 0, 6);
    const d = new Date(now.getTime());
    d.setUTCSeconds(0, 0);
    const limit = 60 * 24 * 60;
    for (let i = 0; i < limit; i++) {
      if (
        mins.includes(d.getUTCMinutes()) &&
        hours.includes(d.getUTCHours()) &&
        doms.includes(d.getUTCDate()) &&
        mons.includes(d.getUTCMonth() + 1) &&
        dows.includes(d.getUTCDay())
      ) {
        return d;
      }
      d.setTime(d.getTime() - 60_000);
    }
    return null;
  } catch {
    return null;
  }
}

function jobIsDue(cron: string | null | undefined, ultimaExecucao: string | null | undefined): boolean {
  if (!cron) return true;
  const tick = lastCronTick(cron, new Date());
  if (!tick) return true;
  if (!ultimaExecucao) return true;
  return new Date(ultimaExecucao).getTime() < tick.getTime();
}

// Garante access_token válido para uma integração ML; renova via refresh_token se faltar < 5min.
async function ensureMlToken(integ: any): Promise<any> {
  if (!integ) return null;
  const expMs = integ.expires_at ? new Date(integ.expires_at).getTime() : 0;
  const needsRefresh = !expMs || expMs - Date.now() < 5 * 60_000;
  if (!needsRefresh) return integ;
  if (!integ.refresh_token || !ML_APP_ID || !ML_SECRET) return integ;
  try {
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ML_APP_ID,
        client_secret: ML_SECRET,
        refresh_token: integ.refresh_token,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      await admin
        .from("mercadolivre_integracoes")
        .update({ status: "expired", last_error: `refresh: ${JSON.stringify(data)}` })
        .eq("id", integ.id);
      return integ;
    }
    const newExp = new Date(Date.now() + (data.expires_in ?? 21600) * 1000).toISOString();
    const updated = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? integ.refresh_token,
      expires_at: newExp,
      scope: data.scope ?? integ.scope,
      status: "active",
      last_error: null,
    };
    await admin.from("mercadolivre_integracoes").update(updated).eq("id", integ.id);
    return { ...integ, ...updated };
  } catch (e) {
    return integ;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth via Bearer
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SECRET}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ---------- GET: jobs ativos do scraper ----------
    if (req.method === "GET" && action === "jobs") {
      const plataforma = url.searchParams.get("plataforma");
      let q = admin
        .from("scrapper_jobs")
        .select("id, portfolio_id, nome, plataforma, config, agendamento_cron, ultima_execucao")
        .eq("status", "ativo");
      if (plataforma) q = q.eq("plataforma", plataforma);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);

      // Para jobs do Mercado Livre, anexa access_token fresco da integração vinculada.
      const jobsRaw = data ?? [];
      const mlJobIds = jobsRaw
        .filter((j: any) => /mercado/i.test(j.plataforma ?? ""))
        .map((j: any) => j.id);
      const integByJob = new Map<string, any>();
      if (mlJobIds.length) {
        const { data: integs } = await admin
          .from("mercadolivre_integracoes")
          .select("id, scrapper_job_id, ml_user_id, nickname, access_token, refresh_token, expires_at, scope, status")
          .in("scrapper_job_id", mlJobIds);
        for (const integ of integs ?? []) {
          const fresh = await ensureMlToken(integ);
          if (fresh?.scrapper_job_id) integByJob.set(fresh.scrapper_job_id, fresh);
        }
      }

      const jobs = jobsRaw.map((j: any) => {
        const integ = integByJob.get(j.id);
        return {
          id: j.id,
          portfolio_id: j.portfolio_id,
          nome: j.nome,
          plataforma: j.plataforma,
          shopee_app_id: j.config?.shopee_app_id ?? null,
          shopee_secret: j.config?.shopee_secret ?? null,
          termos: j.config?.termos ?? [],
          categorias: j.config?.categorias ?? [],
          agendamento_cron: j.agendamento_cron,
          ultima_execucao: j.ultima_execucao,
          ml_access_token: integ?.access_token ?? null,
          ml_user_id: integ?.ml_user_id ?? null,
          ml_nickname: integ?.nickname ?? null,
          ml_expires_at: integ?.expires_at ?? null,
          ml_status: integ?.status ?? null,
        };
      });
      return json({ jobs });
    }

    // ---------- GET: força refresh do token ML de UMA integração ----------
    if (req.method === "GET" && action === "ml_token") {
      const jobId = url.searchParams.get("scrapper_job_id");
      const integId = url.searchParams.get("integration_id");
      if (!jobId && !integId) return json({ error: "scrapper_job_id ou integration_id obrigatório" }, 400);
      let q = admin
        .from("mercadolivre_integracoes")
        .select("id, scrapper_job_id, ml_user_id, nickname, access_token, refresh_token, expires_at, scope, status");
      if (integId) q = q.eq("id", integId);
      else q = q.eq("scrapper_job_id", jobId);
      const { data: integ, error } = await q.maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!integ) return json({ error: "integração não encontrada" }, 404);
      const fresh = await ensureMlToken(integ);
      return json({
        access_token: fresh?.access_token ?? null,
        expires_at: fresh?.expires_at ?? null,
        ml_user_id: fresh?.ml_user_id ?? null,
        nickname: fresh?.nickname ?? null,
        status: fresh?.status ?? null,
      });
    }

    // ---------- GET: campanhas do robô prontas pra disparar ----------
    if (req.method === "GET" && action === "campanhas") {
      const nowIso = new Date().toISOString();
      const { data, error } = await admin
        .from("robo_campanhas")
        .select(
          "id, portfolio_id, nome, instancia_id, status, dias_semana, horario_inicio, horario_fim, intervalo_min_min, intervalo_max_min, destinos, mensagens, ultima_execucao, proxima_execucao, total_enviados",
        )
        .eq("status", "ativo")
        .or(`proxima_execucao.is.null,proxima_execucao.lte.${nowIso}`);
      if (error) return json({ error: error.message }, 500);
      return json({ campanhas: data ?? [] });
    }

    // ---------- GET: estado de UM robô (pro workflow n8n decidir disparar) ----------
    if (req.method === "GET" && action === "get_robo") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id obrigatório" }, 400);
      const { data, error } = await admin
        .from("robo_campanhas")
        .select("id, status, ultima_execucao, horarios_por_dia")
        .eq("id", id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "não encontrado" }, 404);
      return json(data);
    }

    // ---------- POST: updates ----------
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { action: bodyAction } = body ?? {};

      // update_job
      if (bodyAction === "update_job") {
        const { id, ultima_qtd, output_url, ultimo_erro, ultima_affiliate_errors } = body;
        if (!id) return json({ error: "id obrigatório" }, 400);

        if (ultimo_erro) {
          const { error } = await admin
            .from("scrapper_jobs")
            .update({ ultimo_erro, ultima_affiliate_errors: ultima_affiliate_errors ?? 0 })
            .eq("id", id);
          if (error) return json({ error: error.message }, 500);
        } else {
          const { error } = await admin
            .from("scrapper_jobs")
            .update({
              ultima_execucao: new Date().toISOString(),
              ultima_qtd: ultima_qtd ?? 0,
              output_url: output_url ?? null,
              ultimo_erro: null,
              ultima_affiliate_errors: ultima_affiliate_errors ?? 0,
            })
            .eq("id", id);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ ok: true });
      }

      // update_campanha
      if (bodyAction === "update_campanha") {
        const { id, total_enviados, ultimo_erro, intervalo_dia } = body;
        if (!id) return json({ error: "id obrigatório" }, 400);

        const { data: camp, error: e1 } = await admin
          .from("robo_campanhas")
          .select("intervalo_min_min, intervalo_max_min, total_enviados")
          .eq("id", id)
          .maybeSingle();
        if (e1 || !camp) return json({ error: e1?.message ?? "campanha não encontrada" }, 404);

        // Quando vier intervalo_dia (do workflow novo com horarios_por_dia), usa ele direto.
        // Senão, cai no min/max legado.
        const min = camp.intervalo_min_min ?? 30;
        const max = camp.intervalo_max_min ?? 90;
        const delta = intervalo_dia
          ? Number(intervalo_dia)
          : Math.floor(Math.random() * (max - min + 1)) + min;

        if (ultimo_erro) {
          const next = new Date(Date.now() + delta * 60_000).toISOString();
          const { error } = await admin
            .from("robo_campanhas")
            .update({ ultimo_erro, proxima_execucao: next })
            .eq("id", id);
          if (error) return json({ error: error.message }, 500);
        } else {
          const next = new Date(Date.now() + delta * 60_000).toISOString();
          const { error } = await admin
            .from("robo_campanhas")
            .update({
              ultima_execucao: new Date().toISOString(),
              proxima_execucao: next,
              total_enviados: (camp.total_enviados ?? 0) + (total_enviados ?? 0),
              ultimo_erro: null,
            })
            .eq("id", id);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ ok: true });
      }

      return json({ error: "action inválida" }, 400);
    }

    return json({ error: "Rota não encontrada" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
