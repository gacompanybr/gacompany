import { useMemo } from "react";
import { useDbPortfolios } from "./useDbPortfolios";
import { usePortfolios } from "./store";
import type { Portfolio } from "./types";

/**
 * Combines:
 * - local store portfolios (Meta Ads via XLSX import)
 * - DB portfolios (Google Ads via sync edge function)
 *
 * Same-named portfolios are merged so a single client can show
 * both Meta Ads and Google Ads accounts side by side.
 */
export function useCombinedPortfolios() {
  const local = usePortfolios();
  const { data: dbPortfolios = [], isLoading } = useDbPortfolios();

  const combined = useMemo<Portfolio[]>(() => {
    const byKey = new Map<string, Portfolio>();
    const keyOf = (name: string) =>
      name.toLowerCase().replace(/^bm\s*[-–]\s*/i, "").trim();

    for (const p of local) {
      byKey.set(keyOf(p.name), { ...p, accounts: [...p.accounts] });
    }
    for (const p of dbPortfolios) {
      const key = keyOf(p.name);
      const existing = byKey.get(key);
      if (existing) {
        existing.accounts = [...existing.accounts, ...p.accounts];
        if (!existing.logo && p.logo) existing.logo = p.logo;
      } else {
        byKey.set(key, p);
      }
    }
    return Array.from(byKey.values());
  }, [local, dbPortfolios]);

  return { portfolios: combined, isLoading };
}
