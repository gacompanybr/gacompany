import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduledContactFollowups } from "../../supabase/functions/_shared/scheduled-contact-followup";

afterEach(() => vi.unstubAllGlobals());

describe("scheduled contact dispatch", () => {
  function database(blocked = false, claim = true) {
    const row = { portfolio_id: "portfolio", phone: "5511999999999", scheduled_followup_token: "token", scheduled_followup_at: "2020-01-01T09:00:00Z" };
    const writes: string[] = [];
    const admin = { from(table: string) {
      let operation = "read";
      const query: any = {
        select: () => query, eq: () => query, in: () => query, lte: () => query, order: () => query,
        update: (values: any) => { operation = "update"; writes.push(values.scheduled_followup_status); return query; },
        insert: () => query, upsert: () => query,
        limit: async () => ({ data: table === "whatsapp_contact_preferences" ? [row] : [{ role: "user", mensagem: "Produto", contato_nome: "Teste" }], error: null }),
        maybeSingle: async () => ({ data: table === "whatsapp_connections" ? { instance_name: "instance", status: "connected" }
          : table === "whatsapp_paused_contacts" ? null
          : operation === "update" ? (claim ? { phone: row.phone } : null)
          : { ...row, followup_disabled: blocked, customer_status: "lead", scheduled_followup_status: "processing", invalidated_before: null }, error: null }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return query;
    } };
    return { admin, writes };
  }
  it("sends once after claiming and marks delivery", async () => {
    const { admin, writes } = database();
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: "message" } }) });
    vi.stubGlobal("fetch", fetch);
    const result = await runScheduledContactFollowups(admin, new Map([["portfolio", {}]]), async () => "Retorno", "https://example.invalid", "test-key");
    expect(result.sent).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["processing", "sent"]);
  });
  it("does not send when cancelled during generation or claimed by another execution", async () => {
    for (const [blocked, claim] of [[true, true], [false, false]]) {
      const { admin } = database(blocked, claim);
      const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
      const result = await runScheduledContactFollowups(admin, new Map([["portfolio", {}]]), async () => "Retorno", "https://example.invalid", "test-key");
      expect(result.sent).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    }
  });
  it("does not automatically retry an ambiguous delivery", async () => {
    const { admin, writes } = database();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await runScheduledContactFollowups(admin, new Map([["portfolio", {}]]), async () => "Retorno", "https://example.invalid", "test-key");
    expect(writes).toEqual(["processing", "failed"]);
  });
});