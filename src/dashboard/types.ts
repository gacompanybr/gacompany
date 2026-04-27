export type AccountTheme = {
  bg: string; // hsl values "0 0% 5%"
  card: string;
  primary: string;
  primaryFg: string;
  border: string;
  muted: string;
  mutedFg: string;
  fg: string;
  gradient: string; // full css gradient
  accentName: string;
};

export type Campaign = {
  id: string;
  name: string;
  results: number;
  resultType: string; // "Leads" | "Conversas" etc
  costPerResult: number;
  budget: number;
  spent: number;
  impressions: number;
  reach: number;
  date?: string; // YYYY-MM-DD start
};

export type AdAccount = {
  id: string;
  name: string;
  campaigns: Campaign[];
  resultDescription: string;
  currency: string;
  startDate: string;
  endDate: string;
  source?: "meta_ads" | "google_ads"; // origem dos dados
};

export type Portfolio = {
  id: string;
  name: string;
  logo?: string; // url or imported asset
  theme: AccountTheme;
  accounts: AdAccount[];
};

export const defaultTheme: AccountTheme = {
  bg: "0 0% 5%",
  card: "0 0% 8%",
  primary: "37 99% 53%",
  primaryFg: "0 0% 5%",
  border: "0 0% 18%",
  muted: "0 0% 15%",
  mutedFg: "0 0% 60%",
  fg: "0 0% 95%",
  gradient: "linear-gradient(135deg, hsl(37 99% 53%), hsl(30 100% 40%))",
  accentName: "GA Company",
};

export const vilaGymTheme: AccountTheme = {
  bg: "20 14% 4%",
  card: "20 14% 8%",
  primary: "20 100% 50%", // laranja forte
  primaryFg: "0 0% 100%",
  border: "20 30% 18%",
  muted: "20 14% 14%",
  mutedFg: "30 10% 65%",
  fg: "30 20% 96%",
  gradient: "linear-gradient(135deg, hsl(20 100% 50%), hsl(15 100% 40%))",
  accentName: "Vila Gym",
};
