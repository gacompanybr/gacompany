import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Portfolio, AdAccount, Campaign } from "./types";
import { defaultTheme, vilaGymTheme } from "./types";
import vilaGymLogo from "@/assets/vilagym-logo.png";

const themeOverrides: Record<string, { theme: typeof defaultTheme; logo?: string }> = {
  "vila-gym": { theme: vilaGymTheme, logo: vilaGymLogo },
};

type IntegRow = {
  id: string;
  portfolio_id: string;
  nome_conta_anuncio: string;
  ad_account_id: string;
  ultima_atualizacao: string | null;
  portfolios: { id: string; name: string; slug: string; logo_url: string | null } | null;
};

type CampRow = {
  integration_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string | null;
  objective: string | null;
  budget: number | null;
  start_time: string | null;
};

type MetricRow = {
  integration_id: string;
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  result_type: string | null;
  cost_per_result: number | null;
};

/**
 * Reads Meta Ads cached data from the DB and produces Portfolios in
 * the SAME shape the dashboard already consumes (XLSX-compatible).
 */
export function useMetaPortfolios() {
  return useQuery({
    queryKey: ["meta-portfolios"],
    queryFn: async (): Promise<Portfolio[]> => {
      const [{ data: integs, error: e1 }, { data: camps, error: e2 }, { data: metrics, error: e3 }] =
        await Promise.all([
          supabase
            .from("meta_integracoes")
            .select("id, portfolio_id, nome_conta_anuncio, ad_account_id, ultima_atualizacao, portfolios(id,name,slug,logo_url)"),
          supabase.from("meta_campanhas").select("integration_id,campaign_id,campaign_name,status,objective,budget,start_time"),
          supabase.from("meta_metricas_campanhas").select("integration_id,campaign_id,date,spend,impressions,reach,clicks,results,result_type,cost_per_result"),
        ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;

      const integList = (integs ?? []) as unknown as IntegRow[];
      const campList = (camps ?? []) as CampRow[];
      const metricList = (metrics ?? []) as MetricRow[];

      // group metrics by integration+campaign
      const metricKey = (i: string, c: string) => `${i}::${c}`;
      const metricsByCamp = new Map<string, MetricRow[]>();
      for (const m of metricList) {
        const k = metricKey(m.integration_id, m.campaign_id);
        if (!metricsByCamp.has(k)) metricsByCamp.set(k, []);
        metricsByCamp.get(k)!.push(m);
      }

      // group integrations by portfolio
      const portfolioMap = new Map<string, { p: IntegRow["portfolios"]; integs: IntegRow[] }>();
      for (const i of integList) {
        if (!i.portfolios) continue;
        const key = i.portfolio_id;
        if (!portfolioMap.has(key)) portfolioMap.set(key, { p: i.portfolios, integs: [] });
        portfolioMap.get(key)!.integs.push(i);
      }

      const out: Portfolio[] = [];
      for (const [, group] of portfolioMap) {
        const p = group.p!;
        const override = themeOverrides[p.slug];
        const accounts: AdAccount[] = group.integs.map((integ) => {
          const intCamps = campList.filter((c) => c.integration_id === integ.id);
          const campaigns: Campaign[] = intCamps
            .map((c) => {
              const ms = metricsByCamp.get(metricKey(integ.id, c.campaign_id)) ?? [];
              const totals = ms.reduce(
                (acc, m) => {
                  acc.impressions += Number(m.impressions ?? 0);
                  acc.clicks += Number(m.clicks ?? 0);
                  acc.cost += Number(m.spend ?? 0);
                  acc.reach += Number(m.reach ?? 0);
                  acc.results += Number(m.results ?? 0);
                  if (!acc.startDate || m.date < acc.startDate) acc.startDate = m.date;
                  if (!acc.endDate || m.date > acc.endDate) acc.endDate = m.date;
                  return acc;
                },
                { impressions: 0, clicks: 0, cost: 0, reach: 0, results: 0, startDate: "", endDate: "" },
              );
              const resultType = ms.find((m) => m.result_type)?.result_type ?? "Resultados";
              return {
                id: c.campaign_id,
                name: c.campaign_name,
                results: totals.results,
                resultType,
                costPerResult: totals.results > 0 ? totals.cost / totals.results : 0,
                budget: Number(c.budget ?? 0),
                spent: totals.cost,
                impressions: totals.impressions,
                reach: totals.reach || totals.impressions,
                date: c.start_time?.slice(0, 10) ?? totals.startDate ?? undefined,
                dailyMetrics: ms.map((m) => ({
                  date: m.date,
                  impressions: Number(m.impressions ?? 0),
                  clicks: Number(m.clicks ?? 0),
                  cost: Number(m.spend ?? 0),
                  conversions: Number(m.results ?? 0),
                  reach: Number(m.reach ?? 0),
                })),
              } satisfies Campaign;
            })
            .filter((c) => c.spent > 0 || c.impressions > 0);

          const acctRange = (metricList.filter((m) => m.integration_id === integ.id))
            .reduce(
              (acc, m) => {
                if (!acc.start || m.date < acc.start) acc.start = m.date;
                if (!acc.end || m.date > acc.end) acc.end = m.date;
                return acc;
              },
              { start: "", end: "" },
            );

          return {
            id: integ.id,
            name: integ.nome_conta_anuncio,
            currency: "BRL",
            source: "meta_ads",
            startDate: acctRange.start || new Date().toISOString().slice(0, 10),
            endDate: acctRange.end || new Date().toISOString().slice(0, 10),
            resultDescription: "Resultados consolidados das campanhas Meta Ads.",
            campaigns,
          } satisfies AdAccount;
        });

        out.push({
          id: p.id,
          name: p.name,
          logo: override?.logo ?? p.logo_url ?? undefined,
          theme: override?.theme ?? defaultTheme,
          accounts,
        });
      }
      return out;
    },
    staleTime: 60_000,
  });
}

export async function syncMetaIntegration(integrationId: string, dateFrom?: string, dateTo?: string) {
  const { data, error } = await supabase.functions.invoke("sync-meta-ads", {
    body: { integration_id: integrationId, date_from: dateFrom, date_to: dateTo },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}
