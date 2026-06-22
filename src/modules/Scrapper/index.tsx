import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Search, Trash2, ExternalLink, Play, Pause, Settings, Eye } from "lucide-react";
import { ConectarMercadoLivreScrapper } from "./ConectarMercadoLivre";
import { GoogleMapsTab } from "./GoogleMapsTab";

type Job = {
  id: string;
  nome: string;
  categoria: string;
  plataforma: string;
  status: string;
  output_url: string | null;
  ultima_qtd: number;
  ultima_execucao: string | null;
  intervalo_horas: number;
  data_table_name: string | null;
  n8n_workflow_id: string | null;
  ultimo_erro: string | null;
  ultima_affiliate_errors: number | null;
  grupo_origem_jid: string | null;
  config: any;
};

const PLATAFORMAS_ECOMMERCE = [
  { v: "shopee", l: "Shopee" },
  { v: "mercado_livre", l: "Mercado Livre" },
  { v: "amazon", l: "Amazon" },
];

const INTERVALOS = [
  { v: 1, l: "A cada 1 hora" },
  { v: 2, l: "A cada 2 horas" },
  { v: 3, l: "A cada 3 horas" },
  { v: 6, l: "A cada 6 horas" },
  { v: 12, l: "A cada 12 horas" },
  { v: 24, l: "Uma vez por dia" },
];

