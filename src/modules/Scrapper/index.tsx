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
import { Loader2, Plus, Search, Trash2, ExternalLink, Play, Pause, Settings } from "lucide-react";

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
          <TabsTrigger value="outros">Outros</TabsTrigger>
        </TabsList>
        <TabsContent value="ecommerce" className="mt-4">
          <JobList portfolioId={portfolioId} categoria="ecommerce" />
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
                  {j.ultimo_erro && (
                    <p className="text-xs text-destructive mt-1 truncate">⚠ {j.ultimo_erro}</p>
                  )}
                </div>
                <div className="flex gap-1">
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
    </div>
  );
}

const PREFIX: Record<string, string> = {
  shopee: "SHOPEE",
  mercado_livre: "ML",
  amazon: "AMZ",
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
  const [mlPages, setMlPages] = useState(5);
  const [mlMinDiscount, setMlMinDiscount] = useState(20);
  const [mlDefaultCommissionRate, setMlDefaultCommissionRate] = useState(6);
  const [minCommissionValue, setMinCommissionValue] = useState(0);
  const [filterMode, setFilterMode] = useState<"none" | "sales" | "rating">("none");
  const [minSales, setMinSales] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [busy, setBusy] = useState(false);

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
    setMlTag(editing?.config?.ml_affiliate_tag ?? "");
    setMlPages(editing?.config?.ml_pages ?? 5);
    setMlMinDiscount(editing?.config?.ml_min_discount ?? 20);
    setMlDefaultCommissionRate(editing?.config?.ml_default_commission_rate ?? 6);
    setMinCommissionValue(editing?.config?.min_commission_value ?? 0);
    setFilterMode(editing?.config?.filter_mode ?? "none");
    setMinSales(editing?.config?.min_sales ?? 0);
    setMinRating(editing?.config?.min_rating ?? 0);
  }, [open, editing, categoria]);

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
      return toast.error("Informe Cookie, CSRF token e Affiliate tag do Mercado Livre");
    }
    if (!dataTableName.trim()) return toast.error("Informe o nome da data table no n8n");
    const termosArr = termos.split(",").map((s) => s.trim()).filter(Boolean);
    const catsArr = categorias.split(",").map((s) => s.trim()).filter(Boolean);
    if (!termosArr.length && !catsArr.length) {
      return toast.error("Informe pelo menos um termo ou categoria");
    }

    setBusy(true);
    const config: Record<string, any> = { termos: termosArr, categorias: catsArr };
    if (plataforma === "shopee") {
      config.shopee_app_id = shopeeAppId.trim();
      config.shopee_secret = shopeeSecret.trim();
    }
    if (plataforma === "mercado_livre") {
      config.ml_cookie = mlCookie.trim();
      config.ml_csrf_token = mlCsrf.trim();
      config.ml_affiliate_tag = mlTag.trim();
      config.ml_pages = mlPages;
      config.ml_min_discount = mlMinDiscount;
      config.ml_default_commission_rate = mlDefaultCommissionRate;
    }
    // filtros de qualidade (comuns às plataformas e-commerce)
    config.min_commission_value = minCommissionValue;
    config.filter_mode = filterMode;
    config.min_sales = minSales;
    config.min_rating = minRating;

    const payload: any = {
      portfolio_id: portfolioId,
      nome: nome.trim(),
      categoria,
      plataforma,
      config,
      intervalo_horas: intervaloHoras,
      data_table_name: dataTableName.trim(),
      // cron derivado pra retrocompat
      agendamento_cron: `0 */${intervaloHoras} * * *`,
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
              <Input value={plataforma} onChange={(e) => setPlataforma(e.target.value)} placeholder="custom" />
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
            </>
          )}
          {plataforma === "mercado_livre" && (
            <>
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
                <Label>Affiliate tag</Label>
                <Input value={mlTag} onChange={(e) => setMlTag(e.target.value)} placeholder="hp20251103211257" />
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
            </>
          )}
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
          <div>
            <Label>Data table no n8n (destino dos produtos)</Label>
            <Input
              value={dataTableName}
              onChange={(e) => setDataTableName(e.target.value)}
              placeholder="SHOPEE_ADRIANA"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Crie a data table no n8n com esse nome (colunas: productname, price, pricediscountrate, shopname, offerlink, imageUrl, sending).
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
