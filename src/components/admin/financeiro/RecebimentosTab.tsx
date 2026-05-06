import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search } from "lucide-react";
import {
  BRL, formatDateBR, RECEIVABLE_STATUS_LABEL, statusBadgeClass, effectiveStatus,
} from "@/lib/financeiro";
import { RecebimentoDialog, type RecebimentoEdit } from "./RecebimentoDialog";

export function RecebimentosTab() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [clienteFilter, setClienteFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [editing, setEditing] = useState<RecebimentoEdit>(null);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios-mini"],
    queryFn: async () => {
      const { data } = await sb.from("portfolios").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["financial-receivables", mes, statusFilter, clienteFilter],
    queryFn: async () => {
      const [y, m] = mes.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = new Date(y, m, 0).toISOString().slice(0, 10);

      let q = sb
        .from("financial_receivables")
        .select(`
          id, service_id, participant_user_id, portfolio_id,
          valor_previsto, valor_recebido, data_prevista, data_recebimento,
          status, forma_pagamento, observacoes,
          portfolios:portfolio_id(name),
          financial_services:service_id(nome)
        `)
        .gte("data_prevista", start)
        .lte("data_prevista", end)
        .order("data_prevista");

      if (statusFilter !== "todos") q = q.eq("status", statusFilter as any);
      if (clienteFilter !== "todos") q = q.eq("portfolio_id", clienteFilter);

      const { data, error } = await q;
      if (error) throw error;

      // Buscar nomes de participantes
      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.participant_user_id)));
      const profilesMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await sb
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        for (const p of profs ?? []) profilesMap.set(p.user_id, p.display_name ?? "");
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        cliente_nome: r.portfolios?.name ?? "—",
        servico_nome: r.financial_services?.nome ?? "—",
        participante_nome: profilesMap.get(r.participant_user_id) ?? r.participant_user_id.slice(0, 8),
      }));
    },
  });

  const filtrados = useMemo(() => {
    if (!busca.trim()) return items;
    const s = busca.toLowerCase();
    return items.filter(
      (r: any) =>
        r.cliente_nome.toLowerCase().includes(s) ||
        r.servico_nome.toLowerCase().includes(s) ||
        r.participante_nome.toLowerCase().includes(s),
    );
  }, [items, busca]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["financial-receivables"] });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={clienteFilter} onValueChange={setClienteFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {portfolios.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(RECEIVABLE_STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, serviço..." />
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Participante</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum recebimento.
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((r: any) => {
                const eff = effectiveStatus(r.status, r.data_prevista);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setEditing(r)}
                  >
                    <TableCell className="font-medium">{r.cliente_nome}</TableCell>
                    <TableCell className="text-sm">{r.servico_nome}</TableCell>
                    <TableCell className="text-sm">{r.participante_nome}</TableCell>
                    <TableCell className="text-right font-medium">
                      {BRL(r.valor_recebido ?? r.valor_previsto)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateBR(r.data_prevista)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(eff)}>
                        {RECEIVABLE_STATUS_LABEL[eff]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <RecebimentoDialog rec={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}
