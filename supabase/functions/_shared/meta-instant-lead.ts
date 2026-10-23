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
    telefone: normalizeBrPhone(field("phone_number", "telefone", "phone", "whatsapp", "celular")),
    email: field("email"),
    origem: "meta_ads",
    status: "novo",
    meta_leadgen_id: lead.id,
    meta_page_id: CRM_META_PAGE_ID,
    meta_form_id: lead.form_id || null,
    meta_ad_id: lead.ad_id || null,
    meta_field_data: lead.field_data,
    tags: isHotLead(lead.field_data) ? ["lead_quente"] : [],
    observacoes: null,
    ...(lead.created_time ? { created_at: lead.created_time } : {}),
  };
}

export async function verifyMetaSignature(raw: string, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g) || [], x => parseInt(x, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(raw));
}

export function normalizeBrPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

const norm = (v: string) => v.replace(/_/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isHotLead(fields: { name: string; values: string[] }[]): boolean {
  const answer = (re: RegExp) => norm(fields.find(f => re.test(norm(f.name)))?.values[0] ?? "");
  const fatura = answer(/fatura/);
  const investe = answer(/disposto|dispost/);
  const prazo = answer(/quanto tempo|prazo/);
  const highRevenue = /30 mil a r\$ ?60|mais de r\$ ?60|30_mil_a|mais_de/.test(fatura);
  const willing = /^sim/.test(investe);
  const soon = /imediat|30 dias|30_dias/.test(prazo);
  return highRevenue && willing && soon;
}
