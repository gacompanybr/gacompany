import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, Wallet, CalendarClock, Users, TrendingDown, TrendingUp } from "lucide-react";
import { Loader2 } from "lucide-react";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [clientesRes, servicosRes, recebRes, leadsRes, custosRes] = await Promise.all([
        supabase.from("portfolios").select("id, status"),
        supabase.from("financial_services").select("valor_total, status"),
        supabase
          .from("financial_receivables")
          .select("valor_previsto, valor_recebido, status, data_prevista")
          .gte("data_prevista", firstDay)
          .lte("data_prevista", lastDay),
        supabase.from("crm_leads").select("id, status, created_at").gte("created_at", firstDay),
        supabase
          .from("financial_costs")
          .select("valor, tipo, data_referencia, ativo")
          .eq("ativo", true),
      ]);

      const clientesAtivos = (clientesRes.data ?? []).filter((c: any) => c.status === "active").length;
      const mrr = (servicosRes.data ?? [])
        .filter((s: any) => s.status === "ativo")
        .reduce((sum: number, s: any) => sum + Number(s.valor_total ?? 0), 0);
      const recebMes = (recebRes.data ?? []).reduce(
        (sum: number, r: any) => sum + Number(r.valor_previsto ?? 0), 0,
      );
      const recebPendentes = (recebRes.data ?? []).filter((r: any) => r.status === "pendente").length;
      const leadsNovos = (leadsRes.data ?? []).length;

      return { clientesAtivos, mrr, recebMes, recebPendentes, leadsNovos };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  const cards = [
    { label: "Clientes ativos", value: String(data.clientesAtivos), icon: Building2 },
    { label: "MRR estimado", value: brl(data.mrr), icon: Wallet },
    { label: "A receber no mês", value: brl(data.recebMes), icon: CalendarClock, sub: `${data.recebPendentes} pendentes` },
    { label: "Leads novos no mês", value: String(data.leadsNovos), icon: Users },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className="text-primary" size={16} />
            </div>
            <p className="text-2xl font-semibold">{c.value}</p>
            {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-6 text-sm text-muted-foreground">
        Use a aba <strong className="text-foreground">Calendário</strong> para visualizar
        recebimentos, posts agendados e compromissos do mês.
      </Card>
    </div>
  );
}
