// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { deliverSafeReply } from "../../supabase/functions/_shared/agent-safe-delivery";
import { generateSafeAgentResponse } from "../../supabase/functions/_shared/agent-safe-response";

describe("safe delivery", () => {
  it("does not send to a second alias after acceptance", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: { id: "accepted-id" } })));
    expect((await deliverSafeReply("https://example.test", "test", "instance", ["alias1", "alias2"], "reply", transport)).status).toBe("accepted");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("tries another alias only after explicit rejection", async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response("rejected", { status: 400 })).mockResolvedValueOnce(new Response(JSON.stringify({ key: { id: "id2" } })));
    expect((await deliverSafeReply("https://example.test", "test", "instance", ["alias1", "alias2"], "reply", transport)).messageId).toBe("id2");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("never retries uncertain delivery", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("timeout"));
    expect((await deliverSafeReply("https://example.test", "test", "instance", ["alias1", "alias2"], "reply", transport)).status).toBe("uncertain");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("terminal denial emits no substitute or retry", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Access denied" }), { status: 403 }));
    const result = await generateSafeAgentResponse({ modelo_ia: "gemini" }, [{ role: "user", mensagem: "Olá" }], "test", undefined, false, undefined, transport);
    expect(result.parts).toEqual([]);
    expect(result.gatewayError?.status).toBe(403);
    expect(result.fallback).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});