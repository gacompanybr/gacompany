import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Target, DollarSign, Wallet, Eye, Users, TrendingUp,
  TrendingDown, Activity, Calendar, RefreshCw, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, AreaChart, Area,
} from "recharts";
import { defaultTheme } from "@/dashboard/types";
import { useCombinedPortfolios } from "@/dashboard/useCombinedPortfolios";
import { triggerSync } from "@/dashboard/useDbPortfolios";
import { syncMetaIntegration } from "@/dashboard/useMetaPortfolios";
import { applyTheme, resetTheme } from "@/dashboard/theme";
import { useAuth } from "@/hooks/useAuth";
import { Settings, LogOut, LogIn } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import gaLogo from "@/assets/logo.png";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

function KpiCard({
  icon: Icon, label, value, hint, accent = false, delta,
}: { icon: any; label: string; value: string; hint?: string; accent?: boolean; delta?: number | null }) {
  const showDelta = typeof delta === "number" && isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className={`p-5 border-border/60 ${accent ? "bg-gradient-to-br from-primary/15 to-transparent border-primary/40" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`p-2 rounded-lg ${accent ? "bg-primary/20" : "bg-muted"}`}>
          <Icon size={16} className={accent ? "text-primary" : "text-muted-foreground"} />
        </div>
      </div>
      <div className="text-2xl lg:text-3xl font-bold tracking-tight">{value}</div>
      {showDelta && (
        <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${positive ? "text-emerald-500" : "text-red-500"}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {positive ? "+" : ""}{delta!.toFixed(0)}%
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{hint}</p>}
    </Card>
  );
}

type DashboardProps = { portfolioId?: string; embedded?: boolean };

const Dashboard = ({ portfolioId: lockedPortfolioId, embedded = false }: DashboardProps = {}) => {
  const { portfolios: allPortfolios, isLoading } = useCombinedPortfolios();
  const portfolios = lockedPortfolioId
    ? allPortfolios.filter((p) => p.id === lockedPortfolioId)
    : allPortfolios;
  const queryClient = useQueryClient();
  const { user, isAdmin, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [portfolioId, setPortfolioId] = useState<string>(lockedPortfolioId ?? "");
  const [sourceTab, setSourceTab] = useState<"meta_ads" | "google_ads">("meta_ads");
  const [accountId, setAccountId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [period, setPeriod] = useState("custom");

  // Pick first portfolio once data arrives
  useEffect(() => {
    if (!portfolioId && portfolios[0]) setPortfolioId(portfolios[0].id);
  }, [portfolios, portfolioId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const accId = accountId !== "all" ? accountId : undefined;
      const res: any = await triggerSync(accId, 30);
      const summary = res?.results?.[0];
      if (summary?.error) {
        toast.error(`Falha na sincronização: ${summary.error}`);
      } else {
        toast.success(
          `Sincronizado: ${summary?.campaigns ?? 0} campanhas, ${summary?.metric_rows ?? 0} dias.`,
        );
        await queryClient.invalidateQueries({ queryKey: ["portfolios-with-data"] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // Atualizar dados Meta Ads — chama edge function para cada integração do portfólio atual
  const handleSyncMeta = async () => {
    if (!portfolio) return;
    const metaAccounts = portfolio.accounts.filter((a) => a.source === "meta_ads");
    const ids = accountId === "all"
      ? metaAccounts.map((a) => a.id)
      : metaAccounts.filter((a) => a.id === accountId).map((a) => a.id);
    if (ids.length === 0) return toast.error("Nenhuma integração Meta para sincronizar.");
    setSyncing(true);
    try {
      const dateFrom = start || undefined;
      const dateTo = end || undefined;
      const results = await Promise.allSettled(
        ids.map((id) => syncMetaIntegration(id, dateFrom, dateTo)),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      if (fail > 0) {
        const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        toast.error(`Falha em ${fail} integração(ões): ${firstErr?.reason?.message ?? "erro desconhecido"}`);
      }
      if (ok > 0) {
        toast.success(`Atualizado: ${ok} integração(ões) Meta Ads.`);
        await queryClient.invalidateQueries({ queryKey: ["meta-portfolios"] });
      }
    } finally {
      setSyncing(false);
    }
  };



  const portfolio = useMemo(
    () => portfolios.find((p) => p.id === portfolioId) ?? portfolios[0],
    [portfolios, portfolioId]
  );

  // Apply branded theme on account selection
  useEffect(() => {
    if (!portfolio) return resetTheme();
    if (accountId !== "all") applyTheme(portfolio.theme);
    else applyTheme(defaultTheme);
    return () => resetTheme();
  }, [portfolio, accountId]);

  const allPortfolioAccounts = portfolio?.accounts ?? [];
  const hasMeta = allPortfolioAccounts.some((a) => a.source !== "google_ads");
  const hasGoogle = allPortfolioAccounts.some((a) => a.source === "google_ads");
  const accounts = allPortfolioAccounts.filter((a) =>
    sourceTab === "google_ads" ? a.source === "google_ads" : a.source !== "google_ads",
  );
  const activeAccounts = accountId === "all" ? accounts : accounts.filter((a) => a.id === accountId);

  // Auto-switch tab if current source has no accounts
  useEffect(() => {
    if (sourceTab === "meta_ads" && !hasMeta && hasGoogle) setSourceTab("google_ads");
    if (sourceTab === "google_ads" && !hasGoogle && hasMeta) setSourceTab("meta_ads");
  }, [portfolioId, hasMeta, hasGoogle, sourceTab]);

  // Reset account/campaign when switching tab
  useEffect(() => {
    setAccountId("all");
    setCampaignId("all");
  }, [sourceTab, portfolioId]);

  // Default date range from data
  useEffect(() => {
    if (!start && activeAccounts[0]) {
      setStart(activeAccounts[0].startDate);
      setEnd(activeAccounts[0].endDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, accountId]);

  // Period quick-set — sempre usa a data atual no momento da seleção
  useEffect(() => {
    if (period === "custom") return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (period === "today") {
      setStart(todayStr);
      setEnd(todayStr);
      return;
    }
    if (period === "current_month") {
      const first = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      setStart(first);
      setEnd(todayStr);
      return;
    }
    if (period === "last_month") {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      setStart(first.toISOString().slice(0, 10));
      setEnd(last.toISOString().slice(0, 10));
      return;
    }
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const s = new Date(today);
    s.setDate(s.getDate() - days);
    setStart(s.toISOString().slice(0, 10));
    setEnd(todayStr);
  }, [period]);

  // Re-aggregate per-campaign within the selected date range when daily data exists.
  // Falls back to full campaign totals (XLSX-imported Meta Ads) when there is no breakdown.
  const allCampaigns = activeAccounts.flatMap((a) =>
    a.campaigns.map((c) => {
      if (!c.dailyMetrics?.length) {
        return {
          ...c,
          accountName: a.name,
          accountId: a.id,
          conversions: 0,
          clicks: 0,
        };
      }
      const inRange = c.dailyMetrics.filter((m) => {
        if (start && m.date < start) return false;
        if (end && m.date > end) return false;
        return true;
      });
      const sum = inRange.reduce(
        (acc, m) => {
          acc.impressions += m.impressions;
          acc.clicks += m.clicks;
          acc.cost += m.cost;
          acc.conversions += m.conversions;
          acc.reach += m.reach;
          return acc;
        },
        { impressions: 0, clicks: 0, cost: 0, conversions: 0, reach: 0 },
      );
      const results = sum.conversions > 0 ? sum.conversions : sum.clicks;
      return {
        ...c,
        accountName: a.name,
        accountId: a.id,
        results,
        spent: sum.cost,
        impressions: sum.impressions,
        reach: sum.reach || sum.impressions,
        costPerResult: results > 0 ? sum.cost / results : 0,
        conversions: sum.conversions,
        clicks: sum.clicks,
      };
    }),
  );

  const filteredCampaigns = allCampaigns.filter((c) => {
    if (campaignId !== "all" && c.id !== campaignId) return false;
    // Hide campaigns that had no activity in this range
    if (c.dailyMetrics?.length && c.impressions === 0 && c.spent === 0) return false;
    return true;
  });

  const totals = filteredCampaigns.reduce(
    (acc, c) => {
      acc.results += c.results;
      acc.spent += c.spent;
      acc.budget += c.budget;
      acc.impressions += c.impressions;
      acc.reach += c.reach;
      acc.conversions += c.conversions ?? 0;
      acc.clicks += c.clicks ?? 0;
      return acc;
    },
    { results: 0, spent: 0, budget: 0, impressions: 0, reach: 0, conversions: 0, clicks: 0 }
  );
  const cpr = totals.results > 0 ? totals.spent / totals.results : 0;
  const costPerConversion = totals.conversions > 0 ? totals.spent / totals.conversions : 0;
  const showConversionsKpi = sourceTab === "google_ads" && totals.conversions > 0;

  const primaryResultType =
    filteredCampaigns.find((c) => c.resultType !== "Sem resultado")?.resultType ?? "Resultados";
  const resultDescription =
    activeAccounts[0]?.resultDescription ?? "Resultados consolidados de todas as campanhas selecionadas.";

  const sortedBySpent = [...filteredCampaigns].sort((a, b) => b.spent - a.spent);
  const best = [...filteredCampaigns]
    .filter((c) => c.results > 0)
    .sort((a, b) => a.costPerResult - b.costPerResult)[0];
  const worst = [...filteredCampaigns]
    .filter((c) => c.results > 0)
    .sort((a, b) => b.costPerResult - a.costPerResult)[0];

  // Daily timeline aggregation across all filtered campaigns within selected period
  const dailySeries = useMemo(() => {
    const map = new Map<string, { date: string; cost: number; results: number; impressions: number; clicks: number }>();
    for (const c of filteredCampaigns) {
      for (const m of c.dailyMetrics ?? []) {
        if (start && m.date < start) continue;
        if (end && m.date > end) continue;
        if (!map.has(m.date)) {
          map.set(m.date, { date: m.date, cost: 0, results: 0, impressions: 0, clicks: 0 });
        }
        const r = map.get(m.date)!;
        r.cost += m.cost;
        r.results += m.conversions || m.clicks;
        r.impressions += m.impressions;
        r.clicks += m.clicks;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredCampaigns, start, end]);

  // Variation: compare second half vs first half of dailySeries
  function variation(field: "cost" | "results" | "impressions" | "clicks"): number | null {
    if (dailySeries.length < 4) return null;
    const half = Math.floor(dailySeries.length / 2);
    const first = dailySeries.slice(0, half).reduce((s, r) => s + r[field], 0);
    const second = dailySeries.slice(half).reduce((s, r) => s + r[field], 0);
    if (first <= 0) return null;
    return ((second - first) / first) * 100;
  }
  const deltaSpent = variation("cost");
  const deltaResults = variation("results");
  const deltaImpressions = variation("impressions");

  const isBranded = accountId !== "all" && portfolio;

  if (isLoading && !portfolio) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8 gap-3">
        <Loader2 className="animate-spin text-primary" size={28} />
        <p className="text-muted-foreground text-sm">Carregando dados do banco...</p>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-muted-foreground">Nenhum portfólio cadastrado.</p>
        {isAdmin ? (
          <Button asChild variant="outline" className="gap-2">
            <Link to="/admin"><Settings size={14} /> Painel admin</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/auth"><LogIn size={14} className="mr-2" /> Entrar</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? "bg-background text-foreground" : "min-h-screen bg-background text-foreground"}>
      {!embedded && (
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-3 min-w-0">
              {isBranded && portfolio.logo ? (
                <img src={portfolio.logo} alt={portfolio.name} className="h-9 w-auto rounded" />
              ) : (
                <img src={gaLogo} alt="GA Company" className="h-8 w-auto" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-none">Painel Gerencial</p>
                <h1 className="text-base lg:text-lg font-bold truncate">
                  {isBranded ? portfolio.theme.accentName : "GA Company"}
                </h1>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sourceTab === "google_ads" && hasGoogle && (
              <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="gap-2">
                {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">{syncing ? "Sincronizando..." : "Sincronizar Google"}</span>
              </Button>
            )}
            {sourceTab === "meta_ads" && hasMeta && isAdmin && (
              <Button onClick={handleSyncMeta} disabled={syncing} variant="outline" size="sm" className="gap-2">
                {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">{syncing ? "Atualizando..." : "Atualizar dados Meta Ads"}</span>
              </Button>
            )}
            {isAdmin && !embedded && (
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link to="/admin"><Settings size={14} /><span className="hidden sm:inline">Admin</span></Link>
              </Button>
            )}
            {user ? (
              <Button onClick={signOut} variant="ghost" size="sm" className="gap-2">
                <LogOut size={14} /><span className="hidden sm:inline">Sair</span>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/auth"><LogIn size={14} /><span className="hidden sm:inline">Entrar</span></Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      )}

      <main className="container mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* Filters */}
        {/* Tabs por origem dos dados */}
        {(hasMeta || hasGoogle) && (
          <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as any)}>
            <TabsList>
              <TabsTrigger value="meta_ads" disabled={!hasMeta}>
                Meta Ads
              </TabsTrigger>
              <TabsTrigger value="google_ads" disabled={!hasGoogle}>
                Google Ads
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {embedded && sourceTab === "meta_ads" && hasMeta && isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSyncMeta} disabled={syncing} variant="outline" size="sm" className="gap-2">
              {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              {syncing ? "Atualizando..." : "Atualizar dados"}
            </Button>
          </div>
        )}

        <Card className="p-4 lg:p-5">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="col-span-2 lg:col-span-1">
              <Label className="text-xs">Portfólio / BM</Label>
              <Select value={portfolioId} onValueChange={(v) => { setPortfolioId(v); setAccountId("all"); setCampaignId("all"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Conta de anúncios</Label>
              <Select value={accountId} onValueChange={(v) => { setAccountId(v); setCampaignId("all"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Campanha</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {allCampaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  <SelectItem value="current_month">Mês atual</SelectItem>
                  <SelectItem value="last_month">Mês anterior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data inicial</Label>
              <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPeriod("custom"); }} />
            </div>
            <div>
              <Label className="text-xs">Data final</Label>
              <Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPeriod("custom"); }} />
            </div>
          </div>
        </Card>

        {/* KPIs */}
        <div className={`grid grid-cols-2 lg:grid-cols-3 ${showConversionsKpi ? "xl:grid-cols-4 2xl:grid-cols-7" : "xl:grid-cols-6"} gap-3 lg:gap-4`}>
          {showConversionsKpi && (
            <>
              <KpiCard
                icon={Target}
                label="Conversões"
                value={fmtNum(totals.conversions)}
                hint="Ações de conversão registradas no Google Ads (leads, formulários, etc.)."
                accent
              />
              <KpiCard
                icon={DollarSign}
                label="Custo por conversão"
                value={fmtBRL(costPerConversion)}
                hint="Investimento médio para gerar 1 conversão."
              />
            </>
          )}
          <KpiCard
            icon={Activity}
            label={showConversionsKpi ? "Cliques" : primaryResultType}
            value={fmtNum(showConversionsKpi ? totals.clicks : totals.results)}
            hint={showConversionsKpi
              ? "Total de cliques nos anúncios."
              : resultDescription}
            accent={!showConversionsKpi}
            delta={deltaResults}
          />
          {!showConversionsKpi && (
            <KpiCard
              icon={DollarSign}
              label="Custo por resultado"
              value={fmtBRL(cpr)}
              hint="Valor médio gasto para gerar 1 resultado."
            />
          )}
          <KpiCard
            icon={Wallet}
            label="Orçamento"
            value={totals.budget ? fmtBRL(totals.budget) : "—"}
            hint="Soma dos orçamentos definidos."
          />
          <KpiCard
            icon={Activity}
            label="Valor usado"
            value={fmtBRL(totals.spent)}
            hint="Investimento real consumido pelas campanhas."
            delta={deltaSpent}
          />
          <KpiCard
            icon={Eye}
            label="Impressões"
            value={fmtNum(totals.impressions)}
            hint="Total de exibições dos anúncios."
            delta={deltaImpressions}
          />
          <KpiCard
            icon={Users}
            label="Alcance"
            value={fmtNum(totals.reach)}
            hint="Pessoas únicas atingidas."
          />
        </div>

        {/* Evolução diária */}
        {dailySeries.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Evolução diária no período</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailySeries}>
                <defs>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number, name) => name === "Gasto diário" ? fmtBRL(v) : fmtNum(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="cost"
                  name="Gasto diário"
                  stroke="hsl(var(--primary))"
                  fill="url(#gradCost)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="r"
                  type="monotone"
                  dataKey="results"
                  name="Resultados diários"
                  stroke="hsl(var(--muted-foreground))"
                  fill="url(#gradRes)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Best / Worst */}
        {(best || worst) && (
          <div className="grid md:grid-cols-2 gap-4">
            {best && (
              <Card className="p-5 border-l-4 border-l-emerald-500">
                <div className="flex items-center gap-2 text-emerald-500 text-xs font-semibold uppercase mb-2">
                  <TrendingUp size={14} /> Melhor performance
                </div>
                <p className="font-semibold truncate">{best.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {fmtNum(best.results)} {best.resultType.toLowerCase()} • CPR {fmtBRL(best.costPerResult)}
                </p>
              </Card>
            )}
            {worst && worst.id !== best?.id && (
              <Card className="p-5 border-l-4 border-l-red-500">
                <div className="flex items-center gap-2 text-red-500 text-xs font-semibold uppercase mb-2">
                  <TrendingDown size={14} /> Pior performance
                </div>
                <p className="font-semibold truncate">{worst.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {fmtNum(worst.results)} {worst.resultType.toLowerCase()} • CPR {fmtBRL(worst.costPerResult)}
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Resultados por campanha</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={filteredCampaigns}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => fmtNum(v)}
                />
                <Bar dataKey="results" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-4">Investimento vs Custo por resultado</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={filteredCampaigns}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number, name) => name === "spent" ? fmtBRL(v) : fmtBRL(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="spent" name="Valor usado" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line yAxisId="r" type="monotone" dataKey="costPerResult" name="Custo/resultado" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Table */}
        <Card className="p-5 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Detalhamento por campanha</h3>
            <Badge variant="secondary">{filteredCampaigns.length} campanha(s)</Badge>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-3 pr-4">Campanha</th>
                <th className="py-3 pr-4">Tipo de resultado</th>
                <th className="py-3 pr-4 text-right">Resultados</th>
                <th className="py-3 pr-4 text-right">Custo/result.</th>
                <th className="py-3 pr-4 text-right">Valor usado</th>
                <th className="py-3 pr-4 text-right">Impressões</th>
                <th className="py-3 text-right">Alcance</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpent.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-3 pr-4 font-medium">{c.name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{c.resultType}</td>
                  <td className="py-3 pr-4 text-right font-semibold">{fmtNum(c.results)}</td>
                  <td className="py-3 pr-4 text-right">{fmtBRL(c.costPerResult)}</td>
                  <td className="py-3 pr-4 text-right">{fmtBRL(c.spent)}</td>
                  <td className="py-3 pr-4 text-right">{fmtNum(c.impressions)}</td>
                  <td className="py-3 text-right">{fmtNum(c.reach)}</td>
                </tr>
              ))}
              {!filteredCampaigns.length && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma campanha no filtro selecionado.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <p className="text-xs text-muted-foreground flex items-center gap-2 pt-2">
          <Calendar size={12} />
          Dados de {start || "—"} até {end || "—"} • {activeAccounts.length} conta(s) selecionada(s)
        </p>
      </main>
    </div>
  );
};

export default Dashboard;
