// Sync Google Ads campaign metrics into the database
// Uses Google Ads API v18 with OAuth refresh token flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GOOGLE_ADS_API_VERSION = "v21";

interface SyncRequest {
  ad_account_id?: string; // sync just one
  days?: number; // lookback window (default 30)
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token refresh failed [${res.status}]: ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function runGAQL(
  customerId: string,
  loginCustomerId: string,
  accessToken: string,
  query: string,
) {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error [${res.status}]: ${text}`);
  }

  // searchStream returns an array of response chunks
  const chunks = await res.json();
  const rows: any[] = [];
  for (const chunk of chunks) {
    if (chunk.results) rows.push(...chunk.results);
  }
  return rows;
}

async function syncAccount(
  supabase: any,
  account: any,
  accessToken: string,
  days: number,
) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = today.toISOString().slice(0, 10);

  const { data: log } = await supabase
    .from("sync_logs")
    .insert({
      ad_account_id: account.id,
      status: "running",
      date_from: fromStr,
      date_to: toStr,
    })
    .select()
    .single();

  try {
    const loginCid = (account.login_customer_id ?? "").replace(/-/g, "");
    const customerId = account.customer_id.replace(/-/g, "");

    // 1) Campaigns metadata (incl. start/end dates and channel type)
    const campaignQuery = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `;
    const campaignRows = await runGAQL(
      customerId,
      loginCid,
      accessToken,
      campaignQuery,
    );

    const campaignMap = new Map<string, string>(); // external_id -> uuid
    for (const r of campaignRows) {
      const c = r.campaign;
      const budget = r.campaignBudget?.amountMicros
        ? Number(r.campaignBudget.amountMicros) / 1_000_000
        : null;
      const { data: upserted } = await supabase
        .from("campaigns")
        .upsert(
          {
            ad_account_id: account.id,
            external_id: String(c.id),
            name: c.name,
            status: c.status,
            channel_type: c.advertisingChannelType,
            advertising_channel_type: c.advertisingChannelType,
            start_date: c.startDate ?? null,
            end_date: c.endDate && c.endDate !== "2037-12-30" ? c.endDate : null,
            budget_amount: budget,
          },
          { onConflict: "ad_account_id,external_id" },
        )
        .select()
        .single();
      if (upserted) campaignMap.set(String(c.id), upserted.id);
    }

    // 2) Daily metrics
    const metricsQuery = `
      SELECT
        campaign.id,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date BETWEEN '${fromStr}' AND '${toStr}'
    `;
    const metricRows = await runGAQL(
      customerId,
      loginCid,
      accessToken,
      metricsQuery,
    );

    const metricsToUpsert: any[] = [];
    for (const r of metricRows) {
      const cid = String(r.campaign.id);
      const campaignUuid = campaignMap.get(cid);
      if (!campaignUuid) continue;
      const m = r.metrics ?? {};
      metricsToUpsert.push({
        campaign_id: campaignUuid,
        date: r.segments.date,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        cost: m.costMicros ? Number(m.costMicros) / 1_000_000 : 0,
        conversions: Number(m.conversions ?? 0),
        conversions_value: Number(m.conversionsValue ?? 0),
        ctr: m.ctr ? Number(m.ctr) : null,
        avg_cpc: m.averageCpc ? Number(m.averageCpc) / 1_000_000 : null,
        cost_per_conversion: m.costPerConversion
          ? Number(m.costPerConversion) / 1_000_000
          : null,
      });
    }

    if (metricsToUpsert.length > 0) {
      // chunk to avoid huge payloads
      const chunkSize = 500;
      for (let i = 0; i < metricsToUpsert.length; i += chunkSize) {
        const chunk = metricsToUpsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("campaign_metrics")
          .upsert(chunk, { onConflict: "campaign_id,date" });
        if (error) throw new Error(`Upsert metrics failed: ${error.message}`);
      }
    }

    // 3) Keyword performance (search/display campaigns)
    let keywordRowsCount = 0;
    try {
      const kwQuery = `
        SELECT
          campaign.id,
          ad_group.id,
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr,
          metrics.average_cpc
        FROM keyword_view
        WHERE segments.date BETWEEN '${fromStr}' AND '${toStr}'
          AND ad_group_criterion.status != 'REMOVED'
      `;
      const kwRows = await runGAQL(customerId, loginCid, accessToken, kwQuery);
      const kwUpsert: any[] = [];
      for (const r of kwRows) {
        const cid = String(r.campaign.id);
        const campaignUuid = campaignMap.get(cid);
        if (!campaignUuid) continue;
        const m = r.metrics ?? {};
        const k = r.adGroupCriterion ?? {};
        kwUpsert.push({
          campaign_id: campaignUuid,
          ad_group_id: r.adGroup?.id ? String(r.adGroup.id) : null,
          criterion_id: String(k.criterionId),
          keyword_text: k.keyword?.text ?? "",
          match_type: k.keyword?.matchType ?? null,
          date: r.segments.date,
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          cost: m.costMicros ? Number(m.costMicros) / 1_000_000 : 0,
          conversions: Number(m.conversions ?? 0),
          ctr: m.ctr ? Number(m.ctr) : null,
          avg_cpc: m.averageCpc ? Number(m.averageCpc) / 1_000_000 : null,
        });
      }
      keywordRowsCount = kwUpsert.length;
      const chunkSize = 500;
      for (let i = 0; i < kwUpsert.length; i += chunkSize) {
        const chunk = kwUpsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("campaign_keywords")
          .upsert(chunk, { onConflict: "campaign_id,criterion_id,date" });
        if (error) throw new Error(`Upsert keywords failed: ${error.message}`);
      }
    } catch (err) {
      console.warn("keyword sync skipped:", err instanceof Error ? err.message : err);
    }

    // 4) Search terms
    let searchTermRowsCount = 0;
    try {
      const stQuery = `
        SELECT
          campaign.id,
          search_term_view.search_term,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM search_term_view
        WHERE segments.date BETWEEN '${fromStr}' AND '${toStr}'
      `;
      const stRows = await runGAQL(customerId, loginCid, accessToken, stQuery);
      const stUpsert: any[] = [];
      for (const r of stRows) {
        const cid = String(r.campaign.id);
        const campaignUuid = campaignMap.get(cid);
        if (!campaignUuid) continue;
        const m = r.metrics ?? {};
        const term = r.searchTermView?.searchTerm;
        if (!term) continue;
        stUpsert.push({
          campaign_id: campaignUuid,
          search_term: term,
          date: r.segments.date,
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          cost: m.costMicros ? Number(m.costMicros) / 1_000_000 : 0,
          conversions: Number(m.conversions ?? 0),
        });
      }
      searchTermRowsCount = stUpsert.length;
      const chunkSize = 500;
      for (let i = 0; i < stUpsert.length; i += chunkSize) {
        const chunk = stUpsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("campaign_search_terms")
          .upsert(chunk, { onConflict: "campaign_id,search_term,date" });
        if (error) throw new Error(`Upsert search terms failed: ${error.message}`);
      }
    } catch (err) {
      console.warn("search term sync skipped:", err instanceof Error ? err.message : err);
    }

    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_synced: metricsToUpsert.length,
      })
      .eq("id", log.id);

    return {
      account: account.name,
      campaigns: campaignRows.length,
      metric_rows: metricsToUpsert.length,
      keyword_rows: keywordRowsCount,
      search_term_rows: searchTermRowsCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("sync_logs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq("id", log.id);
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: SyncRequest = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }
    const days = body.days ?? 30;

    const accountQuery = supabase
      .from("ad_accounts")
      .select("*")
      .eq("platform", "google_ads");
    if (body.ad_account_id) accountQuery.eq("id", body.ad_account_id);
    const { data: accounts, error: accErr } = await accountQuery;
    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No Google Ads accounts to sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getAccessToken();

    const results = [];
    for (const acc of accounts) {
      try {
        results.push(await syncAccount(supabase, acc, accessToken, days));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ account: acc.name, error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-google-ads error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
