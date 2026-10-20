import { describe, expect, it } from "vitest";
import { usesHumanTakeoverPause } from "../../supabase/functions/_shared/human-takeover-policy";

describe("human takeover client scope", () => {
  it("never pauses Casa do Eletricista connected to 558781607727", () => {
    expect(usesHumanTakeoverPause("679e1959-f15a-4ca1-872a-6727653bda75")).toBe(false);
  });

  it("preserves the pause for leonardo - novo tio and all other clients", () => {
    for (const id of ["cec68fe6-98f1-43b0-93b8-018be07617b8", "bb29569f-ffa6-46e2-8e50-1273f3624a97", "dental-portfolio"]) {
      expect(usesHumanTakeoverPause(id)).toBe(true);
    }
  });
});