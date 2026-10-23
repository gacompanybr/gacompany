import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROTECTED_AGENT_PORTFOLIO } from "../../../supabase/functions/_shared/agent-safe-policy";
import type { WhatsappAgent } from "./types";
export function SafeOptions({ agent, onChange }: { agent: WhatsappAgent; onChange: (p: Partial<WhatsappAgent>) => void }) {
  const protectedClient = agent.portfolio_id === PROTECTED_AGENT_PORTFOLIO;
  return <section className="border-t border-border pt-5 space-y-4">
    <h3 className="font-semibold">Melhorias individuais</h3>
    {protectedClient ? <p className="text-sm text-muted-foreground">Atendimento atual preservado — Lopes Saúde.</p> : <>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="safe-agent">Respostas seguras</Label><Switch id="safe-agent" checked={!!agent.melhorias_enabled} onCheckedChange={v => onChange({ melhorias_enabled: v })} /></div>
      <fieldset disabled={!agent.melhorias_enabled} className="space-y-4 disabled:opacity-50">
        <div className="flex items-center justify-between gap-4"><Label htmlFor="multi-catalog">Pedidos com vários produtos</Label><Switch id="multi-catalog" disabled={!agent.melhorias_enabled} checked={!!agent.catalog_multi_enabled} onCheckedChange={v => onChange({ catalog_multi_enabled: v })} /></div>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="team-handoff">Encaminhamentos gerais</Label><Switch id="team-handoff" disabled={!agent.melhorias_enabled} checked={!!agent.handoff_enabled} onCheckedChange={v => onChange({ handoff_enabled: v, report_profile: v ? "generico" : "odonto" })} /></div>
        {agent.handoff_enabled && !agent.report_group_id && !agent.report_number && <p role="alert" className="text-sm text-destructive">Selecione um grupo ou número de encaminhamento antes de ativar.</p>}
        <div className="flex items-center justify-between gap-4"><Label htmlFor="reply-watchdog">Recuperar respostas interrompidas</Label><Switch id="reply-watchdog" disabled={!agent.melhorias_enabled} checked={!!agent.watchdog_enabled} onCheckedChange={v => onChange({ watchdog_enabled: v })} /></div>
        <div className="space-y-2"><Label>Fora do horário</Label><Select disabled={!agent.melhorias_enabled} value={agent.fora_horario_modo ?? "silencio"} onValueChange={v => onChange({ fora_horario_modo: v as "silencio" | "responder" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="silencio">Manter silêncio</SelectItem><SelectItem value="responder">Continuar atendendo</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Pedir nome</Label><Select disabled={!agent.melhorias_enabled} value={agent.pedir_nome ?? "sempre"} onValueChange={v => onChange({ pedir_nome: v as WhatsappAgent["pedir_nome"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sempre">Durante o atendimento</SelectItem><SelectItem value="no_fechamento">No fechamento</SelectItem><SelectItem value="nunca">Não pedir</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="safe-fallback">Mensagem de segurança</Label><Textarea id="safe-fallback" value={agent.mensagem_fallback ?? ""} onChange={e => onChange({ mensagem_fallback: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="alert-number">WhatsApp do administrador para alertas</Label><Input id="alert-number" type="tel" value={agent.alert_number ?? ""} onChange={e => onChange({ alert_number: e.target.value || null })} /></div>
      </fieldset>
    </>}
  </section>;
}