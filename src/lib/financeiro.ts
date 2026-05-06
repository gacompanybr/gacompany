// Helpers para o módulo Financeiro

export type TipoCobranca = "mensal" | "unico" | "trimestral";

export const BRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDateBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const RECEIVABLE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  parcial: "Parcial",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

export const SERVICE_STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  finalizado: "Finalizado",
};

export const BILLING_LABEL: Record<TipoCobranca, string> = {
  mensal: "Mensal",
  unico: "Único",
  trimestral: "Trimestral",
};

export const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "recebido":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "parcial":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "pendente":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "atrasado":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "cancelado":
      return "bg-muted text-muted-foreground border-border";
    case "ativo":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "pausado":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "finalizado":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/**
 * Status efetivo (calculado): se está pendente e a data já passou, vira "atrasado".
 */
export function effectiveStatus(status: string, dataPrevista: string): string {
  if (status === "pendente" && dataPrevista < todayISO()) return "atrasado";
  return status;
}

/**
 * Gera as próximas N datas de vencimento (ISO yyyy-mm-dd) para um serviço.
 */
export function generateOccurrences(opts: {
  tipo_cobranca: TipoCobranca;
  data_inicio: string; // yyyy-mm-dd
  dia_vencimento: number | null;
  count?: number;
}): string[] {
  const count = opts.count ?? 12;
  const start = new Date(opts.data_inicio + "T12:00:00");
  const out: string[] = [];

  if (opts.tipo_cobranca === "unico") {
    out.push(opts.data_inicio);
    return out;
  }

  const step = opts.tipo_cobranca === "trimestral" ? 3 : 1;

  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * step);
    if (opts.tipo_cobranca === "mensal" && opts.dia_vencimento) {
      // Ajusta para o dia escolhido (cap no último dia do mês)
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(opts.dia_vencimento, lastDay));
    }
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
