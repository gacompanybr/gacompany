export interface MetaBindingScope { page_id: string; form_id: string; campaign_id: string; enabled: boolean }
export function matchesMetaBinding(binding: MetaBindingScope, pageId: string, formId: string | undefined, campaignId: string | undefined) {
  return binding.enabled && binding.page_id === pageId && binding.form_id === formId && binding.campaign_id === campaignId;
}

export function extractLeadFormIds(creative: unknown): string[] {
  if (!creative || typeof creative !== "object") return [];
  const result = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 12) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "lead_gen_form_id" && typeof child === "string") result.add(child);
      else visit(child, depth + 1);
    }
  };
  visit(creative, 0);
  return [...result];
}