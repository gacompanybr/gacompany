// Edge Function: sync-meta-ads
// Sincroniza campanhas + insights diários da Meta Marketing API para o banco.
// Suporta:
//   - sync de UMA integração: body { integration_id }
//   - sync de TODAS as integrações ativas: body { all: true } ou body vazio (usado pelo cron)
//   - backfill: body { date_from, date_to }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const META_API_VERSION = "v21.0";

interface SyncRequest {
  integration_id?: string;
  all?: boolean;
  date_from?: string;
  date_to?: string;
}

interface MetaInsightAction { action_type: string; value: string }
interface MetaInsight {
  date_start: string; date_stop: string;
  spend?: string; impressions?: string; reach?: string;
  clicks?: string; ctr?: string; cpc?: string; cpm?: string;
  frequency?: string; unique_clicks?: string;
  purchase_roas?: MetaInsightAction[]; website_purchase_roas?: MetaInsightAction[];
  actions?: MetaInsightAction[]; cost_per_action_type?: MetaInsightAction[];
  campaign_id?: string;
}
interface MetaCampaign {
  id: string; name: string; status?: string; objective?: string;
  start_time?: string; stop_time?: string;
  daily_budget?: string; lifetime_budget?: string;
}

const RESULT_PRIORITY: Array<{ key: string; label: string }> = [
  { key: "onsite_conversion.messaging_conversation_started_7d", label: "Conversas iniciadas" },
  { key: "onsite_conversion.lead_grouped", label: "Leads" },
  { key: "lead", label: "Leads" },
  { key: "onsite_conversion.purchase", label: "Compras" },
  { key: "purchase", label: "Compras" },
  { key: "complete_registration", label: "Cadastros" },
  { key: "onsite_conversion.messaging_first_reply", label: "Mensagens" },
  { key: "link_click", label: "Cliques no link" },
];

function pickResult(insight: MetaInsight) {
  const actions = insight.actions ?? [];
  const cpa = insight.cost_per_action_type ?? [];
  for (const { key, label } of RESULT_PRIORITY) {
    const a = actions.find((x) => x.action_type === key);
    if (a) {
      const value = Number(a.value) || 0;
      const cprEntry = cpa.find((x) => x.action_type === key);
      return { value, type: label, cpr: cprEntry ? Number(cprEntry.value) || 0 : 0 };
    }
  }
  const clk = actions.find((x) => x.action_type === "link_click");
  if (clk) {
    const cprEntry = cpa.find((x) => x.action_type === "link_click");
    return { value: Number(clk.value) || 0, type: "Cliques no link", cpr: cprEntry ? Number(cprEntry.value) || 0 : 0 };
  }
  return { value: 0, type: "Sem resultado", cpr: 0 };
}

function defaultRange(days = 30) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { date_from: from.toISOString().slice(0, 10), date_to: today.toISOString().slice(0, 10) };
}

class MetaError extends Error {
  code?: number; subcode?: number; httpStatus?: number;
  constructor(msg: string, opts: { code?: number; subcode?: number; httpStatus?: number } = {}) {
    super(msg); this.code = opts.code; this.subcode = opts.subcode; this.httpStatus = opts.httpStatus;
  }
}

async function metaFetch(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new MetaError(err.message ?? `HTTP ${res.status}`, {
      code: err.code, subcode: err.error_subcode, httpStatus: res.status,
    });
  }
  return json;
}

function classifyMetaError(err: unknown): { status: string; reason: string } {
  if (err instanceof MetaError) {
    if (err.code === 190) return { status: "token_expired", reason: `Token inválido/expirado (190): ${err.message}` };
    if (err.code === 200 || err.code === 10 || err.code === 803)
      return { status: "permission_error", reason: `Permissão insuficiente (${err.code}): ${err.message}` };
    if (err.code === 17 || err.code === 4 || err.code === 32)
      return { status: "rate_limited", reason: `Rate limit (${err.code}): ${err.message}` };
    return { status: "error", reason: `Meta API ${err.httpStatus ?? ""}${err.code ? ` (code ${err.code})` : ""}: ${err.message}` };
  }
  return { status: "error", reason: err instanceof Error ? err.message : String(err) };
}

