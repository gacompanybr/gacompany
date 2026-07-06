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

function normProductText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractMlProductId(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? "");
    const m =
      s.match(/\b(MLB-?U?\d{6,})\b/i) ||
      s.match(/\/p\/(MLBU?\d{6,})/i) ||
      s.match(/\/up\/(MLBU?\d{6,})/i) ||
      s.match(/(?:item_id[:=]|item_id%3A|wid=)(MLB-?\d{6,})/i);
    if (m?.[1]) return m[1].replace("-", "").toUpperCase();
  }
  return "";
}

const PRODUCT_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "pra", "por", "em", "no", "na", "nos", "nas", "e", "ou", "a", "o", "as", "os",
  "um", "uma", "uns", "umas", "the", "and", "for", "with", "of", "kit", "set", "pcs", "un", "und", "ml", "cm", "mm", "kg", "g", "w", "v", "volts", "cor",
]);

function productTokens(value: unknown): string[] {
  return normProductText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !PRODUCT_STOPWORDS.has(token));
}

function productKey(input: { productname?: unknown; link_compra?: unknown; offerlink?: unknown; imageUrl?: unknown }): string {
  const mlId = extractMlProductId(input.link_compra, input.offerlink, input.imageUrl);
  if (mlId) return `ml:${mlId}`;
  return `name:${normProductText(input.productname).slice(0, 160)}`;
}

