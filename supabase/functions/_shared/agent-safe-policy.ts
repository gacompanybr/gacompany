export const PROTECTED_AGENT_PORTFOLIO = "bab9656f-f264-4930-9483-c66733394364";
export function safeAgentEnabled(agent: { portfolio_id?: string; melhorias_enabled?: boolean }, isSdr = false): boolean {
  return !isSdr && agent.portfolio_id !== PROTECTED_AGENT_PORTFOLIO && agent.melhorias_enabled === true;
}
export function handoffEnabled(agent: { handoff_enabled?: boolean; report_profile?: string }): boolean {
  return agent.handoff_enabled === true && agent.report_profile === "generico";
}
export function stopRequested(text: string): boolean {
  return /\b(par[ae] de (me )?(mandar|enviar)|parar de receber|não entre em contato|nao entre em contato|remov[ae] (meu|o meu) (número|numero|contato))\b/i.test(text);
}
export const DEFAULT_SAFE_FALLBACK = "Já anotei o que você precisa. A equipe vai precisar confirmar essa informação para te responder certinho.";
export function extractTeamMarker(text: string) {
  const valid = text.match(/\[\[\s*EQUIPE\s*\|\s*(servico|duvida|reclamacao|humano|desconto|sem_preco|falha_busca|atualizacao)\s*\|\s*([^\]]+)\]\]/i);
  // Remove malformed and unfinished internal markers as well.
  const clean = text.replace(/\[\[[\s\S]*?(?:\]\]|$)/g, "").trim();
  return { text: clean, handoff: valid ? { tipo: valid[1].toLowerCase(), resumo: valid[2].trim().slice(0, 300) } : null };
}
export function summarySimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean));
  const x = words(a), y = words(b);
  const union = new Set([...x, ...y]);
  return union.size ? [...x].filter(w => y.has(w)).length / union.size : 0;
}
export function splitCompleteMessage(text: string, maxChars = 900): string[] {
  const groups = text.trim().split(/\s*\|\|\|\s*|\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const group of groups) {
    if (group.length <= maxChars) { chunks.push(group); continue; }
    let current = "";
    for (const line of group.split("\n")) {
      if (current && current.length + line.length + 1 > maxChars) { chunks.push(current); current = ""; }
      current += `${current ? "\n" : ""}${line}`;
    }
    if (current) chunks.push(current);
  }
  // Preserve the whole budget even when more than six groups were generated.
  return chunks.length <= 6 ? chunks : [...chunks.slice(0, 5), chunks.slice(5).join("\n\n")];
}