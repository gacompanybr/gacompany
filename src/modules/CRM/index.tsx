import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NovoLeadDialog } from "./NovoLeadDialog";
import { LeadDetailSheet } from "./LeadDetailSheet";
import {
  ORIGEM_LABELS, STATUS_COLUNAS, type CrmLead, type LeadStatus,
} from "./types";

export default function CRMModule({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CrmLead[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from("crm_leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads", portfolioId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const metricas = useMemo(() => {
    const total = leads.length;
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const mes = leads.filter((l) => new Date(l.created_at) >= inicioMes).length;
    const fechados = leads.filter((l) => l.status === "fechado").length;
    const conv = total > 0 ? ((fechados / total) * 100).toFixed(1) : "0";
    const pipeline = leads
      .filter((l) => l.status !== "perdido" && l.status !== "fechado")
      .reduce((acc, l) => acc + (Number(l.valor_estimado) || 0), 0);
    return { total, mes, conv, pipeline };
  }, [leads]);

  const onDragStart = (id: string) => setDraggingId(id);
  const onDrop = (status: LeadStatus) => {
    if (!draggingId) return;
    const l = leads.find((x) => x.id === draggingId);
    if (l && l.status !== status) updateStatus.mutate({ id: draggingId, status });
    setDraggingId(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">CRM</h2>
          <p className="text-sm text-muted-foreground">Funil de vendas e gestão de leads.</p>
        </div>
        <NovoLeadDialog portfolioId={portfolioId} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total de leads" value={metricas.total} />
        <MetricCard label="Leads no mês" value={metricas.mes} />
        <MetricCard label="Conversão" value={`${metricas.conv}%`} />
        <MetricCard label="Pipeline" value={`R$ ${metricas.pipeline.toLocaleString("pt-BR")}`} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STATUS_COLUNAS.map((col) => {
            const items = leads.filter((l) => l.status === col.key);
            return (
              <div
                key={col.key}
                className="bg-muted/40 rounded-lg p-3 min-h-[400px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col.key)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{col.label}</h3>
                  <Badge variant="outline" className="text-xs">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((l) => (
                    <Card
                      key={l.id}
                      draggable
                      onDragStart={() => onDragStart(l.id)}
                      onClick={() => { setSelected(l); setSheetOpen(true); }}
                      className="cursor-pointer hover:border-primary transition-colors"
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="font-medium text-sm truncate">{l.nome}</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {ORIGEM_LABELS[l.origem]}
                          </Badge>
                        </div>
                        {l.telefone && <div className="text-xs text-muted-foreground truncate">{l.telefone}</div>}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {new Date(l.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          {l.valor_estimado && (
                            <span className="font-semibold text-primary">
                              R$ {Number(l.valor_estimado).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">Vazio</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadDetailSheet lead={selected} portfolioId={portfolioId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
