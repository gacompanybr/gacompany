// Stable client scope: never infer this exception from an editable name or instance.
const UNPAUSED_PORTFOLIO_ID = "679e1959-f15a-4ca1-872a-6727653bda75";

export function usesHumanTakeoverPause(portfolioId: string): boolean {
  return portfolioId !== UNPAUSED_PORTFOLIO_ID;
}