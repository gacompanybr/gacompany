import { describe, expect, it } from "vitest";
import { CRM_META_PAGE_ID, mapMetaLead, verifyMetaSignature } from "../../supabase/functions/_shared/meta-instant-lead";

describe("Meta CRM integration", () => {
  it("imports to general CRM for the agreed page", () => {
    const mapped = mapMetaLead({ id: "123", field_data: [] });
    expect(CRM_META_PAGE_ID).toBe("569248409608253");
    expect(mapped.portfolio_id).toBeNull();
    expect(mapped.origem).toBe("meta_ads");
    expect(mapped.status).toBe("novo");
  });
  it("preserves contact fields and custom answers", () => {
    const fields = [{ name: "full_name", values: ["Pessoa Teste"] }, { name: "phone_number", values: ["+5511999990000"] }, { name: "email", values: ["teste@example.com"] }, { name: "objetivo", values: ["Orçamento", "Contato"] }];
    const mapped = mapMetaLead({ id: "123", field_data: fields });
    expect(mapped.nome).toBe("Pessoa Teste");
    expect(mapped.telefone).toBe("+5511999990000");
    expect(mapped.email).toBe("teste@example.com");
    expect(mapped.meta_field_data).toEqual(fields);
    expect(mapped.observacoes).toContain("objetivo: Orçamento, Contato");
  });
  it("rejects missing and tampered signatures", async () => {
    // Public test fixture only; never uses a configured credential.
    const fixture = "public-test-fixture";
    const raw = '{"object":"page"}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(fixture), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const signature = "sha256=" + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
    expect(await verifyMetaSignature(raw, signature, fixture)).toBe(true);
    expect(await verifyMetaSignature(raw + " ", signature, fixture)).toBe(false);
    expect(await verifyMetaSignature(raw, null, fixture)).toBe(false);
  });
});