export default function ScrapperModule({ portfolioId }: { portfolioId: string }) {
  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Scrapper</h1>
        <p className="text-sm text-muted-foreground">
          Colete dados automaticamente via n8n e popule data tables (ativa/pausa direto daqui).
        </p>
      </div>

      <Tabs defaultValue="ecommerce">
        <TabsList>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
          <TabsTrigger value="google_maps">Google Maps</TabsTrigger>
          <TabsTrigger value="outros">Outros</TabsTrigger>
        </TabsList>
        <TabsContent value="ecommerce" className="mt-4">
          <JobList portfolioId={portfolioId} categoria="ecommerce" />
        </TabsContent>
        <TabsContent value="google_maps" className="mt-4">
          <GoogleMapsTab />
        </TabsContent>
        <TabsContent value="outros" className="mt-4">
          <JobList portfolioId={portfolioId} categoria="outros" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobList({ portfolioId, categoria }: { portfolioId: string; categoria: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [viewing, setViewing] = useState<Job | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["scrapper", portfolioId, categoria],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scrapper_jobs")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .eq("categoria", categoria)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Job[];
    },
  });

  async function toggle(j: Job) {
    const ativar = j.status !== "ativo";
    // DUP não tem workflow no n8n — é acionado pelo webhook em tempo real.
    if (j.plataforma === "dup") {
      const { error } = await supabase
        .from("scrapper_jobs")
        .update({ status: ativar ? "ativo" : "inativo" })
        .eq("id", j.id);
      if (error) return toast.error(error.message);
      toast.success(ativar ? "Job DUP ativado!" : "Job DUP pausado");
      qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] });
      return;
    }
    if (ativar && !j.n8n_workflow_id) {
      return toast.error("Salve o job antes de ativar (workflow n8n ainda não criado).");
    }
    const action = ativar ? "activate" : "deactivate";
    const { error: fnErr } = await supabase.functions.invoke("n8n-sync", {
      body: { action, workflowId: j.n8n_workflow_id },
    });
    if (fnErr) return toast.error(fnErr.message);
    const { error } = await supabase
      .from("scrapper_jobs")
      .update({ status: ativar ? "ativo" : "inativo" })
      .eq("id", j.id);
    if (error) return toast.error(error.message);
    toast.success(ativar ? "Job ativado no n8n!" : "Job pausado");
    qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] });
  }

  async function remove(j: Job) {
    if (!confirm("Excluir job e apagar workflow do n8n?")) return;
    if (j.n8n_workflow_id) {
      await supabase.functions.invoke("n8n-sync", {
        body: { action: "delete", workflowId: j.n8n_workflow_id },
      });
    }
    const { error } = await supabase.from("scrapper_jobs").delete().eq("id", j.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-2">
          <Plus size={14} /> Novo job
        </Button>
      </div>
      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
      ) : (data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-3" size={28} />
          Nenhum job configurado.
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{j.nome}</p>
                    <Badge variant="outline" className="text-[10px]">{j.plataforma}</Badge>
                    <Badge variant={j.status === "ativo" ? "default" : "outline"} className="text-[10px]">
                      {j.status}
                    </Badge>
                    {j.n8n_workflow_id && <Badge variant="outline" className="text-[10px]">n8n ✓</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {j.data_table_name ? `📊 ${j.data_table_name} · ` : ""}
                    a cada {j.intervalo_horas ?? 6}h · Última:{" "}
                    {j.ultima_execucao ? new Date(j.ultima_execucao).toLocaleString("pt-BR") : "—"} · {j.ultima_qtd} itens
                  </p>
                  {j.output_url && (
                    <a href={j.output_url} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                      Ver planilha <ExternalLink size={10} />
                    </a>
                  )}
                  {j.plataforma === "mercado_livre" && <MlCookieAlert job={j} />}
                  {j.plataforma === "mercado_livre" && (j.ultima_affiliate_errors ?? 0) > 0 && (
                    <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      ⚠️ <strong>{j.ultima_affiliate_errors} links sem afiliado</strong> na última execução.
                    </div>
                  )}
                  {j.ultimo_erro && (
                    <p className="text-xs text-destructive mt-1 truncate">⚠ {j.ultimo_erro}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setViewing(j)} title="Ver produtos">
                    <Eye size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(j); setOpen(true); }}>
                    <Settings size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => toggle(j)}>
                    {j.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(j)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <JobDialog
        open={open} onOpenChange={setOpen} portfolioId={portfolioId} categoria={categoria}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] })}
      />
      <DataTableViewer job={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

const PREFIX: Record<string, string> = {
  shopee: "SHOPEE",
  mercado_livre: "ML",
  amazon: "AMZ",
  dup: "DUP",
};

function JobDialog({
  open, onOpenChange, portfolioId, categoria, editing, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  portfolioId: string; categoria: string;
  editing: Job | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [plataforma, setPlataforma] = useState(categoria === "ecommerce" ? "shopee" : "custom");
  const [termos, setTermos] = useState("");
  const [categorias, setCategorias] = useState("");
  const [intervaloHoras, setIntervaloHoras] = useState(6);
  const [dataTableName, setDataTableName] = useState("");
  const [shopeeAppId, setShopeeAppId] = useState("");
  const [shopeeSecret, setShopeeSecret] = useState("");
  const [mlCookie, setMlCookie] = useState("");
  const [mlCsrf, setMlCsrf] = useState("");
  const [mlTag, setMlTag] = useState("");
  const [mlToolId, setMlToolId] = useState("");
  const [mlPages, setMlPages] = useState(5);
  const [mlMinDiscount, setMlMinDiscount] = useState(20);
  const [mlDefaultCommissionRate, setMlDefaultCommissionRate] = useState(6);
  const [minCommissionValue, setMinCommissionValue] = useState(0);
  const [filterMode, setFilterMode] = useState<"none" | "sales" | "rating">("none");
  const [minSales, setMinSales] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [minProducts, setMinProducts] = useState(0);
  const [maxProducts, setMaxProducts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shopeePages, setShopeePages] = useState(20);
  // DUP — espelhamento de grupo de origem
  const [grupoOrigemJid, setGrupoOrigemJid] = useState<string>("");
  const [grupos, setGrupos] = useState<Array<{ id: string; nome: string }>>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(editing?.nome ?? "");
    setPlataforma(editing?.plataforma ?? (categoria === "ecommerce" ? "shopee" : "custom"));
    setTermos((editing?.config?.termos ?? []).join(", "));
    setCategorias((editing?.config?.categorias ?? []).join(", "));
    setIntervaloHoras(editing?.intervalo_horas ?? 6);
    setDataTableName(editing?.data_table_name ?? "");
    setShopeeAppId(editing?.config?.shopee_app_id ?? "");
    setShopeeSecret(editing?.config?.shopee_secret ?? "");
    setMlCookie(editing?.config?.ml_cookie ?? "");
    setMlCsrf(editing?.config?.ml_csrf_token ?? "");
    setMlTag(editing?.config?.ml_affiliate_id ?? editing?.config?.ml_affiliate_tag ?? "");
    setMlToolId(editing?.config?.ml_tool_id ?? "");
    setMlPages(editing?.config?.ml_pages ?? 5);
    setMlMinDiscount(editing?.config?.ml_min_discount ?? 20);
    setMlDefaultCommissionRate(editing?.config?.ml_default_commission_rate ?? 6);
    setMinCommissionValue(editing?.config?.min_commission_value ?? 0);
    setFilterMode(editing?.config?.filter_mode ?? "none");
    setMinSales(editing?.config?.min_sales ?? 0);
    setMinRating(editing?.config?.min_rating ?? 0);
    setMinProducts(editing?.config?.min_products ?? 0);
    setMaxProducts(editing?.config?.max_products ?? 0);
    setShopeePages(editing?.config?.shopee_pages ?? 20);
    setGrupoOrigemJid(editing?.grupo_origem_jid ?? "");
    setGrupos([]);
  }, [open, editing, categoria]);

  async function carregarGruposDup() {
    setLoadingGrupos(true);
    const { data: agent } = await supabase
      .from("whatsapp_agents")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (!agent?.id) {
      setLoadingGrupos(false);
      return toast.error("Conecte um agente WhatsApp neste portfolio antes de carregar grupos");
    }
    const { data, error } = await supabase.functions.invoke("evolution-instance", {
      body: { action: "groups", agentId: agent.id },
    });
    setLoadingGrupos(false);
    if (error) return toast.error(error.message);
    const gs = (data?.groups ?? []) as Array<{ id: string; nome: string }>;
    setGrupos(gs);
    if (!gs.length) toast.warning("Nenhum grupo encontrado nessa instância");
  }

  // sugere nome da data table
  useEffect(() => {
    if (editing || !nome) return;
    const prefix = PREFIX[plataforma] || plataforma.toUpperCase();
    setDataTableName(`${prefix}_${nome.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")}`);
  }, [nome, plataforma, editing]);

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    if (plataforma === "shopee" && (!shopeeAppId.trim() || !shopeeSecret.trim())) {
      return toast.error("Informe App ID e Secret da Shopee");
    }
    if (plataforma === "mercado_livre" && (!mlCookie.trim() || !mlCsrf.trim() || !mlTag.trim())) {
      return toast.error("Informe Cookie, CSRF token e Affiliate ID do Mercado Livre");
    }
    if (plataforma === "dup") {
      if (!grupoOrigemJid) return toast.error("Selecione o grupo de origem");
      if (!mlCookie.trim() || !mlCsrf.trim() || !mlTag.trim()) {
        return toast.error("Informe Cookie, CSRF token e Affiliate ID do Mercado Livre (para encurtar os links)");
      }
    }
    if (!dataTableName.trim()) return toast.error("Informe o nome da data table no n8n");
    const termosArr = termos.split(",").map((s) => s.trim()).filter(Boolean);
    const catsArr = categorias.split(",").map((s) => s.trim()).filter(Boolean);
    if (plataforma !== "dup" && !termosArr.length && !catsArr.length) {
      return toast.error("Informe pelo menos um termo ou categoria");
    }

    setBusy(true);
    const config: Record<string, any> = { termos: termosArr, categorias: catsArr };
    if (plataforma === "shopee") {
      config.shopee_app_id = shopeeAppId.trim();
      config.shopee_pages = shopeePages;
      config.shopee_secret = shopeeSecret.trim();
    }
    if (plataforma === "mercado_livre" || plataforma === "dup") {
      config.ml_cookie = mlCookie.trim();
      config.ml_csrf_token = mlCsrf.trim();
      config.ml_affiliate_id = mlTag.trim();
      config.ml_affiliate_tag = mlTag.trim(); // back-compat
      config.ml_tool_id = mlToolId.trim();
    }
    if (plataforma === "mercado_livre") {
      config.ml_pages = mlPages;
      config.ml_min_discount = mlMinDiscount;
      config.ml_default_commission_rate = mlDefaultCommissionRate;
    }
    // filtros de qualidade (comuns às plataformas e-commerce)
    config.min_commission_value = minCommissionValue;
    config.filter_mode = filterMode;
    config.min_sales = minSales;
    config.min_rating = minRating;
    config.min_products = minProducts;
    config.max_products = maxProducts;

    const payload: any = {
      portfolio_id: portfolioId,
      nome: nome.trim(),
      categoria,
      plataforma,
      config,
      intervalo_horas: intervaloHoras,
      data_table_name: dataTableName.trim(),
      grupo_origem_jid: plataforma === "dup" ? grupoOrigemJid : null,
      // cron com horário fixo (evita "deslize" quando o n8n reinicia)
      // 24h -> todo dia 07:00 BRT (10:00 UTC); sub-diário -> a cada N horas
      agendamento_cron: intervaloHoras >= 24 ? "0 10 * * *" : `0 */${intervaloHoras} * * *`,
    };

    let jobId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("scrapper_jobs").update(payload).eq("id", editing.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    } else {
      const { data: inserted, error } = await supabase
        .from("scrapper_jobs").insert(payload).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      jobId = (inserted as any).id;
    }

    // DUP não precisa de workflow no n8n — o webhook que faz o trabalho.
    // O usuário pode usar "Recriar data table" no viewer para criar a tabela.
    if (plataforma === "dup") {
      setBusy(false);
      toast.success("Job DUP salvo! Abra a data table para criá-la no n8n e ative o job.");
      onOpenChange(false);
      onSaved();
      return;
    }

    const { data: fnData, error: fnErr } = await supabase.functions.invoke("n8n-sync", {
      body: { action: "upsert_scrapper_workflow", jobId },
    });
    setBusy(false);
    if (fnErr) {
      toast.error(`Job salvo, mas falhou ao sincronizar com n8n: ${fnErr.message}`);
    } else {
      toast.success(`Job sincronizado! Workflow n8n: ${fnData?.workflowId ?? "ok"}`);
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar job" : "Novo job de scrapper"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Top produtos Adriana" />
          </div>
          {categoria === "ecommerce" ? (
            <div>
              <Label>Plataforma</Label>
              <Select value={plataforma} onValueChange={setPlataforma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATAFORMAS_ECOMMERCE.map((p) => (
                    <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Identificador</Label>
              <Input
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value)}
                placeholder="custom · use 'dup' p/ espelhar grupo"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use <code>dup</code> para espelhar ofertas de um grupo WhatsApp para a sua data table.
              </p>
            </div>
          )}
          {plataforma === "dup" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="text-xs font-semibold uppercase text-primary">
                Espelhamento de grupo (DUP)
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <Label>Grupo de origem</Label>
                  <Select value={grupoOrigemJid} onValueChange={setGrupoOrigemJid}>
                    <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
                    <SelectContent>
                      {grupoOrigemJid && !grupos.find((g) => g.id === grupoOrigemJid) && (
                        <SelectItem value={grupoOrigemJid}>{grupoOrigemJid}</SelectItem>
                      )}
                      {grupos.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={carregarGruposDup} disabled={loadingGrupos}>
                  {loadingGrupos ? <Loader2 size={12} className="animate-spin" /> : "Carregar grupos"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Toda mensagem deste grupo será lida pelo webhook, o link convertido para afiliado
                (quando for Mercado Livre) e gravada na data table abaixo. O agente nunca responde
                neste grupo.
              </p>
              <div>
                <Label>Cookie do Mercado Livre</Label>
                <textarea
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                  value={mlCookie}
                  onChange={(e) => setMlCookie(e.target.value)}
                  placeholder="_d2id=...; orguserid=...; ..."
                />
              </div>
              <div>
                <Label>x-csrf-token</Label>
                <Input value={mlCsrf} onChange={(e) => setMlCsrf(e.target.value)} />
              </div>
              <div>
                <Label>Affiliate ID (matt_word)</Label>
                <Input value={mlTag} onChange={(e) => setMlTag(e.target.value)} placeholder="hp20251103211257" />
              </div>
            </div>
          )}
          {plataforma === "shopee" && (
            <>
              <div>
                <Label>Shopee Affiliate App ID</Label>
                <Input value={shopeeAppId} onChange={(e) => setShopeeAppId(e.target.value)} placeholder="1234567890" />
              </div>
              <div>
                <Label>Shopee Affiliate Secret</Label>
                <Input
                  type="password"
                  value={shopeeSecret}
                  onChange={(e) => setShopeeSecret(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <Label>Páginas por termo</Label>
                <Input type="number" min={1} max={20} value={shopeePages} onChange={(e) => setShopeePages(Number(e.target.value) || 20)} />
              </div>
            </>
          )}
          {plataforma === "mercado_livre" && (
            <>
              <ConectarMercadoLivreScrapper portfolioId={portfolioId} scrapperJobId={editing?.id ?? null} />
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                <strong>Como pegar:</strong> abra <code>mercadolivre.com.br</code> logada → F12 → Network → recarregue
                a página → clique em qualquer request <code>www.mercadolivre.com.br</code> → na aba <em>Headers</em> copie
                o <code>cookie</code> completo e o <code>x-csrf-token</code>. A tag de afiliado pega em
                "Afiliados → Link Builder".
              </div>
              <div>
                <Label>Cookie do Mercado Livre</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={mlCookie}
                  onChange={(e) => setMlCookie(e.target.value)}
                  placeholder="_d2id=...; orguserid=...; ssid=...; nsa_rotok=...; ..."
                />
              </div>
              <div>
                <Label>x-csrf-token</Label>
                <Input value={mlCsrf} onChange={(e) => setMlCsrf(e.target.value)} placeholder="lDfFCVvy-2ti1Fw_4ek0lbhnbdZQMb7wNY94" />
              </div>
              <div>
                <Label>Affiliate ID (matt_word)</Label>
                <Input value={mlTag} onChange={(e) => setMlTag(e.target.value)} placeholder="hp20251103211257" />
              </div>
              <div>
                <Label>Tool ID (matt_tool) — opcional</Label>
                <Input value={mlToolId} onChange={(e) => setMlToolId(e.target.value)} placeholder="88344921" />
                <p className="text-xs text-muted-foreground mt-1">
                  Só usado no log. O endpoint do ML já injeta o matt_tool no link encurtado.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Páginas por termo</Label>
                  <Input type="number" min={1} max={20} value={mlPages} onChange={(e) => setMlPages(Number(e.target.value) || 5)} />
                </div>
                <div>
                  <Label>Desconto mínimo (%)</Label>
                  <Input type="number" min={0} max={99} value={mlMinDiscount} onChange={(e) => setMlMinDiscount(Number(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <Label>Comissão estimada do ML (%)</Label>
                <Input type="number" min={0} max={50} step={0.5} value={mlDefaultCommissionRate} onChange={(e) => setMlDefaultCommissionRate(Number(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground mt-1">
                  ML não devolve a comissão por produto na API pública; usamos esta % padrão para estimar (ex: 6%).
                </p>
              </div>
            </>
          )}

          {(plataforma === "shopee" || plataforma === "mercado_livre") && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Filtros de qualidade</div>
              <div>
                <Label>Comissão mínima por produto (R$)</Label>
                <Input type="number" min={0} step={0.5} value={minCommissionValue} onChange={(e) => setMinCommissionValue(Number(e.target.value) || 0)} placeholder="0 = sem mínimo" />
                <p className="text-xs text-muted-foreground mt-1">
                  Produto com comissão estimada abaixo deste valor é pulado.
                </p>
              </div>
              <div>
                <Label>Filtrar por</Label>
                <Select value={filterMode} onValueChange={(v) => setFilterMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem filtro</SelectItem>
                    <SelectItem value="sales">Vendas mínimas</SelectItem>
                    <SelectItem value="rating">Avaliação mínima</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filterMode === "sales" && (
                <div>
                  <Label>Mínimo de vendas</Label>
                  <Input type="number" min={0} value={minSales} onChange={(e) => setMinSales(Number(e.target.value) || 0)} placeholder="10" />
                  {plataforma === "mercado_livre" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ML: usa <code>sold_quantity</code> da API (no fallback HTML pode vir 0).
                    </p>
                  )}
                </div>
              )}
              {filterMode === "rating" && (
                <div>
                  <Label>Avaliação mínima (0-5)</Label>
                  <Input type="number" min={0} max={5} step={0.1} value={minRating} onChange={(e) => setMinRating(Number(e.target.value) || 0)} placeholder="4.0" />
                  {plataforma === "mercado_livre" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ML: faz 1 request extra por produto para buscar a média de reviews (mais lento).
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
                <div>
                  <Label>Mínimo por execução</Label>
                  <Input type="number" min={0} value={minProducts} onChange={(e) => setMinProducts(Number(e.target.value) || 0)} placeholder="0 = sem mínimo" />
                  <p className="text-xs text-muted-foreground mt-1">Avisa erro se coletar menos.</p>
                </div>
                <div>
                  <Label>Máximo por execução</Label>
                  <Input type="number" min={0} value={maxProducts} onChange={(e) => setMaxProducts(Number(e.target.value) || 0)} placeholder="0 = sem limite" />
                  <p className="text-xs text-muted-foreground mt-1">Para de coletar ao atingir.</p>
                </div>
              </div>
            </div>
          )}
          {plataforma !== "dup" && (
            <>
              <div>
                <Label>Termos de busca (separados por vírgula)</Label>
                <Input
                  value={termos}
                  onChange={(e) => setTermos(e.target.value)}
                  placeholder="calcinha, lingerie, sutiã"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  O scrapper só vai buscar produtos com estes termos.
                </p>
              </div>
              <div>
                <Label>Categorias (opcional, separadas por vírgula)</Label>
                <Input
                  value={categorias}
                  onChange={(e) => setCategorias(e.target.value)}
                  placeholder="moda íntima, lingerie feminina"
                />
              </div>
              <div>
                <Label>Frequência</Label>
                <Select value={String(intervaloHoras)} onValueChange={(v) => setIntervaloHoras(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALOS.map((i) => (
                      <SelectItem key={i.v} value={String(i.v)}>{i.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label>Data table no n8n (destino dos produtos)</Label>
            <Input
              value={dataTableName}
              onChange={(e) => setDataTableName(e.target.value)}
              placeholder="SHOPEE_ADRIANA"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A data table é criada automaticamente no n8n com as colunas: productname, price, priceoriginal, pricediscountrate, shopname, offerlink, imageUrl, sending, commission_rate, commission_value, sales, rating. Se já existe, adicione manualmente no n8n a coluna <strong>priceoriginal</strong> (number).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : (editing ? "Salvar" : "Criar e sincronizar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DataTableViewer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "sent" | "pending">("all");

  useEffect(() => {
    if (!job) { setRows(null); setErr(null); return; }
    setLoading(true);
    setErr(null);
    supabase.functions.invoke("n8n-sync", { body: { action: "list_datatable_rows", jobId: job.id } })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else if (data?.error) setErr(data.error);
        else setRows(data?.rows ?? []);
      })
      .finally(() => setLoading(false));
  }, [job]);

  const filtered = (rows ?? []).filter((r) => {
    if (filter === "sent") return !!r.sending;
    if (filter === "pending") return !r.sending;
    return true;
  });
  const totalSent = (rows ?? []).filter((r) => r.sending).length;

  return (
    <Dialog open={!!job} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{job?.data_table_name || "Data table"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {rows ? `${rows.length} produtos · ${totalSent} enviados · ${rows.length - totalSent} pendentes` : "—"}
            {" · "}Enviados há mais de 30 dias são excluídos automaticamente.
          </p>
        </DialogHeader>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="sent">Já enviados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-auto border rounded-md">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">⚠ {err}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhum produto.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Imagem</th>
                  <th className="text-left p-2 min-w-[200px]">Produto</th>
                  <th className="text-left p-2">Loja</th>
                  <th className="text-right p-2">Preço</th>
                  <th className="text-right p-2">% OFF</th>
                  <th className="text-right p-2">Comissão</th>
                  <th className="text-right p-2">Taxa %</th>
                  <th className="text-right p-2">Vendas</th>
                  <th className="text-right p-2">Rating</th>
                  <th className="text-left p-2">Link</th>
                  <th className="text-left p-2">Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id ?? i} className="border-t">
                    <td className="p-2">
                      <Badge variant={r.sending ? "default" : "outline"} className="text-[10px]">
                        {r.sending ? "enviado" : "pendente"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-10 w-10 object-cover rounded" /> : "—"}
                    </td>
                    <td className="p-2">{r.productname}</td>
                    <td className="p-2">{r.shopname}</td>
                    <td className="p-2 text-right">R$ {Number(r.price || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">{r.pricediscountrate ?? 0}%</td>
                    <td className="p-2 text-right">R$ {Number(r.commission_value || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">{Number(r.commission_rate || 0)}%</td>
                    <td className="p-2 text-right">{r.sales ?? 0}</td>
                    <td className="p-2 text-right">{r.rating ? Number(r.rating).toFixed(1) : "—"}</td>
                    <td className="p-2">
                      {r.offerlink && (
                        <a href={r.offerlink} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                          abrir <ExternalLink size={10} />
                        </a>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              if (!job) return;
              if (!confirm(`Recriar a data table "${job.data_table_name}" no n8n? Se já existir, será apagada e recriada vazia com todas as colunas corretas.`)) return;
              setLoading(true);
              const { data, error } = await supabase.functions.invoke("n8n-sync", { body: { action: "recreate_datatable", jobId: job.id } });
              setLoading(false);
              if (error || data?.error) {
                alert("Erro: " + (error?.message || data?.error));
              } else {
                setRows([]);
                alert(data?.message || "Data table recriada.");
                onClose();
              }
            }}
            disabled={loading}
          >
            Recriar data table
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (!job) return;
              if (!confirm(`Apagar TODOS os ${rows?.length ?? 0} produtos da data table "${job.data_table_name}"? Esta ação é irreversível.`)) return;
              setLoading(true);
              const { data, error } = await supabase.functions.invoke("n8n-sync", { body: { action: "reset_datatable", jobId: job.id } });
              setLoading(false);
              if (error || data?.error) {
                alert("Erro: " + (error?.message || data?.error));
              } else {
                setRows([]);
                alert(data?.message || "Data table limpa.");
                onClose();
              }
            }}
            disabled={loading || !rows || rows.length === 0}
          >
            Limpar tudo
          </Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MlCookieAlert({ job }: { job: Job }) {
  const [checking, setChecking] = useState(false);
  const [localStatus, setLocalStatus] = useState<any>(job.config?.ml_cookie_status ?? null);
  const status = localStatus;

  async function recheck() {
    setChecking(true);
    try {
      // chama a função de health check só para este job
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml-health-check?job_id=${job.id}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(`Falha HTTP ${resp.status}: ${json?.error ?? "sem detalhes"}`);
        return;
      }
      const s = json?.results?.[0]?.status ?? null;
      if (s) setLocalStatus(s);
      if (s?.ok) toast.success("Cookie ML válido ✅");
      else toast.error(`Cookie ML inválido: ${s?.error ?? `HTTP ${s?.status_code ?? "?"}`}`);
    } catch (e: any) {
      toast.error(`Falha ao verificar: ${e?.message ?? e}`);
    } finally {
      setChecking(false);
    }
  }

  // Se nunca foi checado, mostra um botão discreto.
  if (!status) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Cookie ML ainda não verificado.</span>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 size={10} className="animate-spin" /> : "Verificar agora"}
        </Button>
      </div>
    );
  }

  if (status.ok) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
        <span>✅ Cookie ML ativo · verificado {new Date(status.checked_at).toLocaleString("pt-BR")}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 size={10} className="animate-spin" /> : "Re-checar"}
        </Button>
      </div>
    );
  }

  // Cookie expirado / inválido — alerta forte com instruções.
  const isExpired = status.error === "COOKIE_EXPIRED" || status.status_code === 401 || status.status_code === 403;
  return (
    <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[12px] text-destructive space-y-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[13px]">
          {isExpired ? "🚨 Cookie do Mercado Livre EXPIROU" : `🚨 Cookie ML inválido (${status.error ?? "erro"})`}
        </strong>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 size={10} className="animate-spin" /> : "Re-checar"}
        </Button>
      </div>
      <p className="text-[11px] opacity-90">
        Os links de afiliado <strong>não serão gerados</strong> até você renovar.
        Última verificação: {new Date(status.checked_at).toLocaleString("pt-BR")}
        {status.status_code ? ` · HTTP ${status.status_code}` : ""}
      </p>
      <details className="text-[11px]">
        <summary className="cursor-pointer font-medium">Como renovar (clique para ver)</summary>
        <ol className="list-decimal pl-4 mt-1 space-y-1 opacity-90">
          <li>Acesse <a className="underline" href="https://www.mercadolivre.com.br/afiliados/linkbuilder" target="_blank" rel="noreferrer">mercadolivre.com.br/afiliados/linkbuilder</a> e faça login na conta de afiliado.</li>
          <li>Abra o DevTools (F12) → aba <strong>Network</strong> → gere um link qualquer.</li>
          <li>Encontre a requisição <code>createLink</code> → aba <strong>Headers</strong>.</li>
          <li>Copie o valor inteiro do header <code>cookie</code> e do header <code>x-csrf-token</code>.</li>
          <li>Volte aqui, clique no ícone ⚙️ deste job e cole os dois valores nos campos <strong>Cookie</strong> e <strong>CSRF Token</strong>.</li>
          <li>Salve e clique em "Re-checar" acima — deve ficar verde ✅.</li>
        </ol>
      </details>
    </div>
  );
}
