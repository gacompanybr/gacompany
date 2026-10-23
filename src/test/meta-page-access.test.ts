import { AbortSignal as NodeAbortSignal } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { resolveMetaPageToken } from "../../supabase/functions/_shared/meta-page-access";

describe("Meta Page authorization", () => {
  beforeEach(() => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
  });
  afterEach(() => vi.restoreAllMocks());
  it("resolves a Page-scoped token with the dedicated credential", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "569248409608253", access_token: "test-page-token" })));
    expect(await resolveMetaPageToken("569248409608253", "test-system-token", request)).toBe("test-page-token");
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/569248409608253?fields=id%2Caccess_token");
    expect(options?.headers).toEqual({ Authorization: "Bearer test-system-token" });
  });
  it("does not fall back to a system token when the Page token is absent", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "569248409608253" })));
    await expect(resolveMetaPageToken("569248409608253", "test-system-token", request)).rejects.toThrow("não disponibilizou um token da Página");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects a token from a different Page", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "123", access_token: "other-page-token" })));
    await expect(resolveMetaPageToken("569248409608253", "test-system-token", request)).rejects.toThrow("não disponibilizou");
  });
  it("redacts credentials from provider failures", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Denied test-system-token" } }), { status: 403 }));
    await expect(resolveMetaPageToken("569248409608253", "test-system-token", request)).rejects.toThrow("Denied [credencial]");
  });
});