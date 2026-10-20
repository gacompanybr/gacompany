import { describe, expect, it } from "vitest";
import { usesCommercialOrderFlow } from "../../supabase/functions/_shared/order-report-scope";

describe("commercial order flow isolation", () => {
  it("enables the new flow for leonardo - novo tio and Casa do Eletricista", () => {
    expect(usesCommercialOrderFlow("cec68fe6-98f1-43b0-93b8-018be07617b8", "https://docs.google.com/spreadsheets/d/catalog")).toBe(true);
    expect(usesCommercialOrderFlow("cec68fe6-98f1-43b0-93b8-018be07617b8", "")).toBe(false);
    expect(usesCommercialOrderFlow("679e1959-f15a-4ca1-872a-6727653bda75", "https://docs.google.com/spreadsheets/d/catalog")).toBe(true);
    expect(usesCommercialOrderFlow("679e1959-f15a-4ca1-872a-6727653bda75", "")).toBe(false);
  });
  it("preserves dental reporting even when a dental agent has a sheet", () => {
    expect(usesCommercialOrderFlow("385284c7-79c4-4df0-840c-30df88b32b0d", "https://docs.google.com/spreadsheets/d/catalog")).toBe(false);
    expect(usesCommercialOrderFlow("385284c7-79c4-4df0-840c-30df88b32b0d", "")).toBe(false);
  });
  it("does not apply the new order rules to Bruno or other agents", () => {
    expect(usesCommercialOrderFlow("bb29569f-ffa6-46e2-8e50-1273f3624a97", "https://docs.google.com/spreadsheets/d/catalog")).toBe(false);
    expect(usesCommercialOrderFlow("another-agent", "https://docs.google.com/spreadsheets/d/catalog")).toBe(false);
  });
});