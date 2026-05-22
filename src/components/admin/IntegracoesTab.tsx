import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, RefreshCcw, History, Power, Stethoscope } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Integ = {
  id: string;
  nome_conta_anuncio: string;
  ad_account_id: string;
  status: string;
  ultima_atualizacao: string | null;
  portfolio_id: string;
  nome_portfolio: string;
  access_token: string;
};

function maskToken(t: string) {
  if (!t) return "—";
  if (t.length < 12) return "•".repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function IntegracoesTab() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [diagFor, setDiagFor] = useState<Integ | null>(null);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data: integs = [], isLoading } = useQuery({
    queryKey: ["meta-integracoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_integracoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Integ[];
    },
  });

  const ids = integs.map((i) => i.id);

  const { data: stats = {} } = useQuery({
    queryKey: ["meta-integracoes-stats", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [camps, metrs, logs] = await Promise.all([
        supabase.from("meta_campanhas").select("integration_id").in("integration_id", ids),
        supabase.from("meta_metricas_campanhas").select("integration_id").in("integration_id", ids),
        supabase.from("meta_logs_integracao")
          .select("integration_id, status, mensagem, detalhe_erro, created_at")
          .in("integration_id", ids)
          .order("created_at", { ascending: false }),
      ]);
      const out: Record<string, { camps: number; metrs: number; lastError: string | null }> = {};
      for (const id of ids) out[id] = { camps: 0, metrs: 0, lastError: null };
      for (const r of camps.data ?? []) out[r.integration_id].camps++;
      for (const r of metrs.data ?? []) out[r.integration_id].metrs++;
      for (const l of logs.data ?? []) {
        const id = l.integration_id!;
        if (out[id] && !out[id].lastError && l.status === "error") {
          out[id].lastError = l.detalhe_erro || l.mensagem || "Erro";
        }
      }
      return out;
    },
  });

  async function callSync(body: any, label: string) {
    setSyncing(body.integration_id || "all");
    const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body });
    setSyncing(null);
    if (error) {
      toast({ title: `Falha: ${label}`, description: error.message, variant: "destructive" });
      return;
    }
    const r = data?.results?.[0];
    toast({
      title: `${label} concluído`,
      description: r
        ? `${r.campaigns_found} campanhas · ${r.metric_rows_saved} métricas · status ${r.status}`
        : "OK",
    });
    qc.invalidateQueries({ queryKey: ["meta-integracoes"] });
    qc.invalidateQueries({ queryKey: ["meta-integracoes-stats"] });
  }

  async function syncNow(i: Integ) { await callSync({ integration_id: i.id }, `Sync ${i.nome_conta_anuncio}`); }

  async function backfill90(i: Integ) {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 90);
    await callSync({
      integration_id: i.id,
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    }, `Backfill 90d ${i.nome_conta_anuncio}`);
  }

  async function toggleStatus(i: Integ) {
    const next = i.status === "disabled" ? "active" : "disabled";
    const { error } = await supabase.from("meta_integracoes").update({ status: next }).eq("id", i.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: next === "disabled" ? "Integração desativada" : "Integração reativada" });
    qc.invalidateQueries({ queryKey: ["meta-integracoes"] });
  }

  async function openDiag(i: Integ) {
    setDiagFor(i); setDiagResult(null); setDiagLoading(true);
    const { data, error } = await supabase.functions.invoke("meta-test-connection", {
      body: { integration_id: i.id },
    });
    setDiagLoading(false);
    if (error) setDiagResult({ ok: false, error: error.message });
    else setDiagResult(data);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Integrações Meta Ads</h2>
          <p className="text-xs text-muted-foreground">
            Contas conectadas. O cron <code>sync-meta-ads-every-3h</code> sincroniza todas as ativas automaticamente.
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="gap-2"><Plus size={16} /> Nova conta</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>
        ) : integs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma integração cadastrada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última sync</TableHead>
                <TableHead className="text-right">Campanhas</TableHead>
                <TableHead className="text-right">Métricas</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Último erro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integs.map((i) => {
                const s = stats[i.id] ?? { camps: 0, metrs: 0, lastError: null };
                const variant =
                  i.status === "active" ? "default" :
                  i.status === "disabled" ? "secondary" : "destructive";
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      {i.nome_conta_anuncio}
                      <div className="text-xs text-muted-foreground">{i.nome_portfolio}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.ad_account_id}</TableCell>
                    <TableCell><Badge variant={variant as any}>{i.status}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {i.ultima_atualizacao ? new Date(i.ultima_atualizacao).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">{s.camps}</TableCell>
                    <TableCell className="text-right">{s.metrs}</TableCell>
                    <TableCell className="font-mono text-xs">{maskToken(i.access_token)}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={s.lastError ?? ""}>
                      {s.lastError ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Diagnóstico" onClick={() => openDiag(i)}>
                          <Stethoscope size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" title="Sincronizar agora"
                          disabled={syncing === i.id} onClick={() => syncNow(i)}>
                          {syncing === i.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                        </Button>
                        <Button size="icon" variant="ghost" title="Backfill 90 dias"
                          disabled={syncing === i.id} onClick={() => backfill90(i)}>
                          <History size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" title={i.status === "disabled" ? "Reativar" : "Desativar"}
                          onClick={() => toggleStatus(i)}>
                          <Power size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {openNew && <NovaIntegracaoDialog onClose={() => setOpenNew(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["meta-integracoes"] });
        setOpenNew(false);
      }} />}

      <Dialog open={!!diagFor} onOpenChange={(o) => !o && setDiagFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diagnóstico — {diagFor?.nome_conta_anuncio}</DialogTitle>
            <DialogDescription>Testa token, conta e permissões diretamente na Meta.</DialogDescription>
          </DialogHeader>
          {diagLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} /></div>
          ) : diagResult ? <DiagView r={diagResult} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiagView({ r }: { r: any }) {
  const row = (label: string, ok: boolean, detail?: string) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <div className="text-sm">{label}</div>
      <div className="text-right">
        <Badge variant={ok ? "default" : "destructive"}>{ok ? "OK" : "Falha"}</Badge>
        {detail && <div className="text-xs text-muted-foreground mt-1 max-w-[280px]">{detail}</div>}
      </div>
    </div>
  );
  return (
    <div className="space-y-1">
      {row("Token válido", !!r.token?.valid, r.token?.name ? `Usuário: ${r.token.name}` : undefined)}
      {row("Conta acessível", !!r.account?.accessible,
        r.account?.name ? `${r.account.name} · ${r.account.currency ?? ""}` : undefined)}
      {row("Permissões (ads_read + business_management)", !!r.permissions?.ok,
        r.permissions?.missing?.length ? `Faltando: ${r.permissions.missing.join(", ")}` :
        `Concedidas: ${(r.permissions?.granted ?? []).join(", ")}`)}
      {row("Campanhas encontradas", (r.campaigns?.count ?? 0) > 0, `${r.campaigns?.count ?? 0} campanhas`)}
      {r.errors?.length > 0 && (
        <div className="mt-3 p-2 bg-destructive/10 rounded text-xs text-destructive">
          {r.errors.map((e: string, i: number) => <div key={i}>• {e}</div>)}
        </div>
      )}
    </div>
  );
}

function NovaIntegracaoDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [portfolioId, setPortfolioId] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("portfolios").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function handleTest() {
    if (!accountId || !token) {
      toast({ title: "Preencha account ID e token", variant: "destructive" }); return;
    }
    setTesting(true); setTestResult(null);
    const { data, error } = await supabase.functions.invoke("meta-test-connection", {
      body: { access_token: token, ad_account_id: accountId },
    });
    setTesting(false);
    if (error) { setTestResult({ ok: false, error: error.message }); return; }
    setTestResult(data);
  }

  async function handleSave() {
    if (!nome || !accountId || !token || !portfolioId) {
      toast({ title: "Preencha todos os campos", variant: "destructive" }); return;
    }
    setSaving(true);
    const portfolio = portfolios.find((p: any) => p.id === portfolioId);
    const { data: inserted, error } = await supabase.from("meta_integracoes").insert({
      nome_conta_anuncio: nome,
      ad_account_id: accountId.startsWith("act_") ? accountId : `act_${accountId}`,
      access_token: token,
      portfolio_id: portfolioId,
      nome_portfolio: portfolio?.name ?? "",
      status: "active",
    }).select("id").single();
    if (error) {
      setSaving(false);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return;
    }
    toast({ title: "Integração criada", description: "Iniciando primeira sincronização..." });
    await supabase.functions.invoke("sync-meta-ads", { body: { integration_id: inserted!.id } });
    setSaving(false);
    onCreated();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova integração Meta Ads</DialogTitle>
          <DialogDescription>Cadastre uma conta de anúncio. O token é validado antes de salvar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome da integração</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="BM - Cliente XYZ" />
          </div>
          <div>
            <Label>Portfolio</Label>
            <Select value={portfolioId} onValueChange={setPortfolioId}>
              <SelectTrigger><SelectValue placeholder="Selecione um portfolio" /></SelectTrigger>
              <SelectContent>
                {portfolios.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ad Account ID</Label>
            <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_123456789" />
          </div>
          <div>
            <Label>Access Token (long-lived)</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB..." />
            <p className="text-xs text-muted-foreground mt-1">Armazenado no backend. Não é exibido novamente após salvar.</p>
          </div>
          {testResult && <DiagView r={testResult} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : "Testar conexão"}
          </Button>
          <Button onClick={handleSave} disabled={saving || (testResult && !testResult.ok)}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Salvar e sincronizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
