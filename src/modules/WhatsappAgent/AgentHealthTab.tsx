import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { WhatsappAgent } from "./types";
export function AgentHealthTab({ agent }: { agent: WhatsappAgent }) {
  const { data, error } = useQuery({ queryKey: ["agent-health", agent.id], queryFn: async () => {
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const [messages, handoffs] = await Promise.all([
      supabase.from("whatsapp_conversas").select("id,reply_state,reply_state_reason,created_at,fallback_used,contato_telefone").eq("agent_id", agent.id).gte("created_at", since),
      supabase.from("whatsapp_handoffs").select("status").eq("agent_id", agent.id).in("status", ["pending", "failed", "uncertain"]),
    ]);
    if (messages.error || handoffs.error) throw messages.error ?? handoffs.error;
    return { messages: messages.data ?? [], pending: handoffs.data?.length ?? 0 };
  }, refetchInterval: 10000 });
  const waiting = data?.messages.filter(m => ["received", "processing", "failed", "uncertain"].includes(m.reply_state ?? "") && Date.now() - Date.parse(m.created_at) > 90000) ?? [];
  const resume = async () => { const { error } = await supabase.functions.invoke("whatsapp-reply-watchdog", { body: { action: "resume", agentId: agent.id } }); if (error) return toast.error("Não foi possível retomar. Verifique a disponibilidade da IA."); toast.success("Atendimento automático liberado para novas mensagens"); };
  return <section className="space-y-4"><h3 className="font-semibold">Saúde do atendimento · últimas 24 horas</h3>
    {error && <p role="alert" className="text-destructive">Não foi possível carregar o diagnóstico.</p>}
    <div className="flex gap-3 flex-wrap"><Badge variant={waiting.length ? "destructive" : "secondary"}>{waiting.length} sem resposta há mais de 90 s</Badge><Badge variant="secondary">{data?.messages.filter(m => m.fallback_used).length ?? 0} mensagens de segurança</Badge><Badge variant={data?.pending ? "destructive" : "secondary"}>{data?.pending ?? 0} encaminhamentos pendentes</Badge></div>
    {agent.ai_paused_reason && <div role="alert" className="border border-destructive rounded-md p-4 space-y-2"><p className="text-sm text-destructive">{agent.ai_paused_reason}</p><Button variant="outline" onClick={resume}>Retomar após regularização</Button></div>}
    {waiting.map(m => <div key={m.id} className="border-b border-border py-3 text-sm"><p>+{m.contato_telefone}</p><p className="text-muted-foreground">{m.reply_state_reason ?? "Resposta interrompida ou em processamento"}</p></div>)}
  </section>;
}