import { describe, expect, it } from "vitest";
import { extractLeadFormIds, matchesMetaBinding } from "../../supabase/functions/_shared/meta-binding-policy";
const binding = { page_id: "569248409608253", campaign_id: "123", form_id: "456", enabled: true };
describe("Meta selection scope", () => {
  it("accepts only the selected campaign", () => {
    expect(matchesMetaBinding(binding, binding.page_id, "456", "123")).toBe(true);
    expect(matchesMetaBinding(binding, binding.page_id, "456", "999")).toBe(false);
  });
  it("accepts only the selected instant form", () => {
    expect(matchesMetaBinding(binding, binding.page_id, "999", "123")).toBe(false);
    expect(matchesMetaBinding(binding, binding.page_id, undefined, "123")).toBe(false);
  });
  it("rejects disabled bindings and other pages", () => {
    expect(matchesMetaBinding({ ...binding, enabled: false }, binding.page_id, "456", "123")).toBe(false);
    expect(matchesMetaBinding(binding, "999", "456", "123")).toBe(false);
  });
  it("extracts forms attached to real creative CTA paths", () => {
    expect(extractLeadFormIds({ object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: "456" } } } } })).toEqual(["456"]);
    expect(extractLeadFormIds({ object_story_spec: { link_data: { id: "456" } } })).toEqual([]);
  });
});