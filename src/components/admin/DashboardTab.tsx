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

      const custos = custosRes.data ?? [];
      const custosMensais = custos
        .filter((c: any) => c.tipo === "mensal")
        .reduce((sum: number, c: any) => sum + Number(c.valor ?? 0), 0);
      const custosUnicos = custos
        .filter(
          (c: any) =>
            c.tipo === "unico" &&
            String(c.data_referencia ?? "") >= firstDay &&
            String(c.data_referencia ?? "") <= lastDay,
        )
        .reduce((sum: number, c: any) => sum + Number(c.valor ?? 0), 0);
      const custosMes = custosMensais + custosUnicos;

      const brutoMes = recebMes;
      const liquidoMes = brutoMes - custosMes;
      const mrrLiquido = mrr - custosMensais;

      return {
        clientesAtivos, mrr, recebMes, recebPendentes, leadsNovos,
        custosMensais, custosUnicos, custosMes, brutoMes, liquidoMes, mrrLiquido,
      };
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

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Resumo financeiro do mês</h2>
          <TrendingUp className="text-primary" size={16} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Faturamento bruto</div>
            <div className="text-xl font-bold">{brl(data.brutoMes)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown size={12} /> Custos do mês
            </div>
            <div className="text-xl font-bold text-red-400">- {brl(data.custosMes)}</div>
            <div className="text-[11px] text-muted-foreground">
              {brl(data.custosMensais)} mensais + {brl(data.custosUnicos)} únicos
            </div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Líquido do mês</div>
            <div
              className={`text-xl font-bold ${
                data.liquidoMes >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {brl(data.liquidoMes)}
            </div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">MRR líquido</div>
            <div
              className={`text-xl font-bold ${
                data.mrrLiquido >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {brl(data.mrrLiquido)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              MRR {brl(data.mrr)} − custos recorrentes
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Cadastre os custos na aba <strong className="text-foreground">Financeiro › Custos</strong>.
          Use a aba <strong className="text-foreground">Calendário</strong> para ver recebimentos e
          compromissos do mês.
        </p>
      </Card>
    </div>
  );
}
