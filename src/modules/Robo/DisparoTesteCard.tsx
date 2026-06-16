import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";

type Agent = { id: string; nome: string; status: string };

const DEFAULT_MSG = "🤖 Mensagem de teste do robô — se você recebeu isso, a conexão está funcionando!";

export function DisparoTesteCard({ portfolioId }: { portfolioId: string }) {
  const [agentId, setAgentId] = useState("");
  const [numero, setNumero] = useState("");
  const [mensagem, setMensagem] = useState(DEFAULT_MSG);
  const [sending, setSending] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["wa-agents-test", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_agents")
        .select("id, nome, status")
        .eq("portfolio_id", portfolioId);
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
  });

  async function enviar() {
    if (!agentId) return toast.error("Selecione um agente WhatsApp");
    if (!numero.trim()) return toast.error("Informe o número de destino");
    if (!mensagem.trim()) return toast.error("Informe a mensagem");

    setSending(true);
    const { data, error } = await supabase.functions.invoke("evolution-instance", {
      body: {
        action: "send_test",
        agentId,
        number: numero.trim(),
        message: mensagem,
      },
    });
    setSending(false);
    const d: any = data;
    if (error || d?.error) {
      const detail = d?.detail ? ` — ${typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail)}` : "";
      return toast.error(`${d?.error ?? error?.message ?? "Falha"}${detail}`);
    }
    toast.success(`Mensagem enviada para ${d?.sentTo ?? numero}`);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Send size={16} className="text-primary" />
        <h2 className="font-medium">Disparo de teste</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Envia uma mensagem única para um número específico. Útil pra validar conexão e formatação.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Agente WhatsApp</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione o agente conectado" />
            </SelectTrigger>
            <SelectContent>
              {(agents ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nome} {a.status === "active" ? "✓" : `(${a.status})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Número (com DDI+DDD)</Label>
          <Input
            className="mt-1"
            placeholder="5511999998888"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Mensagem</Label>
        <Textarea
          className="mt-1"
          rows={3}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={enviar} disabled={sending} className="gap-2">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Enviar teste
        </Button>
      </div>
    </Card>
  );
}
