import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NovoLeadDialog } from "./NovoLeadDialog";
import { LeadDetailSheet } from "./LeadDetailSheet";
import {
  ORIGEM_LABELS, STATUS_COLUNAS, type CrmLead, type LeadStatus,
} from "./types";

type CrmPortfolio = { id: string; name: string };

export default function CRMModule({ portfolioId }: { portfolioId?: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [portfolioFilter, setPortfolioFilter] = useState("all");

  const { data: portfolios = [] } = useQuery({
    queryKey: ["crm-portfolios", portfolioId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("portfolios").select("id, name").order("name");
      if (portfolioId) query = query.eq("id", portfolioId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CrmPortfolio[];
    },
  });

  const portfolioNames = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios],
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads", portfolioId],
    queryFn: async () => {
      let query = supabase
        .from("crm_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (portfolioId) query = query.eq("portfolio_id", portfolioId);
      const { data, error } = await query;
      if (error) throw error;
      return data as CrmLead[];
    },
  });

  const visibleLeads = useMemo(
    () => portfolioFilter === "all" ? leads : leads.filter((lead) => lead.portfolio_id === portfolioFilter),
    [leads, portfolioFilter],
  );

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from("crm_leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads", portfolioId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const metricas = useMemo(() => {
    const total = visibleLeads.length;
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const mes = visibleLeads.filter((l) => new Date(l.created_at) >= inicioMes).length;
    const fechados = visibleLeads.filter((l) => l.status === "fechado").length;
    const conv = total > 0 ? ((fechados / total) * 100).toFixed(1) : "0";
    const pipeline = visibleLeads
      .filter((l) => l.status !== "perdido" && l.status !== "fechado")
      .reduce((acc, l) => acc + (Number(l.valor_estimado) || 0), 0);
    return { total, mes, conv, pipeline };
  }, [visibleLeads]);

  const onDragStart = (id: string) => setDraggingId(id);
  const onDrop = (status: LeadStatus) => {
    if (!draggingId) return;
    const l = visibleLeads.find((x) => x.id === draggingId);
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {!portfolioId && (
            <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-[220px]">
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {portfolios.map((portfolio) => (
                  <SelectItem key={portfolio.id} value={portfolio.id}>{portfolio.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <NovoLeadDialog portfolioId={portfolioId} portfolios={portfolios} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total de leads" value={metricas.total} />
        <MetricCard label="Leads no mês" value={metricas.mes} />
        <MetricCard label="Conversão" value={`${metricas.conv}%`} />
        <MetricCard label="Pipeline" value={`R$ ${metricas.pipeline.toLocaleString("pt-BR")}`} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {STATUS_COLUNAS.map((col) => {
            const items = visibleLeads.filter((l) => l.status === col.key);
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
                        {!portfolioId && (
                          <div className="text-xs text-muted-foreground truncate">
                            {portfolioNames.get(l.portfolio_id) ?? "Cliente"}
                          </div>
                        )}
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

      <LeadDetailSheet lead={selected} portfolioId={selected?.portfolio_id ?? portfolioId ?? ""} open={sheetOpen} onOpenChange={setSheetOpen} />
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
