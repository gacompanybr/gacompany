import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Power, PowerOff, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfigTab } from "./ConfigTab";
import { FaqsTab } from "./FaqsTab";
import { ConectarTab } from "./ConectarTab";
import { PreviewTab } from "./PreviewTab";
import { ConversasTab } from "./ConversasTab";
import { SdrTab } from "./SdrTab";
import { emptyAgent, type WhatsappAgent } from "./types";

export default function WhatsappAgentModule({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<WhatsappAgent | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["whatsapp-agent", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_agents")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as WhatsappAgent | null;
    },
  });

  // Status da conexão WhatsApp do portfólio (refresca a cada 20s)
  const { data: connection } = useQuery({
    queryKey: ["whatsapp-connection-status", portfolioId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("status, instance_name, updated_at")
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      return data as { status: string | null; instance_name: string | null; updated_at: string | null } | null;
    },
    refetchInterval: 20_000,
  });
  const connectionStatus = connection?.status ?? null;
  const isConnected = connectionStatus === "connected";

  // Garante que existe um agente (cria se não houver)
  useEffect(() => {
    if (isLoading) return;
    if (agent) {
      setLocal({
        ...agent,
        dias_semana: Array.isArray(agent.dias_semana) ? agent.dias_semana as string[] : [],
        faqs: Array.isArray(agent.faqs) ? agent.faqs as any : [],
      });
      return;
    }
    // criar
    (async () => {
      const seed = emptyAgent(portfolioId);
      const { data, error } = await supabase
        .from("whatsapp_agents")
        .insert(seed as any)
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.setQueryData(["whatsapp-agent", portfolioId], data);
    })();
  }, [agent, isLoading, portfolioId, qc]);

  function patch(p: Partial<WhatsappAgent>) {
    setLocal((cur) => (cur ? { ...cur, ...p } : cur));
  }

  async function save() {
    if (!local) return;
    setSaving(true);
    const { id, ...rest } = local;
    const { error } = await supabase
      .from("whatsapp_agents")
      .update({
        ...rest,
        dias_semana: local.dias_semana as any,
        faqs: local.faqs as any,
      })
      .eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas!");
    qc.invalidateQueries({ queryKey: ["whatsapp-agent", portfolioId] });
    // Sincroniza workflow n8n com a nova configuração (best-effort)
    try {
      const { error: syncErr } = await supabase.functions.invoke("whatsapp-n8n-sync", {
        body: { portfolioId },
      });
      if (syncErr) console.warn("n8n sync:", syncErr);
      else toast.success("Workflow do n8n atualizado");
    } catch (e) {
      console.warn("n8n sync exception:", e);
    }
  }

  if (isLoading || !local) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  async function toggleActive() {
    if (!local) return;
    const next = local.status === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("whatsapp_agents")
      .update({ status: next })
      .eq("id", local.id);
    if (error) return toast.error(error.message);
    setLocal({ ...local, status: next });
    qc.invalidateQueries({ queryKey: ["whatsapp-agent", portfolioId] });
    // O webhook local (whatsapp-webhook) checa agent.status a cada mensagem,
    // então o gate é imediato — não precisa sincronizar n8n.
    toast.success(next === "active" ? "Agente de IA ATIVADO" : "Agente de IA DESATIVADO");
  }

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-4xl mx-auto">
      {local.status === "active" && !isConnected && (
        <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-300">WhatsApp desconectado</p>
            <p className="text-amber-200/80 mt-1">
              A sessão do WhatsApp deste agente caiu (estado atual:{" "}
              <span className="font-mono">{connectionStatus ?? "—"}</span>).
              A IA até gera respostas, mas a Evolution não consegue entregar até reconectar.
              Vai na aba <strong>Conectar</strong> e escaneia o QR de novo.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {local.status === "active" ? (
            <Badge className="bg-green-500/15 text-green-400 border border-green-500/30">
              <Power size={12} className="mr-1" /> IA ATIVA
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <PowerOff size={12} className="mr-1" /> IA DESATIVADA
            </Badge>
          )}
          <p className="text-xs text-muted-foreground hidden sm:block">
            {local.status === "active"
              ? "O agente responde automaticamente às mensagens recebidas."
              : "Mesmo com WhatsApp conectado, o agente NÃO responde até você ativar."}
          </p>
        </div>
        <Button
          onClick={toggleActive}
          variant={local.status === "active" ? "outline" : "default"}
          className="gap-2"
        >
          {local.status === "active" ? <PowerOff size={14} /> : <Power size={14} />}
          {local.status === "active" ? "Desativar IA" : "Ativar IA"}
        </Button>
      </Card>

      <Tabs defaultValue="config">
        <TabsList className="grid grid-cols-6 w-full mb-4">
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="conectar">
            Conectar
            {!isConnected && <span className="ml-1 inline-block w-2 h-2 rounded-full bg-amber-400" />}
          </TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="preview">Pré-visualizar</TabsTrigger>
          <TabsTrigger value="sdr">SDR</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <ConfigTab agent={local} onChange={patch} />
        </TabsContent>
        <TabsContent value="faqs">
          <FaqsTab agent={local} onChange={patch} />
        </TabsContent>
        <TabsContent value="conectar">
          <ConectarTab
            agent={local}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["whatsapp-agent", portfolioId] })}
          />
        </TabsContent>
        <TabsContent value="conversas">
          <ConversasTab portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab agent={local} />
        </TabsContent>
        <TabsContent value="sdr">
          <SdrTab portfolioId={portfolioId} />
        </TabsContent>
      </Tabs>


      <div className="fixed bottom-0 left-0 right-0 lg:left-[var(--sidebar-width,16rem)] border-t border-border bg-card/95 backdrop-blur p-3 flex justify-end z-30">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
