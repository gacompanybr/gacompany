import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Portfolio, AdAccount, Campaign } from "./types";
import { defaultTheme, vilaGymTheme } from "./types";
import vilaGymLogo from "@/assets/vilagym-logo.png";

/**
 * Map portfolio slug → theme/logo overrides defined in code.
 * The DB stores the canonical record, but per-brand visuals stay
 * close to the design tokens for consistency.
 */
const themeOverrides: Record<string, { theme: typeof defaultTheme; logo?: string }> = {
  "vila-gym": { theme: vilaGymTheme, logo: vilaGymLogo },
};

type PortfolioRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  ad_accounts: Array<{
    id: string;
    name: string;
    currency: string | null;
    result_description: string | null;
    campaigns: Array<{
      id: string;
      name: string;
      status: string | null;
      budget_amount: number | null;
      campaign_metrics: Array<{
        date: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
        reach: number | null;
      }>;
    }>;
  }>;
};

function inferResultType(campaignName: string): string {
  const n = campaignName.toLowerCase();
  if (n.includes("lead")) return "Leads";
  if (n.includes("conv")) return "Conversões";
  if (n.includes("venda")) return "Vendas";
  if (n.includes("trafego") || n.includes("tráfego")) return "Cliques no link";
  return "Conversões";
}

function aggregate(
  metrics: PortfolioRow["ad_accounts"][number]["campaigns"][number]["campaign_metrics"],
) {
  return metrics.reduce(
    (acc, m) => {
      acc.impressions += Number(m.impressions ?? 0);
      acc.clicks += Number(m.clicks ?? 0);
      acc.cost += Number(m.cost ?? 0);
      acc.conversions += Number(m.conversions ?? 0);
      acc.reach += Number(m.reach ?? 0);
      if (!acc.startDate || m.date < acc.startDate) acc.startDate = m.date;
      if (!acc.endDate || m.date > acc.endDate) acc.endDate = m.date;
      return acc;
    },
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      reach: 0,
      startDate: "",
      endDate: "",
    },
  );
}

function mapToPortfolios(rows: PortfolioRow[]): Portfolio[] {
  return rows.map((p) => {
    const override = themeOverrides[p.slug];
    const accounts: AdAccount[] = p.ad_accounts.map((a) => {
      const campaigns: Campaign[] = a.campaigns
        .map((c) => {
          const totals = aggregate(c.campaign_metrics);
          const results = totals.conversions > 0 ? totals.conversions : totals.clicks;
          const resultType =
            totals.conversions > 0 ? inferResultType(c.name) : "Cliques";
          return {
            id: c.id,
            name: c.name,
            results,
            resultType,
            costPerResult: results > 0 ? totals.cost / results : 0,
            budget: Number(c.budget_amount ?? 0),
            spent: totals.cost,
            impressions: totals.impressions,
            reach: totals.reach || totals.impressions, // reach not available on Google
            date: totals.startDate || undefined,
            dailyMetrics: c.campaign_metrics.map((m) => ({
              date: m.date,
              impressions: Number(m.impressions ?? 0),
              clicks: Number(m.clicks ?? 0),
              cost: Number(m.cost ?? 0),
              conversions: Number(m.conversions ?? 0),
              reach: Number(m.reach ?? 0),
            })),
          } satisfies Campaign;
        })
        // hide campaigns with no activity at all
        .filter((c) => c.spent > 0 || c.impressions > 0);

      const acctTotals = a.campaigns
        .flatMap((c) => c.campaign_metrics)
        .reduce(
          (acc, m) => {
            if (!acc.start || m.date < acc.start) acc.start = m.date;
            if (!acc.end || m.date > acc.end) acc.end = m.date;
            return acc;
          },
          { start: "", end: "" },
        );

      return {
        id: a.id,
        name: a.name,
        currency: a.currency ?? "BRL",
        source: "google_ads",
        startDate: acctTotals.start || new Date().toISOString().slice(0, 10),
        endDate: acctTotals.end || new Date().toISOString().slice(0, 10),
        resultDescription:
          a.result_description ?? "Resultados consolidados das campanhas ativas.",
        campaigns,
      } satisfies AdAccount;
    });

    return {
      id: p.id,
      name: p.name,
      logo: override?.logo ?? p.logo_url ?? undefined,
      theme: override?.theme ?? defaultTheme,
      accounts,
    } satisfies Portfolio;
  });
}

export function useDbPortfolios() {
  return useQuery({
    queryKey: ["portfolios-with-data"],
    queryFn: async (): Promise<Portfolio[]> => {
      const { data, error } = await supabase
        .from("portfolios")
        .select(
          `
          id, name, slug, logo_url,
          ad_accounts (
            id, name, currency, result_description,
            campaigns (
              id, name, status, budget_amount,
              campaign_metrics (
                date, impressions, clicks, cost, conversions, reach
              )
            )
          )
          `,
        )
        .order("name");

      if (error) throw error;
      return mapToPortfolios((data ?? []) as unknown as PortfolioRow[]);
    },
    staleTime: 60_000,
  });
}

export async function triggerSync(adAccountId?: string, days = 30) {
  const { data, error } = await supabase.functions.invoke("sync-google-ads", {
    body: { ad_account_id: adAccountId, days },
  });
  if (error) throw error;
  return data;
}
