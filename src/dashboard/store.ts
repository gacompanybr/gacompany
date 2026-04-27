import { useEffect, useState } from "react";
import { Portfolio, defaultTheme, vilaGymTheme } from "./types";
import vilaGymLogo from "@/assets/vilagym-logo.png";

const STORAGE_KEY = "ga-dashboard-portfolios-v1";

const seed: Portfolio[] = [
  {
    id: "vila-gym",
    name: "BM - Vila Gym",
    logo: vilaGymLogo,
    theme: vilaGymTheme,
    accounts: [
      {
        id: "vila-gym-meta",
        name: "Vila Gym - Meta Ads",
        currency: "BRL",
        source: "meta_ads",
        startDate: "2026-04-01",
        endDate: "2026-04-25",
        resultDescription: "Conversas iniciadas no Meta Ads (WhatsApp/Direct)",
        campaigns: [
          {
            id: "vg-conv",
            name: "Captação - Conversas",
            results: 31,
            resultType: "Conversas iniciadas",
            costPerResult: 10.43,
            budget: 350,
            spent: 323.45,
            impressions: 32559,
            reach: 8565,
            date: "2026-04-01",
          },
          {
            id: "vg-leads",
            name: "Captação - Leads",
            results: 8,
            resultType: "Leads na Meta",
            costPerResult: 40.43,
            budget: 0,
            spent: 0,
            impressions: 0,
            reach: 0,
            date: "2026-04-01",
          },
        ],
      },
    ],
  },
];

function load(): Portfolio[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    return JSON.parse(raw);
  } catch {
    return seed;
  }
}

function save(p: Portfolio[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

let listeners: Array<() => void> = [];
let state: Portfolio[] = load();

export function usePortfolios() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  return state;
}

function emit() {
  save(state);
  listeners.forEach((l) => l());
}

export function addPortfolio(p: Portfolio) {
  state = [...state, p];
  emit();
}

export function addAccountToPortfolio(portfolioId: string, account: Portfolio["accounts"][number]) {
  state = state.map((p) =>
    p.id === portfolioId ? { ...p, accounts: [...p.accounts, account] } : p
  );
  emit();
}

export function resetSeed() {
  state = seed;
  emit();
}

export { defaultTheme };
