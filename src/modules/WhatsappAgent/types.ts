export type WhatsappAgent = {
  id: string;
  portfolio_id: string;
  nome: string;
  status: "inactive" | "active" | "connecting";
  instancia_id: string | null;
  telefone: string | null;
  nome_atendente: string;
  tom_de_voz: "profissional" | "amigavel" | "formal" | "descontraido";
  instrucoes_base: string | null;
  mensagem_boas_vindas: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  dias_semana: string[];
  horarios_por_dia: Record<string, { enabled: boolean; inicio: string; fim: string }>;
  fora_horario_msg: string | null;
  faqs: Faq[];
  modelo_ia: "gemini" | "openai";
  temperatura: number;
  max_tokens: number;
  report_group_id: string | null;
  report_group_name: string | null;
  report_number: string | null;
  followup_enabled: boolean;
};

export type Faq = { pergunta: string; resposta: string };

export const DEFAULT_HORARIOS_AGENTE: Record<string, { enabled: boolean; inicio: string; fim: string }> = {
  seg: { enabled: true, inicio: "08:00", fim: "18:00" },
  ter: { enabled: true, inicio: "08:00", fim: "18:00" },
  qua: { enabled: true, inicio: "08:00", fim: "18:00" },
  qui: { enabled: true, inicio: "08:00", fim: "18:00" },
  sex: { enabled: true, inicio: "08:00", fim: "18:00" },
  sab: { enabled: false, inicio: "08:00", fim: "12:00" },
  dom: { enabled: false, inicio: "08:00", fim: "12:00" },
};


export const TOM_OPTIONS = [
  { value: "profissional", label: "Profissional" },
  { value: "amigavel", label: "Amigável" },
  { value: "formal", label: "Formal" },
  { value: "descontraido", label: "Descontraído" },
] as const;

export const DIAS = [
  { value: "seg", label: "Seg" },
  { value: "ter", label: "Ter" },
  { value: "qua", label: "Qua" },
  { value: "qui", label: "Qui" },
  { value: "sex", label: "Sex" },
  { value: "sab", label: "Sáb" },
  { value: "dom", label: "Dom" },
] as const;

export function buildSystemPrompt(agent: WhatsappAgent): string {
  const tom = TOM_OPTIONS.find((t) => t.value === agent.tom_de_voz)?.label ?? "Profissional";
  const faqs = (agent.faqs ?? []).map((f, i) =>
    `${i + 1}. P: ${f.pergunta}\n   R: ${f.resposta}`
  ).join("\n");
  return [
    `Você é ${agent.nome_atendente}, atendente humano via WhatsApp da GA Company. Nunca diga que é IA, bot ou assistente virtual.`,
    `Tom de voz: ${tom}.`,
    agent.instrucoes_base ? `INSTRUÇÕES OBRIGATÓRIAS:\n${agent.instrucoes_base}` : "",
    faqs ? `\nFAQs de referência:\n${faqs}` : "",
    "\nLeia o histórico antes de responder e continue o contexto. Não cumprimente de novo se a conversa já começou.",
    "Responda de forma curta, humanizada e consultiva, em português brasileiro, como em uma conversa real de WhatsApp.",
    "Quando fizer sentido dividir, escreva até 3 blocos curtos separados por |||. O sistema envia cada bloco separado; nunca explique esse separador ao cliente.",
    "Nunca responda só com 'Olá! Como posso te ajudar hoje?' quando o usuário fez uma pergunta real.",
  ].filter(Boolean).join("\n");
}

export function emptyAgent(portfolioId: string): Partial<WhatsappAgent> {
  return {
    portfolio_id: portfolioId,
    nome: "Agente WhatsApp",
    status: "inactive",
    nome_atendente: "Assistente",
    tom_de_voz: "profissional",
    instrucoes_base: "",
    mensagem_boas_vindas: "Olá! Como posso te ajudar hoje?",
    horario_inicio: "08:00",
    horario_fim: "18:00",
    dias_semana: ["seg", "ter", "qua", "qui", "sex"],
    horarios_por_dia: DEFAULT_HORARIOS_AGENTE,
    fora_horario_msg: "Olá! No momento estou fora do horário de atendimento.",
    faqs: [],
    modelo_ia: "gemini",
    temperatura: 0.7,
    max_tokens: 1200,
    report_group_id: null,
    report_group_name: null,
    report_number: null,
    followup_enabled: false,
  };
}
