import { useState } from "react";
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
import { Loader2, Plus, Search, Trash2, ExternalLink } from "lucide-react";

type Job = {
  id: string;
  nome: string;
  categoria: string;
  plataforma: string;
  status: string;
  output_url: string | null;
  ultima_qtd: number;
  ultima_execucao: string | null;
  agendamento_cron: string | null;
};

const PLATAFORMAS_ECOMMERCE = [
  { v: "shopee", l: "Shopee" },
  { v: "mercado_livre", l: "Mercado Livre" },
  { v: "amazon", l: "Amazon" },
];

export default function ScrapperModule({ portfolioId }: { portfolioId: string }) {
  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Scrapper</h1>
        <p className="text-sm text-muted-foreground">
          Colete dados automaticamente de fontes externas e salve numa planilha.
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
    const novo = j.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("scrapper_jobs").update({ status: novo }).eq("id", j.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir job?")) return;
    const { error } = await supabase.from("scrapper_jobs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus size={14} /> Novo job</Button>
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{j.nome}</p>
                    <Badge variant="outline" className="text-[10px]">{j.plataforma}</Badge>
                    <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Última: {j.ultima_execucao ? new Date(j.ultima_execucao).toLocaleString("pt-BR") : "—"} ·{" "}
                    {j.ultima_qtd} itens
                  </p>
                  {j.output_url && (
                    <a href={j.output_url} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                      Ver planilha <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => toggle(j)}>
                    {j.status === "ativo" ? "Pausar" : "Ativar"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(j.id)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <NovoJobDialog
        open={open} onOpenChange={setOpen} portfolioId={portfolioId} categoria={categoria}
        onCreated={() => qc.invalidateQueries({ queryKey: ["scrapper", portfolioId, categoria] })}
      />
    </div>
  );
}

function NovoJobDialog({
  open, onOpenChange, portfolioId, categoria, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  portfolioId: string; categoria: string; onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [plataforma, setPlataforma] = useState(categoria === "ecommerce" ? "shopee" : "custom");
  const [termos, setTermos] = useState("");
  const [cron, setCron] = useState("0 */6 * * *");
  const [shopeeAppId, setShopeeAppId] = useState("");
  const [shopeeSecret, setShopeeSecret] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    if (plataforma === "shopee" && (!shopeeAppId.trim() || !shopeeSecret.trim())) {
      return toast.error("Informe App ID e Secret da Shopee");
    }
    setBusy(true);
    const config: Record<string, any> = {
      termos: termos.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (plataforma === "shopee") {
      config.shopee_app_id = shopeeAppId.trim();
      config.shopee_secret = shopeeSecret.trim();
    }
    const { error } = await supabase.from("scrapper_jobs").insert({
      portfolio_id: portfolioId,
      nome: nome.trim(),
      categoria,
      plataforma,
      config,
      agendamento_cron: cron.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Job criado! O n8n irá processar na próxima execução.");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo job de scrapper</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Top produtos do dia" />
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
                <p className="text-xs text-muted-foreground mt-1">
                  Usado pelo n8n para autenticar na API da Shopee Affiliate.
                </p>
              </div>
            </>
          )}
          <div>
            <Label>Termos / categorias (separados por vírgula)</Label>
            <Input value={termos} onChange={(e) => setTermos(e.target.value)} placeholder="eletrônicos, moda, casa" />
          </div>
          <div>
            <Label>Agendamento (cron)</Label>
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 */6 * * *" />
            <p className="text-xs text-muted-foreground mt-1">Padrão: a cada 6 horas.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
