export type FinancialReceivable = {
  id: string;
  service_id: string;
  participant_user_id: string;
  portfolio_id: string;
  valor_previsto: number;
  valor_recebido: number | null;
  data_prevista: string;
  data_recebimento: string | null;
  status: "pendente" | "recebido" | "parcial" | "atrasado" | "cancelado";
  forma_pagamento: "pix" | "boleto" | "transferencia" | "dinheiro" | "cartao" | null;
  observacoes: string | null;
};

export type FinancialService = {
  id: string;
  portfolio_id: string;
  category_id: string | null;
  nome: string;
  descricao: string | null;
  valor_total: number;
  tipo_cobranca: "mensal" | "unico" | "trimestral";
  dia_vencimento: number | null;
  data_inicio: string;
  status: "ativo" | "pausado" | "finalizado";
  observacoes: string | null;
  created_by: string | null;
};

export type FinancialCategory = {
  id: string;
  nome: string;
  cor: string;
};

export type FinancialParticipant = {
  id: string;
  service_id: string;
  user_id: string;
  percentual: number;
};
