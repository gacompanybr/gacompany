// Edge Function: sync-meta-ads
// Sincroniza campanhas + insights diários da Meta Marketing API para o banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const META_API_VERSION = "v21.0";

interface SyncRequest {
  integration_id: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;
}

interface MetaInsightAction {
  action_type: string;
  value: string;
}

interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaInsightAction[];
  cost_per_action_type?: MetaInsightAction[];
}

interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
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

function pickResult(insight: MetaInsight): { value: number; type: string; cpr: number } {
  const actions = insight.actions ?? [];
  const cpa = insight.cost_per_action_type ?? [];
  for (const { key, label } of RESULT_PRIORITY) {
    const a = actions.find((x) => x.action_type === key);
    if (a) {
      const value = Number(a.value) || 0;
      const cprEntry = cpa.find((x) => x.action_type === key);
      const cpr = cprEntry ? Number(cprEntry.value) || 0 : 0;
      return { value, type: label, cpr };
    }
  }
  // fallback: cliques no link
  const clk = actions.find((x) => x.action_type === "link_click");
  if (clk) {
    const value = Number(clk.value) || 0;
    const cprEntry = cpa.find((x) => x.action_type === "link_click");
    return { value, type: "Cliques no link", cpr: cprEntry ? Number(cprEntry.value) || 0 : 0 };
  }
  return { value: 0, type: "Sem resultado", cpr: 0 };
}

function defaultRange(days = 30) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: today.toISOString().slice(0, 10),
  };
}

async function metaFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const code = json?.error?.code;
    throw new Error(`Meta API ${res.status}${code ? ` (code ${code})` : ""}: ${msg}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: SyncRequest;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.integration_id) {
    return new Response(JSON.stringify({ error: "integration_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const range = body.date_from && body.date_to
    ? { date_from: body.date_from, date_to: body.date_to }
    : defaultRange(30);

  // Carrega integração
  const { data: integ, error: integErr } = await admin
    .from("meta_integracoes")
    .select("*")
    .eq("id", body.integration_id)
    .single();

  if (integErr || !integ) {
    return new Response(JSON.stringify({ error: "Integration not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accountId = integ.ad_account_id.startsWith("act_")
    ? integ.ad_account_id
    : `act_${integ.ad_account_id}`;
  const accessToken = integ.access_token;

  let rowsSynced = 0;
  try {
    // 1) Campanhas
    const campaignsUrl =
      `https://graph.facebook.com/${META_API_VERSION}/${accountId}/campaigns` +
      `?fields=id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget` +
      `&limit=200&access_token=${encodeURIComponent(accessToken)}`;
    const campaignsRes = await metaFetch(campaignsUrl);
    const campaigns: MetaCampaign[] = campaignsRes.data ?? [];

    // upsert campanhas
    for (const c of campaigns) {
      const budget = Number(c.daily_budget ?? c.lifetime_budget ?? 0) / 100; // Meta retorna em centavos
      await admin.from("meta_campanhas").upsert(
        {
          integration_id: integ.id,
          campaign_id: c.id,
          campaign_name: c.name,
          status: c.status ?? null,
          objective: c.objective ?? null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          budget,
        },
        { onConflict: "integration_id,campaign_id" },
      );
    }

    // 2) Insights diários por conta (filtrados por data)
    const fields = [
      "campaign_id", "campaign_name", "spend", "impressions", "reach",
      "clicks", "ctr", "cpc", "cpm", "actions", "cost_per_action_type",
    ].join(",");
    const timeRange = encodeURIComponent(JSON.stringify({ since: range.date_from, until: range.date_to }));
    const insightsUrl =
      `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights` +
      `?level=campaign&time_increment=1&time_range=${timeRange}` +
      `&fields=${fields}&limit=500&access_token=${encodeURIComponent(accessToken)}`;

    let nextUrl: string | null = insightsUrl;
    while (nextUrl) {
      const page = await metaFetch(nextUrl);
      const rows: any[] = page.data ?? [];
      for (const r of rows) {
        const result = pickResult(r);
        await admin.from("meta_metricas_campanhas").upsert(
          {
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
            results: result.value,
            result_type: result.type,
            cost_per_result: result.cpr,
            raw_actions_json: r.actions ?? null,
          },
          { onConflict: "integration_id,campaign_id,date" },
        );
        rowsSynced++;
      }
      nextUrl = page.paging?.next ?? null;
    }

    await admin.from("meta_integracoes").update({
      ultima_atualizacao: new Date().toISOString(),
      status: "active",
    }).eq("id", integ.id);

    await admin.from("meta_logs_integracao").insert({
      integration_id: integ.id,
      status: "success",
      mensagem: `Sincronizadas ${campaigns.length} campanhas, ${rowsSynced} linhas de métricas.`,
      rows_synced: rowsSynced,
      date_from: range.date_from,
      date_to: range.date_to,
    });

    return new Response(JSON.stringify({
      ok: true,
      campaigns: campaigns.length,
      metric_rows: rowsSynced,
      date_from: range.date_from,
      date_to: range.date_to,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("meta_logs_integracao").insert({
      integration_id: integ.id,
      status: "error",
      mensagem: "Falha ao sincronizar dados da Meta Ads.",
      detalhe_erro: message,
      date_from: range.date_from,
      date_to: range.date_to,
    });
    await admin.from("meta_integracoes").update({ status: "error" }).eq("id", integ.id);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
