import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, Wallet, CalendarClock, Users, TrendingDown, TrendingUp, Eye, EyeOff } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DashboardTab() {
  const { hasPermission } = useAuth();
  const [valuesVisible, setValuesVisible] = useState(false);
  const privateValue = (value: string) => valuesVisible ? value : "*****";
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

      const canSeeFinance = hasPermission("finance.view");
      const [clientesRes, servicosRes, recebRes, leadsRes, custosRes] = await Promise.all([
        supabase.from("portfolios").select("id, status"),
        canSeeFinance ? supabase.from("financial_services").select("valor_total, status") : Promise.resolve({ data: [] }),
        canSeeFinance ? supabase
          .from("financial_receivables")
          .select("valor_previsto, valor_recebido, status, data_prevista")
          .gte("data_prevista", firstDay)
          .lte("data_prevista", lastDay) : Promise.resolve({ data: [] }),
        supabase.from("crm_leads").select("id, status, created_at").gte("created_at", firstDay),
        canSeeFinance ? supabase
          .from("financial_costs")
          .select("valor, tipo, data_referencia, ativo")
          .eq("ativo", true) : Promise.resolve({ data: [] }),
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
    enabled: hasPermission("dashboard.view") || hasPermission("finance.view"),
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  const canSeeFinance = hasPermission("finance.view");
  const cards = [
    { label: "Clientes ativos", value: String(data.clientesAtivos), icon: Building2 },
    ...(canSeeFinance ? [
      { label: "MRR estimado", value: brl(data.mrr), icon: Wallet },
      { label: "A receber no mês", value: brl(data.recebMes), icon: CalendarClock, sub: `${data.recebPendentes} pendentes` },
    ] : []),
    { label: "Leads novos no mês", value: String(data.leadsNovos), icon: Users },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setValuesVisible((visible) => !visible)}
          aria-label={valuesVisible ? "Ocultar valores" : "Mostrar valores"}
        >
          {valuesVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>{valuesVisible ? "Ocultar valores" : "Mostrar valores"}</span>
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className="text-primary" size={16} />
            </div>
            <p className={`break-words text-xl font-semibold sm:text-2xl ${valuesVisible ? "" : "blur-[1px] select-none"}`}>{privateValue(c.value)}</p>
            {c.sub && <p className={`text-xs text-muted-foreground ${valuesVisible ? "" : "blur-[1px] select-none"}`}>{privateValue(c.sub)}</p>}
          </Card>
        ))}
      </div>

      {canSeeFinance && <Card className="space-y-4 p-3 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Resumo financeiro do mês</h2>
          <TrendingUp className="text-primary" size={16} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Faturamento bruto</div>
            <div className={`break-words text-lg font-bold sm:text-xl ${valuesVisible ? "" : "blur-[1px] select-none"}`}>{privateValue(brl(data.brutoMes))}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown size={12} /> Custos do mês
            </div>
            <div className={`break-words text-lg font-bold text-destructive sm:text-xl ${valuesVisible ? "" : "blur-[1px] select-none"}`}>{valuesVisible ? `- ${brl(data.custosMes)}` : "*****"}</div>
            <div className={`text-[11px] text-muted-foreground ${valuesVisible ? "" : "blur-[1px] select-none"}`}>
              {valuesVisible ? `${brl(data.custosMensais)} mensais + ${brl(data.custosUnicos)} únicos` : "*****"}
            </div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Líquido do mês</div>
            <div
              className={`text-xl font-bold ${
                data.liquidoMes >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              <span className={valuesVisible ? "" : "blur-[1px] select-none"}>{privateValue(brl(data.liquidoMes))}</span>
            </div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">MRR líquido</div>
            <div
              className={`text-xl font-bold ${
                data.mrrLiquido >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              <span className={valuesVisible ? "" : "blur-[1px] select-none"}>{privateValue(brl(data.mrrLiquido))}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {valuesVisible ? `MRR ${brl(data.mrr)} − custos recorrentes` : <span className="blur-[1px] select-none">*****</span>}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Cadastre os custos na aba <strong className="text-foreground">Financeiro › Custos</strong>.
          Use a aba <strong className="text-foreground">Calendário</strong> para ver recebimentos e
          compromissos do mês.
        </p>
      </Card>}
    </div>
  );
}
