import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, MoreHorizontal, Loader2, BarChart3, Pencil, Copy, Trash2,
  Pause, Play, RefreshCw, TrendingUp, DollarSign, Eye, MousePointer,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CampanhaDialog } from "./CampanhaDialog";
import { syncMetaIntegration } from "@/dashboard/useMetaPortfolios";
import { OBJETIVOS, STATUS_COLORS, STATUS_LABEL, type MetaCampanha } from "./types";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

function defaultDates() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end };
}

type Agg = { spend: number; impressions: number; clicks: number; results: number; reach: number };

export default function CampanhasModule({
  portfolioId,
  onOpenMetricas,
}: {
  portfolioId: string;
  onOpenMetricas?: (campaignId: string) => void;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [source, setSource] = useState<"meta_ads" | "google_ads">("meta_ads");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<MetaCampanha | null>(null);
  const [selected, setSelected] = useState<MetaCampanha | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MetaCampanha | null>(null);
  const [syncing, setSyncing] = useState(false);

  const def = defaultDates();
  const [dateStart, setDateStart] = useState(def.start);
  const [dateEnd, setDateEnd] = useState(def.end);
  const [periodo, setPeriodo] = useState("30d");

  function aplicarPeriodo(p: string) {
    setPeriodo(p);
    if (p === "custom") return;
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    if (p === "today") {
      setDateStart(end);
      setDateEnd(end);
      return;
    }
    const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
    const s = new Date(today);
    s.setDate(s.getDate() - days);
    setDateStart(s.toISOString().slice(0, 10));
    setDateEnd(end);
  }

  const { data: integIds = [] } = useQuery({
    queryKey: ["integ-ids", portfolioId],
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_integracoes")
        .select("id")
        .eq("portfolio_id", portfolioId);
      return (data ?? []).map((i) => i.id);
    },
  });

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-meta", portfolioId],
    queryFn: async (): Promise<MetaCampanha[]> => {
      if (integIds.length === 0) return [];
      const { data, error } = await supabase
        .from("meta_campanhas")
        .select("*")
        .in("integration_id", integIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MetaCampanha[];
    },
    enabled: integIds.length > 0 && source === "meta_ads",
  });

  const { data: metricas = [] } = useQuery({
    queryKey: ["campanhas-metricas", portfolioId, dateStart, dateEnd],
    queryFn: async () => {
      if (integIds.length === 0) return [];
      let q = supabase
        .from("meta_metricas_campanhas")
        .select("campaign_id, spend, impressions, clicks, results, reach")
        .in("integration_id", integIds);
      if (dateStart) q = q.gte("date", dateStart);
      if (dateEnd) q = q.lte("date", dateEnd);
      const { data } = await q;
      return data ?? [];
    },
    enabled: integIds.length > 0,
  });

  const metricsByCampaign = useMemo(() => {
    const map: Record<string, Agg> = {};
    for (const m of metricas) {
      const key = m.campaign_id;
      if (!map[key]) map[key] = { spend: 0, impressions: 0, clicks: 0, results: 0, reach: 0 };
      map[key].spend += Number(m.spend ?? 0);
      map[key].impressions += Number(m.impressions ?? 0);
      map[key].clicks += Number(m.clicks ?? 0);
      map[key].results += Number(m.results ?? 0);
      map[key].reach += Number(m.reach ?? 0);
    }
    return map;
  }, [metricas]);

  const totais = useMemo(() => {
    const t: Agg = { spend: 0, impressions: 0, clicks: 0, results: 0, reach: 0 };
    for (const m of Object.values(metricsByCampaign)) {
      t.spend += m.spend;
      t.impressions += m.impressions;
      t.clicks += m.clicks;
      t.results += m.results;
      t.reach += m.reach;
    }
    return t;
  }, [metricsByCampaign]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return campanhas;
    return campanhas.filter((c) => (c.status ?? "").toUpperCase() === statusFilter);
  }, [campanhas, statusFilter]);

  async function handleSync() {
    if (integIds.length === 0) return toast.error("Nenhuma integração Meta configurada.");
    setSyncing(true);
    try {
      await Promise.all(integIds.map((id) => syncMetaIntegration(id, dateStart, dateEnd)));
      toast.success("Dados sincronizados com sucesso!");
      qc.invalidateQueries({ queryKey: ["campanhas-meta", portfolioId] });
      qc.invalidateQueries({ queryKey: ["campanhas-metricas", portfolioId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function toggleStatus(c: MetaCampanha) {
    const next = (c.status ?? "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const { error } = await supabase.from("meta_campanhas").update({ status: next }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(next === "ACTIVE" ? "Campanha ativada" : "Campanha pausada");
    qc.invalidateQueries({ queryKey: ["campanhas-meta", portfolioId] });
  }

  async function duplicate(c: MetaCampanha) {
    const { error } = await supabase.from("meta_campanhas").insert({
      integration_id: c.integration_id,
      campaign_id: `local_${Date.now()}`,
      campaign_name: `Cópia de ${c.campaign_name}`,
      status: "PAUSED",
      objective: c.objective,
      orcamento_diario: c.orcamento_diario,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
      observacoes: c.observacoes,
    });
    if (error) return toast.error(error.message);
    toast.success("Campanha duplicada");
    qc.invalidateQueries({ queryKey: ["campanhas-meta", portfolioId] });
  }

  async function remove(c: MetaCampanha) {
    const { error } = await supabase.from("meta_campanhas").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Campanha excluída");
    setConfirmDelete(null);
    qc.invalidateQueries({ queryKey: ["campanhas-meta", portfolioId] });
  }

  const objetivoLabel = (v: string | null) =>
    OBJETIVOS.find((o) => o.value === v)?.label ?? v ?? "—";

  const kpis = [
    { icon: DollarSign, label: "Gasto no período", value: fmtBRL(totais.spend), accent: true },
    { icon: TrendingUp, label: "Resultados", value: fmtNum(totais.results) },
    { icon: Eye, label: "Impressões", value: fmtNum(totais.impressions) },
    { icon: MousePointer, label: "Cliques", value: fmtNum(totais.clicks) },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={source} onValueChange={(v) => setSource(v as any)}>
          <TabsList>
            <TabsTrigger value="meta_ads">Meta Ads</TabsTrigger>
            <TabsTrigger value="google_ads" disabled>Google Ads (em breve)</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="gap-2">
            {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setOpenDialog(true); }} className="gap-2" size="sm">
              <Plus size={14} /> Nova Campanha
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={periodo} onValueChange={aplicarPeriodo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data início</Label>
            <Input
              type="date"
              value={dateStart}
              onChange={(e) => { setDateStart(e.target.value); setPeriodo("custom"); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data fim</Label>
            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => { setDateEnd(e.target.value); setPeriodo("custom"); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACTIVE">Ativas</SelectItem>
                <SelectItem value="PAUSED">Pausadas</SelectItem>
                <SelectItem value="ARCHIVED">Encerradas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} campanha(s)
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={`p-4 ${k.accent ? "bg-gradient-to-br from-primary/15 to-transparent border-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</span>
              <k.icon size={14} className={k.accent ? "text-primary" : "text-muted-foreground"} />
            </div>
            <div className="text-xl lg:text-2xl font-bold tracking-tight">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Objetivo</TableHead>
                <TableHead className="text-right">Gasto no período</TableHead>
                <TableHead className="text-right">Resultados</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhuma campanha encontrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => {
                const st = (c.status ?? "").toUpperCase();
                const m = metricsByCampaign[c.campaign_id] ?? { spend: 0, impressions: 0, clicks: 0, results: 0, reach: 0 };
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(c)}
                  >
                    <TableCell className="font-medium">{c.campaign_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[st] ?? "bg-muted"}>
                        {STATUS_LABEL[st] ?? st ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell" className="text-sm">{objetivoLabel(c.objective)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtBRL(m.spend)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtNum(m.results)}</TableCell>
                    <TableCell className="hidden md:table-cell" className="text-right text-sm">{fmtNum(m.impressions)}</TableCell>
                    <TableCell className="hidden md:table-cell" className="text-right text-sm">{fmtNum(m.clicks)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onOpenMetricas && (
                            <DropdownMenuItem onClick={() => onOpenMetricas(c.campaign_id)}>
                              <BarChart3 size={14} className="mr-2" /> Ver métricas
                            </DropdownMenuItem>
                          )}
                          {isAdmin && (
                            <>
                              <DropdownMenuItem onClick={() => { setEditing(c); setOpenDialog(true); }}>
                                <Pencil size={14} className="mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleStatus(c)}>
                                {st === "ACTIVE" ? (
                                  <><Pause size={14} className="mr-2" /> Pausar</>
                                ) : (
                                  <><Play size={14} className="mr-2" /> Ativar</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicate(c)}>
                                <Copy size={14} className="mr-2" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmDelete(c)}
                              >
                                <Trash2 size={14} className="mr-2" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-auto">
          <SheetHeader>
            <SheetTitle>{selected?.campaign_name}</SheetTitle>
          </SheetHeader>
          {selected && (() => {
            const m = metricsByCampaign[selected.campaign_id] ?? { spend: 0, impressions: 0, clicks: 0, results: 0, reach: 0 };
            return (
              <div className="space-y-3 mt-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Métricas de {dateStart} até {dateEnd}
                </p>
                <Row label="Status" value={STATUS_LABEL[(selected.status ?? "").toUpperCase()] ?? selected.status ?? "—"} />
                <Row label="Objetivo" value={objetivoLabel(selected.objective)} />
                <Row label="Orçamento diário" value={selected.orcamento_diario ? fmtBRL(selected.orcamento_diario) : "—"} />
                <Row label="Início" value={selected.data_inicio ?? "—"} />
                <Row label="Fim" value={selected.data_fim ?? "—"} />
                <Row label="Gasto no período" value={fmtBRL(m.spend)} />
                <Row label="Resultados" value={fmtNum(m.results)} />
                <Row label="Impressões" value={fmtNum(m.impressions)} />
                <Row label="Cliques" value={fmtNum(m.clicks)} />
                <Row label="Alcance" value={fmtNum(m.reach)} />
                <Row
                  label="Custo por resultado"
                  value={m.results > 0 ? fmtBRL(m.spend / m.results) : "—"}
                />
                <Row label="ID Meta" value={selected.campaign_id} />
                {selected.observacoes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="whitespace-pre-wrap">{selected.observacoes}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      <CampanhaDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        portfolioId={portfolioId}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["campanhas-meta", portfolioId] })}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.campaign_name}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
