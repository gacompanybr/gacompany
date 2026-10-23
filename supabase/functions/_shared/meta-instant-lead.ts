export const CRM_META_PAGE_ID = "569248409608253";

export interface MetaLead {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  field_data: { name: string; values: string[] }[];
}

export function mapMetaLead(lead: MetaLead) {
  const field = (...names: string[]) => lead.field_data.find(f => names.includes(f.name))?.values[0]?.trim() || null;
  const fullName = field("full_name", "nome_completo", "nome") ||
    [field("first_name"), field("last_name")].filter(Boolean).join(" ") || "Lead Meta";
  return {
    portfolio_id: null,
    nome: fullName,
    telefone: field("phone_number", "telefone", "phone"),
    email: field("email"),
    origem: "meta_ads",
    status: "novo",
    meta_leadgen_id: lead.id,
    meta_page_id: CRM_META_PAGE_ID,
    meta_form_id: lead.form_id || null,
    meta_ad_id: lead.ad_id || null,
    meta_field_data: lead.field_data,
    observacoes: lead.field_data.map(f => `${f.name}: ${f.values.join(", ")}`).join("\n"),
    ...(lead.created_time ? { created_at: lead.created_time } : {}),
  };
}

export async function verifyMetaSignature(raw: string, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g) || [], x => parseInt(x, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(raw));
}