async function validateToken(token: string): Promise<{ ok: true } | { ok: false; reason: string; status: string }> {
  try {
    await metaFetch(`https://graph.facebook.com/${META_API_VERSION}/me?fields=id&access_token=${encodeURIComponent(token)}`);
    return { ok: true };
  } catch (err) {
    const c = classifyMetaError(err);
    return { ok: false, reason: c.reason, status: c.status };
  }
}

interface SyncResult {
  integration_id: string;
  nome: string;
  ad_account_id: string;
  status: string;
  token_status: string;
  campaigns_found: number;
  metric_rows_saved: number;
  ultima_sincronizacao: string | null;
  meta_error?: string;
}

async function syncOne(admin: any, integ: any, range: { date_from: string; date_to: string }): Promise<SyncResult> {
  const accountId = integ.ad_account_id.startsWith("act_") ? integ.ad_account_id : `act_${integ.ad_account_id}`;
  const accessToken = integ.access_token;

  const result: SyncResult = {
    integration_id: integ.id,
    nome: integ.nome_conta_anuncio,
    ad_account_id: accountId,
    status: "active",
    token_status: "unknown",
    campaigns_found: 0,
    metric_rows_saved: 0,
    ultima_sincronizacao: null,
  };

  // 1) Validar token
  const tok = await validateToken(accessToken);
  if (!tok.ok) {
    result.token_status = tok.status;
    result.status = tok.status;
    result.meta_error = tok.reason;
    await admin.from("meta_integracoes").update({ status: tok.status }).eq("id", integ.id);
    await admin.from("meta_logs_integracao").insert({
      integration_id: integ.id, status: "error",
      mensagem: `[${integ.nome_conta_anuncio}] Falha de token`, detalhe_erro: tok.reason,
      date_from: range.date_from, date_to: range.date_to,
    });
    return result;
  }
  result.token_status = "valid";

  try {
    // 2) Campanhas (paginado)
    let url: string | null =
      `https://graph.facebook.com/${META_API_VERSION}/${accountId}/campaigns` +
      `?fields=id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget` +
      `&limit=100&access_token=${encodeURIComponent(accessToken)}`;
    const campaigns: MetaCampaign[] = [];
    while (url) {
      const page: any = await metaFetch(url);
      for (const c of (page.data ?? []) as MetaCampaign[]) campaigns.push(c);
      url = page.paging?.next ?? null;
    }
    result.campaigns_found = campaigns.length;

    for (const c of campaigns) {
      const budget = Number(c.daily_budget ?? c.lifetime_budget ?? 0) / 100;
      await admin.from("meta_campanhas").upsert({
        integration_id: integ.id,
        campaign_id: c.id,
        campaign_name: c.name,
        status: c.status ?? null,
        objective: c.objective ?? null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        budget,
      }, { onConflict: "integration_id,campaign_id" });
    }

    // 3) Insights diários por conta (paginado)
    const fields = [
      "campaign_id", "campaign_name", "spend", "impressions", "reach",
      "clicks", "ctr", "cpc", "cpm", "frequency", "unique_clicks",
      "actions", "cost_per_action_type", "purchase_roas", "website_purchase_roas",
    ].join(",");
    const timeRange = encodeURIComponent(JSON.stringify({ since: range.date_from, until: range.date_to }));
    let insightsUrl: string | null =
      `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights` +
      `?level=campaign&time_increment=1&time_range=${timeRange}` +
      `&fields=${fields}&limit=500&access_token=${encodeURIComponent(accessToken)}`;

    while (insightsUrl) {
      const page: any = await metaFetch(insightsUrl);
      const rows: MetaInsight[] = page.data ?? [];
      for (const r of rows) {
        const picked = pickResult(r);
        await admin.from("meta_metricas_campanhas").upsert({
          integration_id: integ.id,
          campaign_id: r.campaign_id,
          date: r.date_start,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          reach: Number(r.reach ?? 0),
          clicks: Number(r.clicks ?? 0),
          ctr: r.ctr ? Number(r.ctr) : null,
          cpc: r.cpc ? Number(r.cpc) : null,
          cpm: r.cpm ? Number(r.cpm) : null,
          results: picked.value,
          result_type: picked.type,
          cost_per_result: picked.cpr,
          raw_actions_json: {
            actions: r.actions ?? null,
            cost_per_action_type: r.cost_per_action_type ?? null,
            frequency: r.frequency ?? null,
            unique_clicks: r.unique_clicks ?? null,
            purchase_roas: r.purchase_roas ?? null,
            website_purchase_roas: r.website_purchase_roas ?? null,
          },
        }, { onConflict: "integration_id,campaign_id,date" });
        result.metric_rows_saved++;
      }
      insightsUrl = page.paging?.next ?? null;
    }

    const now = new Date().toISOString();
    await admin.from("meta_integracoes").update({ ultima_atualizacao: now, status: "active" }).eq("id", integ.id);
    result.ultima_sincronizacao = now;

    await admin.from("meta_logs_integracao").insert({
      integration_id: integ.id, status: "success",
      mensagem: `[${integ.nome_conta_anuncio}] ${campaigns.length} campanhas, ${result.metric_rows_saved} linhas de métricas.`,
      rows_synced: result.metric_rows_saved,
      date_from: range.date_from, date_to: range.date_to,
    });
    return result;
  } catch (err) {
    const c = classifyMetaError(err);
    result.status = c.status;
    result.meta_error = c.reason;
    await admin.from("meta_integracoes").update({ status: c.status }).eq("id", integ.id);
    await admin.from("meta_logs_integracao").insert({
      integration_id: integ.id, status: "error",
      mensagem: `[${integ.nome_conta_anuncio}] Falha ao sincronizar`,
      detalhe_erro: c.reason, rows_synced: result.metric_rows_saved,
      date_from: range.date_from, date_to: range.date_to,
    });
    return result;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: SyncRequest = {};
  try { body = await req.json(); } catch { body = {}; }

  const range = body.date_from && body.date_to
    ? { date_from: body.date_from, date_to: body.date_to }
    : defaultRange(30);

  // Determinar lista de integrações
  let integrations: any[] = [];
  if (body.integration_id) {
    const { data, error } = await admin.from("meta_integracoes").select("*").eq("id", body.integration_id).limit(1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!data?.length) return new Response(JSON.stringify({ error: "Integration not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    integrations = data;
  } else {
    // Modo "all" (cron ou body vazio) — pega todas as não-deletadas, pula token_expired
    const { data, error } = await admin
      .from("meta_integracoes").select("*")
      .in("status", ["active", "error", "rate_limited", "permission_error"]);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    integrations = data ?? [];
  }

  const results: SyncResult[] = [];
  for (const integ of integrations) {
    try {
      const r = await syncOne(admin, integ, range);
      results.push(r);
    } catch (err) {
      // Salvaguarda: nunca derrubar o loop por causa de uma integração.
      results.push({
        integration_id: integ.id, nome: integ.nome_conta_anuncio,
        ad_account_id: integ.ad_account_id, status: "error", token_status: "unknown",
        campaigns_found: 0, metric_rows_saved: 0, ultima_sincronizacao: null,
        meta_error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    total_integrations: integrations.length,
    successful: results.filter((r) => r.status === "active").length,
    failed: results.filter((r) => r.status !== "active").length,
    date_from: range.date_from, date_to: range.date_to,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
