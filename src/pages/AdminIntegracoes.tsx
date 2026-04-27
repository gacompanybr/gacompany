import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import gaLogo from "@/assets/logo.png";

type Portfolio = { id: string; name: string };
type Integ = {
  id: string;
  portfolio_id: string;
  nome_portfolio: string;
  business_manager_id: string | null;
  ad_account_id: string;
  nome_conta_anuncio: string;
  status: string;
  ultima_atualizacao: string | null;
};

export default function AdminIntegracoes() {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [integs, setIntegs] = useState<Integ[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // form
  const [portfolioId, setPortfolioId] = useState("");
  const [bmId, setBmId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [nomeConta, setNomeConta] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: ps }, { data: is }] = await Promise.all([
      supabase.from("portfolios").select("id,name").order("name"),
      supabase.from("meta_integracoes").select("*").order("created_at", { ascending: false }),
    ]);
    setPortfolios((ps ?? []) as Portfolio[]);
    setIntegs((is ?? []) as Integ[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!portfolioId || !adAccountId || !nomeConta || !token) {
      return toast.error("Preencha portfólio, conta, nome e token.");
    }
    const portfolio = portfolios.find((p) => p.id === portfolioId);
    setSaving(true);
    const { error } = await supabase.from("meta_integracoes").insert({
      portfolio_id: portfolioId,
      nome_portfolio: portfolio?.name ?? "",
      business_manager_id: bmId || null,
      ad_account_id: adAccountId.replace(/^act_/, ""),
      nome_conta_anuncio: nomeConta,
      access_token: token,
      status: "pending",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Integração criada");
    setBmId(""); setAdAccountId(""); setNomeConta(""); setToken("");
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover integração? Os dados sincronizados também serão apagados.")) return;
    const { error } = await supabase.from("meta_integracoes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    load();
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    const { data, error } = await supabase.functions.invoke("sync-meta-ads", {
      body: { integration_id: id },
    });
    setSyncingId(null);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    toast.success(`Sincronizado: ${(data as any)?.campaigns ?? 0} campanhas, ${(data as any)?.metric_rows ?? 0} linhas.`);
    load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={18} />
            </Link>
            <img src={gaLogo} alt="GA Company" className="h-8 w-auto" />
            <div>
              <p className="text-xs text-muted-foreground leading-none">Administração</p>
              <h1 className="text-base font-bold">Integrações Meta Ads</h1>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck size={12} /> {user?.email}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Plus size={16} /> Nova integração
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Portfólio / BM</Label>
              <Select value={portfolioId} onValueChange={setPortfolioId}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Business Manager ID (opcional)</Label>
              <Input value={bmId} onChange={(e) => setBmId(e.target.value)} placeholder="123456789012345" />
            </div>
            <div>
              <Label>Ad Account ID</Label>
              <Input value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_1234567890 ou 1234567890" />
            </div>
            <div>
              <Label>Nome da conta de anúncios</Label>
              <Input value={nomeConta} onChange={(e) => setNomeConta(e.target.value)} placeholder="Cliente X — Conta Principal" />
            </div>
            <div className="md:col-span-2">
              <Label>Token de acesso de longa duração (System User)</Label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB…" />
              <p className="text-xs text-muted-foreground mt-1">
                Salvo de forma segura. Nunca é retornado para o navegador depois de gravado.
              </p>
            </div>
          </div>
          <Button onClick={handleAdd} disabled={saving} className="gap-2">
            {saving && <Loader2 className="animate-spin" size={14} />} Salvar integração
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Integrações cadastradas</h2>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin" /></div>
          ) : integs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma integração cadastrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {integs.map((i) => (
                <div key={i.id} className="border border-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.nome_conta_anuncio}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.nome_portfolio} • act_{i.ad_account_id} • {i.status}
                      {i.ultima_atualizacao && ` • atualizado em ${new Date(i.ultima_atualizacao).toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleSync(i.id)} disabled={syncingId === i.id} className="gap-2">
                      {syncingId === i.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                      Sincronizar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(i.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
