import { useMemo } from "react";
import { useDbPortfolios } from "./useDbPortfolios";
import { useMetaPortfolios } from "./useMetaPortfolios";
import type { Portfolio } from "./types";

/**
 * Combines Meta Ads (DB cache from sync-meta-ads) and Google Ads (DB cache from sync-google-ads).
 * Same-portfolio merging keeps Meta + Google side-by-side per client.
 */
export function useCombinedPortfolios() {
  const { data: googlePortfolios = [], isLoading: lG } = useDbPortfolios();
  const { data: metaPortfolios = [], isLoading: lM } = useMetaPortfolios();

  const combined = useMemo<Portfolio[]>(() => {
    const byId = new Map<string, Portfolio>();
    for (const p of metaPortfolios) {
      byId.set(p.id, { ...p, accounts: [...p.accounts] });
    }
    for (const p of googlePortfolios) {
      const existing = byId.get(p.id);
      if (existing) {
        existing.accounts = [...existing.accounts, ...p.accounts];
        if (!existing.logo && p.logo) existing.logo = p.logo;
      } else {
        byId.set(p.id, p);
      }
    }
    return Array.from(byId.values());
  }, [googlePortfolios, metaPortfolios]);

  return { portfolios: combined, isLoading: lG || lM };
}
