import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  BRL, formatDateBR, RECEIVABLE_STATUS_LABEL, statusBadgeClass, effectiveStatus,
} from "@/lib/financeiro";
import {
  RecebimentoDialog, type RecebimentoEdit,
} from "@/components/admin/financeiro/RecebimentoDialog";

export default function FinanceiroModule({ portfolioId }: { portfolioId: string }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<RecebimentoEdit>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["financeiro-workspace", portfolioId, mes, isAdmin, user?.id],
    queryFn: async () => {
      const [y, m] = mes.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = new Date(y, m, 0).toISOString().slice(0, 10);

      let q = supabase
        .from("financial_receivables")
        .select(`
          id, service_id, participant_user_id, portfolio_id,
          valor_previsto, valor_recebido, data_prevista, data_recebimento,
          status, forma_pagamento, observacoes,
          financial_services:service_id(nome)
        `)
        .eq("portfolio_id", portfolioId)
        .gte("data_prevista", start)
        .lte("data_prevista", end)
        .order("data_prevista");

      // Usuário comum: só os recebimentos dele (RLS já garante, mas filtra explicitamente)
      if (!isAdmin && user?.id) {
        q = q.eq("participant_user_id", user.id);
      }

      const { data, error } = await q;
      if (error) throw error;

      const userIds = Array.from(new Set((data ?? []).map((r: any) => r.participant_user_id)));
      const profilesMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        for (const p of profs ?? []) profilesMap.set(p.user_id, p.display_name ?? "");
      }

      return (data ?? []).map((r: any) => ({
        ...r,
        servico_nome: r.financial_services?.nome ?? "—",
        participante_nome: profilesMap.get(r.participant_user_id) ?? "",
      }));
    },
  });

  const kpis = useMemo(() => {
    let aReceber = 0;
    let recebido = 0;
    let atrasado = 0;
    for (const r of items as any[]) {
      const eff = effectiveStatus(r.status, r.data_prevista);
      if (eff === "recebido" || eff === "parcial") {
        recebido += Number(r.valor_recebido ?? r.valor_previsto) || 0;
      } else if (eff === "atrasado") {
        atrasado += Number(r.valor_previsto) || 0;
      } else if (eff === "pendente") {
        aReceber += Number(r.valor_previsto) || 0;
      }
    }
    return { aReceber, recebido, atrasado };
  }, [items]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["financeiro-workspace"] });
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Visualizando todos os recebimentos deste cliente."
            : "Seus recebimentos vinculados a este cliente."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">A receber este mês</div>
          <div className="text-2xl font-bold text-yellow-400">{BRL(kpis.aReceber)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Recebido este mês</div>
          <div className="text-2xl font-bold text-green-400">{BRL(kpis.recebido)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Atrasado</div>
          <div className="text-2xl font-bold text-red-400">{BRL(kpis.atrasado)}</div>
        </Card>
      </div>

      <Card className="p-4 max-w-xs">
        <Label className="text-xs">Mês</Label>
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum recebimento neste período.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {(items as any[]).map((r) => {
              const eff = effectiveStatus(r.status, r.data_prevista);
              const isMine = r.participant_user_id === user?.id;
              return (
                <li
                  key={r.id}
                  className={`p-4 flex items-center gap-3 hover:bg-muted/30 ${
                    isMine || isAdmin ? "cursor-pointer" : ""
                  }`}
                  onClick={() => (isMine || isAdmin) && setEditing(r)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.servico_nome}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Vencimento {formatDateBR(r.data_prevista)}
                      {isAdmin && r.participante_nome ? ` · ${r.participante_nome}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {BRL(r.valor_recebido ?? r.valor_previsto)}
                    </div>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${statusBadgeClass(eff)}`}>
                      {RECEIVABLE_STATUS_LABEL[eff]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <RecebimentoDialog rec={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}
