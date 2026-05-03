export type MetaCampanha = {
  id: string;
  integration_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string | null;
  objective: string | null;
  budget: number | null;
  orcamento_diario: number | null;
  start_time: string | null;
  stop_time: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export const OBJETIVOS = [
  { value: "REACH", label: "Reconhecimento" },
  { value: "TRAFFIC", label: "Tráfego" },
  { value: "ENGAGEMENT", label: "Engajamento" },
  { value: "LEAD_GENERATION", label: "Leads" },
  { value: "CONVERSIONS", label: "Vendas" },
  { value: "MESSAGES", label: "Ligações / Mensagens" },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Encerrada",
  DELETED: "Excluída",
};

export const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-400 border-green-500/30",
  PAUSED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  ARCHIVED: "bg-muted text-muted-foreground",
  DELETED: "bg-red-500/15 text-red-400 border-red-500/30",
};
