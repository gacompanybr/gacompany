export type LeadStatus = "novo" | "contato" | "proposta" | "fechado" | "perdido";
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
