// Stable portfolio identity: renaming an agent must not enable commercial dispatch elsewhere.
const COMMERCIAL_ORDER_PORTFOLIO_IDS = new Set([
  "cec68fe6-98f1-43b0-93b8-018be07617b8", // leonardo - novo tio
  "679e1959-f15a-4ca1-872a-6727653bda75", // Casa do Eletricista
]);

export function usesCommercialOrderFlow(portfolioId: string, catalogUrl: string): boolean {
  return COMMERCIAL_ORDER_PORTFOLIO_IDS.has(portfolioId) && catalogUrl.trim().length > 0;
}
