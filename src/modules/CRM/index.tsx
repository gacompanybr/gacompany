import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flame, LayoutGrid, List, MessageCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovoLeadDialog } from "./NovoLeadDialog";
import { LeadDetailSheet } from "./LeadDetailSheet";
import { MetaBindingDialog } from "./MetaBindingDialog";
import { ORIGEM_LABELS, STATUS_COLUNAS, shortAnswer, type CrmLead, type LeadStatus } from "./types";

type CrmPortfolio = { id: string; name: string };
type DateRange = "all" | "today" | "7" | "30" | "custom";
const PAGE = 1000;

function beep() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.17);
    });
  } catch { /* audio unavailable */ }
}

const isHot = (l: CrmLead) => (l.tags ?? []).includes("lead_quente");
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: ptBR });

export default function CRMModule({ portfolioId }: { portfolioId?: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [origem, setOrigem] = useState("all");
  const [status, setStatus] = useState("all");
  const [onlyHot, setOnlyHot] = useState(false);
  const queryKey = useMemo(() => ["crm-leads", portfolioId], [portfolioId]);

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
  const portfolioNames = useMemo(() => new Map(portfolios.map((p) => [p.id, p.name])), [portfolios]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey,
    staleTime: 60_000,
    queryFn: async () => {
      const all: CrmLead[] = [];
      for (let page = 0; ; page++) {
        let query = supabase.from("crm_leads").select("*").order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (portfolioId) query = query.eq("portfolio_id", portfolioId);
        const { data, error } = await query;
        if (error) throw error;
        all.push(...((data ?? []) as unknown as CrmLead[]));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
  });

  // Instant updates: new and changed leads arrive without reloading.
  const ready = useRef(false);
  useEffect(() => {
    ready.current = false;
    const t = setTimeout(() => { ready.current = true; }, 1500);
    const channel = supabase
      .channel(`crm-leads-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_leads" }, (payload) => {
        qc.setQueryData<CrmLead[]>(queryKey, (old = []) => {
          if (payload.eventType === "DELETE") return old.filter((l) => l.id !== (payload.old as CrmLead).id);
          const row = payload.new as CrmLead;
          if (portfolioId && row.portfolio_id !== portfolioId) return old;
          if (payload.eventType === "INSERT") return old.some((l) => l.id === row.id) ? old : [row, ...old];
          return old.map((l) => (l.id === row.id ? row : l));
        });
        if (payload.eventType === "INSERT" && ready.current) {
          const row = payload.new as CrmLead;
          beep();
          toast.success(`Novo LEAD: ${row.nome}`, { description: shortAnswer(row, /fatura/) ?? ORIGEM_LABELS[row.origem] });
        }
      })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(channel); };
  }, [qc, queryKey, portfolioId]);

  const visibleLeads = useMemo(() => {
    const now = new Date();
    let start: Date | null = null; let end: Date | null = null;
    if (range === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "7" || range === "30") start = new Date(now.getTime() - Number(range) * 86400000);
    if (range === "custom") {
      if (from) start = new Date(`${from}T00:00:00`);
      if (to) end = new Date(`${to}T23:59:59`);
    }
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (portfolioFilter !== "all" && l.portfolio_id !== portfolioFilter) return false;
      if (origem !== "all" && l.origem !== origem) return false;
      if (status !== "all" && l.status !== status) return false;
      if (onlyHot && !isHot(l)) return false;
      const c = new Date(l.created_at);
      if (start && c < start) return false;
      if (end && c > end) return false;
      if (q && ![l.nome, l.telefone, l.email, l.observacoes].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [leads, portfolioFilter, origem, status, onlyHot, range, from, to, search]);

  const updateLead = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CrmLead> }) => {
      const { error } = await supabase.from("crm_leads").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, patch }) => {
      qc.setQueryData<CrmLead[]>(queryKey, (old = []) => old.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    onError: (e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey }); },
  });

  const metricas = useMemo(() => {
    const total = visibleLeads.length;
    const hoje = visibleLeads.filter((l) => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
    const quentes = visibleLeads.filter(isHot).length;
    const fechados = visibleLeads.filter((l) => l.status === "fechado").length;
    const conv = total > 0 ? ((fechados / total) * 100).toFixed(1) : "0";
    return { total, hoje, quentes, conv };
  }, [visibleLeads]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const open = (l: CrmLead) => { setSelectedId(l.id); setSheetOpen(true); };
  const onDrop = (s: LeadStatus) => {
    const l = visibleLeads.find((x) => x.id === draggingId);
    if (l && l.status !== s) updateLead.mutate({ id: l.id, patch: { status: s } });
    setDraggingId(null);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[600px] flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">CRM</h2>
          <p className="text-sm text-muted-foreground">Leads chegam aqui na hora, com as respostas do formulário.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!portfolioId && <MetaBindingDialog />}
          <NovoLeadDialog portfolioId={portfolioId} portfolios={portfolios} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Leads no filtro" value={metricas.total} />
        <MetricCard label="Chegaram hoje" value={metricas.hoje} />
        <MetricCard label="Leads quentes" value={metricas.quentes} />
        <MetricCard label="Conversão" value={`${metricas.conv}%`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar nome, telefone, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer data</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="custom">Período...</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {Object.entries(ORIGEM_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas etapas</SelectItem>
            {STATUS_COLUNAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {!portfolioId && (
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant={onlyHot ? "default" : "outline"} size="sm" className="gap-1" onClick={() => setOnlyHot(!onlyHot)}>
          <Flame size={14} /> Quentes
        </Button>
        <div className="flex rounded-md border">
          <Button variant={view === "kanban" ? "secondary" : "ghost"} size="icon" aria-label="Funil" onClick={() => setView("kanban")}><LayoutGrid size={16} /></Button>
          <Button variant={view === "lista" ? "secondary" : "ghost"} size="icon" aria-label="Lista" onClick={() => setView("lista")}><List size={16} /></Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-full" />)}
          </div>
        ) : view === "kanban" ? (
          <div className="flex h-full gap-3 overflow-x-auto pb-2">
            {STATUS_COLUNAS.map((col) => {
              const items = visibleLeads.filter((l) => l.status === col.key);
              return (
                <div key={col.key} className="flex h-full w-[270px] shrink-0 flex-col overflow-hidden rounded-lg bg-muted/40 p-2"
                  onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(col.key)}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="outline" className="text-xs">{items.length}</Badge>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {items.map((l) => (
                      <Card key={l.id} draggable onDragStart={() => setDraggingId(l.id)} onClick={() => open(l)}
                        className={`cursor-pointer transition-colors hover:border-primary ${isHot(l) ? "border-primary/60" : ""}`}>
                        <CardContent className="space-y-1.5 p-3">
                          <div className="flex items-center gap-1">
                            {isHot(l) && <Flame size={14} className="shrink-0 text-primary" />}
                            <div className="truncate text-sm font-medium">{l.nome}</div>
                          </div>
                          {!portfolioId && (
                            <div className="truncate text-xs text-muted-foreground">
                              {l.portfolio_id ? (portfolioNames.get(l.portfolio_id) ?? "Cliente") : "GA Company"}
                            </div>
                          )}
                          {shortAnswer(l, /fatura/) && (
                            <div className="text-xs"><span className="text-muted-foreground">Fatura:</span> {shortAnswer(l, /fatura/)}</div>
                          )}
                          {shortAnswer(l, /quanto tempo/) && (
                            <div className="truncate text-xs"><span className="text-muted-foreground">Começar:</span> {shortAnswer(l, /quanto tempo/)}</div>
                          )}
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <Badge variant="secondary" className="h-5 text-[10px]">{ORIGEM_LABELS[l.origem] ?? l.origem}</Badge>
                            <span className="text-muted-foreground">{ago(l.created_at)}</span>
                          </div>
                          {l.telefone && (
                            <a href={waLink(l.telefone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                              <MessageCircle size={12} /> {l.telefone}
                            </a>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Vazio</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full overflow-auto rounded-lg border">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">Nome</th><th className="p-2">Telefone</th><th className="p-2">E-mail</th>
                  <th className="p-2">Etapa</th><th className="p-2">Fatura</th><th className="p-2">Investir</th>
                  <th className="p-2">Começar</th><th className="p-2">Chegou</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="p-1"><InlineInput value={l.nome} onSave={(v) => v && updateLead.mutate({ id: l.id, patch: { nome: v } })} hot={isHot(l)} /></td>
                    <td className="p-1"><InlineInput value={l.telefone ?? ""} onSave={(v) => updateLead.mutate({ id: l.id, patch: { telefone: v || null } })} /></td>
                    <td className="p-1"><InlineInput value={l.email ?? ""} onSave={(v) => updateLead.mutate({ id: l.id, patch: { email: v || null } })} /></td>
                    <td className="p-1">
                      <Select value={l.status} onValueChange={(v) => updateLead.mutate({ id: l.id, patch: { status: v as LeadStatus } })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_COLUNAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-xs">{shortAnswer(l, /fatura/) ?? "—"}</td>
                    <td className="p-2 text-xs">{shortAnswer(l, /disposto/) ?? "—"}</td>
                    <td className="p-2 text-xs">{shortAnswer(l, /quanto tempo/) ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">{ago(l.created_at)}</td>
                    <td className="p-1"><Button size="sm" variant="ghost" onClick={() => open(l)}>Abrir</Button></td>
                  </tr>
                ))}
                {visibleLeads.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum lead neste filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LeadDetailSheet lead={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function InlineInput({ value, onSave, hot }: { value: string; onSave: (v: string) => void; hot?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-1">
      {hot && <Flame size={14} className="shrink-0 text-primary" />}
      <Input className="h-8 border-transparent bg-transparent hover:border-input focus:border-input" value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== value) onSave(v.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
