import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Copy, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  BRL, BILLING_LABEL, SERVICE_STATUS_LABEL, formatDateBR, statusBadgeClass,
  generateOccurrences,
} from "@/lib/financeiro";
import { ServicoFinanceiroDialog } from "./ServicoFinanceiroDialog";

type ServiceRow = {
  id: string;
  portfolio_id: string;
  category_id: string | null;
  nome: string;
  descricao: string | null;
  valor_total: number;
  tipo_cobranca: "mensal" | "unico" | "trimestral";
  dia_vencimento: number | null;
  data_inicio: string;
  status: "ativo" | "pausado" | "finalizado";
  observacoes: string | null;
  portfolios?: { name: string } | null;
  financial_categories?: { nome: string; cor: string } | null;
  participants_count?: number;
};

export function ServicosTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["financial-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_services")
        .select(`
          id, portfolio_id, category_id, nome, descricao, valor_total,
          tipo_cobranca, dia_vencimento, data_inicio, status, observacoes,
          portfolios:portfolio_id(name),
          financial_categories:category_id(nome, cor)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Conta participantes
      const ids = (data ?? []).map((s: any) => s.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: parts } = await supabase
          .from("financial_service_participants")
          .select("service_id")
          .in("service_id", ids);
        for (const p of parts ?? []) {
          counts[p.service_id] = (counts[p.service_id] ?? 0) + 1;
        }
      }
      return (data ?? []).map((s: any) => ({
        ...s,
        participants_count: counts[s.id] ?? 0,
      })) as ServiceRow[];
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["financial-services"] });
    qc.invalidateQueries({ queryKey: ["financial-receivables"] });
  }

  async function remove(s: ServiceRow) {
    if (!confirm(`Excluir "${s.nome}" e todos os recebimentos vinculados?`)) return;
    const { error } = await supabase.from("financial_services").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Serviço excluído");
    refresh();
  }

  async function duplicate(s: ServiceRow) {
    const { data: parts } = await supabase
      .from("financial_service_participants")
      .select("user_id, percentual")
      .eq("service_id", s.id);

    const { data: created, error } = await supabase
      .from("financial_services")
      .insert({
        portfolio_id: s.portfolio_id,
        category_id: s.category_id,
        nome: `${s.nome} (cópia)`,
        descricao: s.descricao,
        valor_total: s.valor_total,
        tipo_cobranca: s.tipo_cobranca,
        dia_vencimento: s.dia_vencimento,
        data_inicio: s.data_inicio,
        status: s.status,
        observacoes: s.observacoes,
      })
      .select("id")
      .single();

    if (error || !created) return toast.error(error?.message ?? "Falha");

    if (parts?.length) {
      await supabase.from("financial_service_participants").insert(
        parts.map((p: any) => ({
          service_id: created.id,
          user_id: p.user_id,
          percentual: p.percentual,
        })),
      );

      const dates = generateOccurrences({
        tipo_cobranca: s.tipo_cobranca,
        data_inicio: s.data_inicio,
        dia_vencimento: s.dia_vencimento,
        count: 12,
      });
      const novos: any[] = [];
      for (const d of dates) {
        for (const p of parts) {
          novos.push({
            service_id: created.id,
            participant_user_id: p.user_id,
            portfolio_id: s.portfolio_id,
            valor_previsto: (Number(s.valor_total) * Number(p.percentual)) / 100,
            data_prevista: d,
            status: "pendente",
          });
        }
      }
      if (novos.length) await supabase.from("financial_receivables").insert(novos);
    }

    toast.success("Serviço duplicado");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-2">
          <Plus size={14} /> Novo serviço
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : servicos.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nenhum serviço financeiro cadastrado ainda.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servicos.map((s) => (
            <Card key={s.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">
                    {s.portfolios?.name ?? "—"}
                  </div>
                  <div className="font-semibold truncate">{s.nome}</div>
                </div>
                <Badge variant="outline" className={statusBadgeClass(s.status)}>
                  {SERVICE_STATUS_LABEL[s.status]}
                </Badge>
              </div>

              <div>
                <div className="text-2xl font-bold text-primary">{BRL(s.valor_total)}</div>
                <div className="text-xs text-muted-foreground">
                  {BILLING_LABEL[s.tipo_cobranca]}
                  {s.tipo_cobranca === "mensal" && s.dia_vencimento
                    ? ` · todo dia ${s.dia_vencimento}`
                    : ""}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {s.financial_categories && (
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: s.financial_categories.cor,
                      color: s.financial_categories.cor,
                    }}
                  >
                    {s.financial_categories.nome}
                  </Badge>
                )}
                <Badge variant="secondary" className="gap-1">
                  <Users size={10} /> {s.participants_count} participante{s.participants_count === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                Início: {formatDateBR(s.data_inicio)}
              </div>

              <div className="flex gap-2 mt-auto pt-2">
                <Button
                  variant="outline" size="sm" className="flex-1 gap-1"
                  onClick={() => { setEditing(s); setOpen(true); }}
                >
                  <Pencil size={12} /> Editar
                </Button>
                <Button variant="outline" size="icon" onClick={() => duplicate(s)} title="Duplicar">
                  <Copy size={14} />
                </Button>
                <Button variant="outline" size="icon" onClick={() => remove(s)} title="Excluir">
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ServicoFinanceiroDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={refresh}
      />
    </div>
  );
}
