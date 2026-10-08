export type ContactFollowupPreference = {
  followup_disabled: boolean;
  customer_status: string;
  invalidated_before: string | null;
};

export function followupAllowed(preference: ContactFollowupPreference | null, sourceAt: string): boolean {
  if (!preference) return true;
  if (preference.followup_disabled || preference.customer_status === "course_purchased") return false;
  if (!preference.invalidated_before) return true;
  const source = Date.parse(sourceAt);
  const cutoff = Date.parse(preference.invalidated_before);
  return Number.isFinite(source) && Number.isFinite(cutoff) && source > cutoff;
}

// Fail closed on storage errors; always read fresh immediately before dispatch.
export async function canSendContactFollowup(
  admin: any, portfolioId: string, phone: string, sourceAt: string,
): Promise<boolean> {
  const { data, error } = await admin.from("whatsapp_contact_preferences")
    .select("followup_disabled, customer_status, invalidated_before")
    .eq("portfolio_id", portfolioId).eq("phone", phone.replace(/\D/g, "")).maybeSingle();
  if (error) throw new Error("Unable to verify contact follow-up preference");
  return followupAllowed(data, sourceAt);
}