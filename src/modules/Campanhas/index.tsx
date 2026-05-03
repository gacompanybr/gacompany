import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
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
  Plus, MoreHorizontal, Loader2, BarChart3, Pencil, Copy, Trash2, Pause, Play,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CampanhaDialog } from "./CampanhaDialog";
import { OBJETIVOS, STATUS_COLORS, STATUS_LABEL, type MetaCampanha } from "./types";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CampanhasModule({
  portfolioId, onOpenMetricas,
}: {
  portfolioId: string;
  onOpenMetricas?: (campaignId: string) => void;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [source, setSource] = useState<"meta_ads" | "google_ads">("meta_ads");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<MetaCampanha | null>(null);
  const [selected, setSelected] = useState<MetaCampanha | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MetaCampanha | null>(null);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-meta", portfolioId],
    queryFn: async (): Promise<MetaCampanha[]> => {
      // Buscar integrações do portfolio
      const { data: ints } = await supabase
        .from("meta_integracoes")
        .select("id")
        .eq("portfolio_id", portfolioId);
      const ids = (ints ?? []).map((i) => i.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("meta_campanhas")
        .select("*")
        .in("integration_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MetaCampanha[];
    },
    enabled: source === "meta_ads",
  });

  // Gastos por campanha (somatório de spend)
  const { data: spendByCampaign = {} } = useQuery({
    queryKey: ["campanhas-spend", portfolioId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: ints } = await supabase
        .from("meta_integracoes").select("id").eq("portfolio_id", portfolioId);
      const ids = (ints ?? []).map((i) => i.id);
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from("meta_metricas_campanhas")
        .select("campaign_id, spend")
        .in("integration_id", ids);
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        map[r.campaign_id] = (map[r.campaign_id] ?? 0) + Number(r.spend ?? 0);
      }
      return map;
    },
    enabled: source === "meta_ads",
  });

  const filtered = useMemo(() => {
    if (statusFilter === "all") return campanhas;
    return campanhas.filter((c) => (c.status ?? "").toUpperCase() === statusFilter);
  }, [campanhas, statusFilter]);

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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="ACTIVE">Ativas</SelectItem>
              <SelectItem value="PAUSED">Pausadas</SelectItem>
              <SelectItem value="ARCHIVED">Encerradas</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setOpenDialog(true); }} className="gap-2">
              <Plus size={14} /> Nova Campanha
            </Button>
          )}
        </div>
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
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead className="text-right">Orçamento diário</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Gasto total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma campanha encontrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => {
                const st = (c.status ?? "").toUpperCase();
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
                    <TableCell className="text-sm">{objetivoLabel(c.objective)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {c.orcamento_diario ? fmtBRL(c.orcamento_diario) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.data_inicio ?? "—"} {c.data_fim ? `→ ${c.data_fim}` : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtBRL(spendByCampaign[c.campaign_id] ?? 0)}
                    </TableCell>
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

      {/* Sheet de detalhes */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-auto">
          <SheetHeader>
            <SheetTitle>{selected?.campaign_name}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-3 mt-4 text-sm">
              <Row label="Status" value={STATUS_LABEL[(selected.status ?? "").toUpperCase()] ?? selected.status ?? "—"} />
              <Row label="Objetivo" value={objetivoLabel(selected.objective)} />
              <Row label="Orçamento diário" value={selected.orcamento_diario ? fmtBRL(selected.orcamento_diario) : "—"} />
              <Row label="Início" value={selected.data_inicio ?? "—"} />
              <Row label="Fim" value={selected.data_fim ?? "—"} />
              <Row label="Gasto total" value={fmtBRL(spendByCampaign[selected.campaign_id] ?? 0)} />
              <Row label="ID Meta" value={selected.campaign_id} />
              {selected.observacoes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="whitespace-pre-wrap">{selected.observacoes}</p>
                </div>
              )}
            </div>
          )}
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
              "{confirmDelete?.campaign_name}" será removida. Essa ação não pode ser desfeita.
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
