// Stable portfolio identity: renaming an agent must not enable commercial dispatch elsewhere.
const LEONARDO_PORTFOLIO_ID = "cec68fe6-98f1-43b0-93b8-018be07617b8";

export function usesCommercialOrderFlow(portfolioId: string, catalogUrl: string): boolean {
  return portfolioId === LEONARDO_PORTFOLIO_ID && catalogUrl.trim().length > 0;
}