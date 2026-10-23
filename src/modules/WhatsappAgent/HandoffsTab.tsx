import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
const statusLabel: Record<string,string> = { pending: "Pendente", sending: "Enviando", accepted: "Aceito pelo WhatsApp", uncertain: "Entrega incerta — verificar", failed: "Falhou", attended: "Atendido" };
export function HandoffsTab({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient(), [busy, setBusy] = useState<string | null>(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["agent-handoffs", portfolioId], queryFn: async () => {
    const { data, error } = await supabase.from("whatsapp_handoffs").select("*").eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error; return data ?? [];
  }, refetchInterval: 10000 });
  const action = async (id: string, value: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("manage_agent_handoff", { _id: id, _action: value });
    setBusy(null); if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["agent-handoffs", portfolioId] }); toast.success(value === "attended" ? "Marcado como atendido" : "Reenvio solicitado");
  };
  if (isLoading) return <Loader2 className="animate-spin text-muted-foreground mx-auto" />;
  if (error) return <p role="alert" className="text-destructive">Não foi possível carregar encaminhamentos.</p>;
  return <section className="space-y-3">
    <h3 className="font-semibold">Encaminhamentos {data.length > 0 && <span className="text-muted-foreground">({data.length})</span>}</h3>
    {!data.length && <p className="text-sm text-muted-foreground py-6">Nenhum encaminhamento registrado.</p>}
    {data.map(h => <article key={h.id} className="border border-border rounded-md p-4 space-y-2">
      <div className="flex flex-wrap gap-2 items-center"><Badge variant={["pending", "failed", "uncertain"].includes(h.status) ? "destructive" : "secondary"}>{statusLabel[h.status] ?? h.status}</Badge><span className="text-sm font-medium">{h.tipo}</span><span className="text-xs text-muted-foreground">+{h.phone}</span></div>
      <p className="text-sm whitespace-pre-wrap break-words">{h.resumo}</p>
      <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")} · {h.fora_do_horario ? "Fora do horário" : "Dentro do horário"} · {h.attempts}/5 tentativas</p>
      {h.error && <p className="text-xs text-destructive">{h.error}</p>}
      <div className="flex gap-2 flex-wrap"><Button size="sm" variant="outline" disabled={busy === h.id || ["attended", "sending"].includes(h.status)} onClick={() => action(h.id, "attended")}><Check size={14} className="mr-2" />Marcar como atendido</Button>{["failed", "pending"].includes(h.status) && <Button size="sm" variant="outline" disabled={busy === h.id} onClick={() => action(h.id, "retry")}><RotateCw size={14} className="mr-2" />Reenviar</Button>}</div>
    </article>)}
  </section>;
}