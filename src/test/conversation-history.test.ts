import { describe, expect, it } from "vitest";
import { loadAllConversationRows } from "../lib/conversation-history";
import { conversationMessageId } from "../../supabase/functions/_shared/conversation-record";

describe("complete conversation history", () => {
  it("includes 1201 messages older than the former date and volume limits", async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id, created_at: "2025-01-01" }));
    expect(await loadAllConversationRows(async (from, to) => rows.slice(from, to + 1))).toEqual(rows);
  });
  it("reports read errors instead of returning a partial history", async () => {
    await expect(loadAllConversationRows(async () => { throw new Error("read failed"); })).rejects.toThrow("read failed");
  });
  it("deduplicates delivery IDs without discarding repeated text in distinct messages", async () => {
    const first = await conversationMessageId("client", "instance", "id1");
    expect(first).toBe(await conversationMessageId("client", "instance", "id1"));
    expect(first).not.toBe(await conversationMessageId("client", "instance", "id2"));
    expect(first).not.toBe(await conversationMessageId("other", "instance", "id1"));
  });
});