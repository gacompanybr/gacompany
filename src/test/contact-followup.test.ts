import { describe, expect, it } from "vitest";
import { canSendContactFollowup, followupAllowed } from "../../supabase/functions/_shared/contact-followup-policy";

describe("contact follow-up policy", () => {
  const source = "2026-10-08T12:00:00Z";
  it("keeps normal contacts eligible", () => expect(followupAllowed(null, source)).toBe(true));
  it("blocks opt-outs and purchases", () => {
    expect(followupAllowed({ followup_disabled: true, customer_status: "lead", invalidated_before: null }, source)).toBe(false);
    expect(followupAllowed({ followup_disabled: false, customer_status: "course_purchased", invalidated_before: null }, source)).toBe(false);
  });
  it("invalidates pending work permanently but permits future cycles", () => {
    const resumed = { followup_disabled: false, customer_status: "lead", invalidated_before: "2026-10-08T13:00:00Z" };
    expect(followupAllowed(resumed, source)).toBe(false);
    expect(followupAllowed(resumed, resumed.invalidated_before)).toBe(false);
    expect(followupAllowed(resumed, "2026-10-09T12:00:00Z")).toBe(true);
  });
  it("normalizes phones and isolates portfolios on each fresh check", async () => {
    const filters: Record<string, string> = {};
    const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: filters.portfolio_id === "blocked" ? { followup_disabled: true, customer_status: "lead", invalidated_before: null } : null, error: null }) };
    const admin = { from: () => query };
    expect(await canSendContactFollowup(admin, "blocked", "+55 (41) 93300-7323", source)).toBe(false);
    expect(filters.phone).toBe("5541933007323");
    expect(await canSendContactFollowup(admin, "other", "+55 (41) 93300-7323", source)).toBe(true);
  });
  it("does not send if preferences cannot be verified", async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: { message: "offline" } }) };
    await expect(canSendContactFollowup({ from: () => query }, "portfolio", "5511999999999", source)).rejects.toThrow();
  });
});