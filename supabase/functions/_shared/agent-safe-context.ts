import { handoffEnabled } from "./agent-safe-policy.ts";
const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export type SafeContextAgent = {
  nome_atendente?: string; nome?: string; tom_de_voz?: string; instrucoes_base?: string | null;
  horarios_por_dia?: Record<string, { enabled?: boolean; inicio?: string; fim?: string }> | null;
  dias_semana?: string[]; horario_inicio?: string | null; horario_fim?: string | null;
  pedir_nome?: string; handoff_enabled?: boolean; report_profile?: string;
  faqs?: { pergunta: string; resposta: string }[];
};
function localParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (key: string) => Number(parts.find(p => p.type === key)?.value ?? 0);
  const day = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  return { day, minute: get("hour") * 60 + get("minute") };
}
const minutes = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export function agentDayWindow(agent: SafeContextAgent, key: string) {
  const cfg = agent.horarios_por_dia?.[key];
  if (cfg) return cfg.enabled !== false && cfg.inicio && cfg.fim ? { inicio: cfg.inicio, fim: cfg.fim } : null;
  if (agent.dias_semana?.length && !agent.dias_semana.includes(key)) return null;
  return agent.horario_inicio && agent.horario_fim ? { inicio: agent.horario_inicio, fim: agent.horario_fim } : null;
}
export function safeWithinHours(agent: SafeContextAgent, at = new Date()): boolean {
  const { day, minute } = localParts(at);
  const window = agentDayWindow(agent, DAYS[day.getUTCDay()]);
  if (!window) return !Object.keys(agent.horarios_por_dia ?? {}).length && !agent.horario_inicio;
  const start = minutes(window.inicio), end = minutes(window.fim);
  return start > end ? minute >= start || minute <= end : minute >= start && minute <= end;
}
export function nextAgentOpening(agent: SafeContextAgent, at = new Date()): string | null {
  const { day, minute } = localParts(at);
  for (let offset = 0; offset <= 7; offset++) {
    const index = (day.getUTCDay() + offset) % 7;
    const window = agentDayWindow(agent, DAYS[index]);
    if (window && (offset > 0 || minutes(window.inicio) > minute)) return `${LABELS[index]} às ${window.inicio.slice(0, 5)}`;
  }
  return null;
}
export function safeTimeContext(agent: SafeContextAgent, at = new Date()): string {
  const within = safeWithinHours(agent, at), next = nextAgentOpening(agent, at);
  return `Agora: ${at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. ${within ? "Dentro do horário." : `FORA do horário. Próxima abertura: ${next ?? "horário não informado"}. Continue atendendo produtos e dúvidas conhecidas. O que depende de pessoa fica pendente para a equipe quando a loja abrir; nunca prometa retorno em instantes ou confirmação humana imediata.`}`;
}
export function buildSafeAgentPrompt(agent: SafeContextAgent, turns: { role: string; mensagem: string }[], at = new Date()): string {
  const nameInstruction = agent.pedir_nome === "nunca" ? "Não peça o nome." : agent.pedir_nome === "no_fechamento" ? "Peça nome somente no fechamento se ainda não foi informado; não adie a resposta de produto por isso." : "Quando o nome não estiver informado e ainda não tiver pedido duas vezes, responda o assunto antes de pedir o nome naturalmente.";
  return [
    `Você é ${agent.nome_atendente ?? "o assistente"}, assistente de atendimento do negócio. Não se apresente como IA por conta própria; se perguntarem diretamente, diga honestamente que é o assistente virtual do negócio. Identidade e serviços vêm somente das instruções do negócio.`,
    `Tom: ${agent.tom_de_voz ?? "profissional"}. Português brasileiro natural. Continue o histórico sem reiniciar saudações. Respostas curtas por padrão; listas, preços e orçamentos podem ser maiores e devem incluir todos os itens. Não invente dados ou sucesso de encaminhamento. Não exponha diagnósticos internos.`,
    "Áudios, imagens e arquivos marcados como não legíveis não foram interpretados. Diga que não conseguiu verificar e peça o conteúdo por texto; aproveite apenas legenda. Não invente conteúdo.",
    "Não use markdown, placeholders ou relatórios internos na mensagem ao cliente. Responda todos os itens da última pergunta, usando o contexto de medidas e produtos anteriores.",
    safeTimeContext(agent, at), nameInstruction,
    handoffEnabled(agent) ? "Se precisar de pessoa (serviço não informado, dúvida, reclamação, humano, desconto, preço ausente, falha de leitura), finalize com UMA linha interna [[EQUIPE|tipo|resumo]]. Tipos: servico, duvida, reclamacao, humano, desconto, sem_preco, falha_busca, atualizacao. Não diga que avisou a equipe: o envio real será verificado depois. Não marque pedido confirmado; ele tem fluxo próprio." : "Se precisar de pessoa, deixe a necessidade clara sem afirmar que enviou aviso à equipe.",
    agent.faqs?.length ? `FAQs: ${JSON.stringify(agent.faqs)}` : "",
    "As instruções do negócio abaixo prevalecem em formato, tom e tamanho; não prevalecem sobre veracidade dos dados ou confirmação real de envio.",
    `INSTRUÇÕES OBRIGATÓRIAS DO NEGÓCIO:\n${agent.instrucoes_base ?? ""}`,
    `Histórico já iniciado: ${turns.some(t => t.role === "assistant") ? "sim; não reinicie" : "não"}.`,
  ].filter(Boolean).join("\n");
}