function productsAreSimilar(a: unknown, b: unknown): boolean {
  const at = new Set(productTokens(a));
  const bt = new Set(productTokens(b));
  if (at.size === 0 || bt.size === 0) return false;
  let inter = 0;
  for (const token of at) if (bt.has(token)) inter++;
  const union = at.size + bt.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  // Threshold apertado: só bloqueia título praticamente idêntico (re-listagem
  // do mesmo produto). O antigo (inter>=3 OU jac>=0.55) marcava produtos
  // diferentes como "já enviado" e por isso o gate foi desligado no dispatcher.
  return jaccard >= 0.8;
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
  if (!integ.refresh_token) {
    await admin
      .from("mercadolivre_integracoes")
      .update({ status: "expired", last_error: "Sem refresh_token: reconecte a conta ML (offline_access)." })
      .eq("id", integ.id);
    return { ...integ, status: "expired" };
  }
  if (!ML_APP_ID || !ML_SECRET) return integ;
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
      const force = url.searchParams.get("force") === "1";
      let q = admin
        .from("scrapper_jobs")
        .select("id, portfolio_id, nome, plataforma, config, agendamento_cron, ultima_execucao")
        .eq("status", "ativo");
      if (plataforma) q = q.eq("plataforma", plataforma);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);

      // Filtra por cron: só retorna jobs cujo último tick agendado é depois da última execução.
      const jobsRaw = (data ?? []).filter((j: any) =>
        force ? true : jobIsDue(j.agendamento_cron, j.ultima_execucao)
      );

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

      if (bodyAction === "check_sent_product") {
        const roboId = body.robo_id;
        if (!roboId) return json({ error: "robo_id obrigatório" }, 400);

        const { data: robo, error: roboErr } = await admin
          .from("robo_campanhas")
          .select("id, portfolio_id")
          .eq("id", roboId)
          .maybeSingle();
        if (roboErr) return json({ error: roboErr.message }, 500);
        if (!robo) return json({ error: "robô não encontrado" }, 404);

        const incoming = {
          productname: body.productname,
          offerlink: body.offerlink,
          link_compra: body.link_compra,
          imageUrl: body.imageUrl,
        };
        const key = productKey(incoming);
        const lookbackDays = Math.max(1, Math.min(120, Number(body.lookback_days ?? 45)));
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

        const { data: exact, error: exactErr } = await admin
          .from("robo_produtos_enviados")
          .select("id, productname, product_key, sent_at")
          .eq("robo_id", roboId)
          .eq("product_key", key)
          .gte("sent_at", since)
          .limit(1);
        if (exactErr) return json({ error: exactErr.message }, 500);
        if ((exact ?? []).length > 0) return json({ sent: true, reason: "exact", key, match: exact![0] });

        const { data: recent, error: recentErr } = await admin
          .from("robo_produtos_enviados")
          .select("id, productname, product_key, sent_at, offerlink, link_compra, image_url")
          .eq("robo_id", roboId)
          .gte("sent_at", since)
          .order("sent_at", { ascending: false })
          .limit(400);
        if (recentErr) return json({ error: recentErr.message }, 500);
        const match = (recent ?? []).find((r: any) => productsAreSimilar(incoming.productname, r.productname));
        if (match) return json({ sent: true, reason: "similar", key, match });
        return json({ sent: false, key });
      }

      if (bodyAction === "claim_sent_product") {
        const roboId = body.robo_id;
        if (!roboId) return json({ error: "robo_id obrigatório" }, 400);

        const { data: robo, error: roboErr } = await admin
          .from("robo_campanhas")
          .select("id, portfolio_id")
          .eq("id", roboId)
          .maybeSingle();
        if (roboErr) return json({ error: roboErr.message }, 500);
        if (!robo) return json({ error: "robô não encontrado" }, 404);

        const row = {
          productname: body.productname,
          offerlink: body.offerlink,
          link_compra: body.link_compra,
          imageUrl: body.imageUrl,
        };
        const key = productKey(row);
        const lookbackDays = Math.max(1, Math.min(120, Number(body.lookback_days ?? 45)));
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

        const { data: exact, error: exactErr } = await admin
          .from("robo_produtos_enviados")
          .select("id, productname, product_key, sent_at")
          .eq("robo_id", roboId)
          .eq("product_key", key)
          .gte("sent_at", since)
          .limit(1);
        if (exactErr) return json({ error: exactErr.message }, 500);
        if ((exact ?? []).length > 0) return json({ claimed: false, reason: "exact", key, match: exact![0] });

        const { data: recent, error: recentErr } = await admin
          .from("robo_produtos_enviados")
          .select("id, productname, product_key, sent_at, offerlink, link_compra, image_url")
          .eq("robo_id", roboId)
          .gte("sent_at", since)
          .order("sent_at", { ascending: false })
          .limit(400);
        if (recentErr) return json({ error: recentErr.message }, 500);
        const match = (recent ?? []).find((r: any) => productsAreSimilar(row.productname, r.productname));
        if (match) return json({ claimed: false, reason: "similar", key, match });

        const { error } = await admin
          .from("robo_produtos_enviados")
          .insert({
            portfolio_id: robo.portfolio_id,
            robo_id: roboId,
            table_id: body.table_id ?? null,
            row_id: body.row_id == null ? null : String(body.row_id),
            product_key: key,
            productname: body.productname ?? null,
            offerlink: body.offerlink ?? null,
            link_compra: body.link_compra ?? null,
            image_url: body.imageUrl ?? null,
            destino: "__CLAIM__",
            sent_at: new Date().toISOString(),
          });
        if (error) {
          if ((error as any).code === "23505") return json({ claimed: false, reason: "race", key });
          return json({ error: error.message }, 500);
        }
        return json({ claimed: true, key });
      }

      if (bodyAction === "record_sent_product") {
        const roboId = body.robo_id;
        if (!roboId) return json({ error: "robo_id obrigatório" }, 400);

        const { data: robo, error: roboErr } = await admin
          .from("robo_campanhas")
          .select("id, portfolio_id")
          .eq("id", roboId)
          .maybeSingle();
        if (roboErr) return json({ error: roboErr.message }, 500);
        if (!robo) return json({ error: "robô não encontrado" }, 404);

        const row = {
          productname: body.productname,
          offerlink: body.offerlink,
          link_compra: body.link_compra,
          imageUrl: body.imageUrl,
        };
        const key = productKey(row);
        const { error } = await admin
          .from("robo_produtos_enviados")
          .upsert({
            portfolio_id: robo.portfolio_id,
            robo_id: roboId,
            table_id: body.table_id ?? null,
            row_id: body.row_id == null ? null : String(body.row_id),
            product_key: key,
            productname: body.productname ?? null,
            offerlink: body.offerlink ?? null,
            link_compra: body.link_compra ?? null,
            image_url: body.imageUrl ?? null,
            destino: body.destino ?? null,
            sent_at: new Date().toISOString(),
          }, { onConflict: "robo_id,product_key" });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, key });
      }

      return json({ error: "action inválida" }, 400);
    }

    return json({ error: "Rota não encontrada" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
