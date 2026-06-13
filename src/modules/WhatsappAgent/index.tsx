import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { ConfigTab } from "./ConfigTab";
import { FaqsTab } from "./FaqsTab";
import { ConectarTab } from "./ConectarTab";
import { PreviewTab } from "./PreviewTab";
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

  return (
    <div className="p-4 lg:p-6 pb-24 max-w-4xl mx-auto">
      <Tabs defaultValue="config">
        <TabsList className="grid grid-cols-4 w-full mb-4">
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="conectar">Conectar</TabsTrigger>
          <TabsTrigger value="preview">Pré-visualizar</TabsTrigger>
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
        <TabsContent value="preview">
          <PreviewTab agent={local} />
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
