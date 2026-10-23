export type LeadStatus = "novo" | "contato" | "qualificado" | "proposta" | "fechado" | "perdido";
export type LeadOrigem = "manual" | "whatsapp" | "meta_ads" | "google_ads" | "instagram" | "indicacao";

export interface CrmLead {
  id: string;
  portfolio_id: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  origem: LeadOrigem;
  status: LeadStatus;
  valor_estimado: number | null;
  observacoes: string | null;
  responsavel_id: string | null;
  created_at: string;
  updated_at: string;
  tags?: string[] | null;
  meta_field_data?: unknown;
}

export interface CrmInteracao {
  id: string;
  lead_id: string;
  tipo: "nota" | "ligacao" | "whatsapp" | "email" | "reuniao";
  descricao: string;
  user_id: string | null;
  created_at: string;
}

export const STATUS_COLUNAS: { key: LeadStatus; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "contato", label: "Em contato" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta enviada" },
  { key: "fechado", label: "Fechado" },
  { key: "perdido", label: "Perdido" },
];

export const ORIGEM_LABELS: Record<LeadOrigem, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  instagram: "Instagram",
  indicacao: "Indicação",
};

export type LeadAnswer = { pergunta: string; resposta: string };
const HIDDEN = new Set(["full_name", "first_name", "last_name", "nome", "nome_completo", "email", "phone_number", "telefone", "phone"]);
export function leadAnswers(lead: Pick<CrmLead, "meta_field_data">): LeadAnswer[] {
  if (!Array.isArray(lead.meta_field_data)) return [];
  return (lead.meta_field_data as { name?: string; values?: string[] }[])
    .filter((f) => f?.name && !HIDDEN.has(f.name))
    .map((f) => ({
      pergunta: String(f.name).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      resposta: (f.values ?? []).join(", ").replace(/_/g, " "),
    }));
}
export function shortAnswer(lead: Pick<CrmLead, "meta_field_data">, re: RegExp): string | null {
  return leadAnswers(lead).find((a) => re.test(a.pergunta.toLowerCase()))?.resposta ?? null;
}
