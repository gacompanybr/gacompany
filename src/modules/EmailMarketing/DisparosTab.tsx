import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Plus, Play, Pause, Trash2, MailCheck, MousePointerClick,
  Eye, MessageSquare, Send, RefreshCw,
} from "lucide-react";
import { NovaCampanhaDialog } from "./NovaCampanhaDialog";

type Campanha = {
  id: string;
  nome: string;
  assunto: string;
  status: string;
  total_contatos: number;
  enviados: number;
  ultimo_erro: string | null;
  created_at: string;
};

type Dest = {
  id: string;
  email: string;
  nome: string | null;
  status: string;
  erro: string | null;
  abertos: number;
  cliques: number;
  respondido_em: string | null;
  enviado_em: string | null;
};

const STATUS_CLS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviando: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pausada: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  concluida: "bg-green-500/15 text-green-400 border-green-500/30",
};

export function DisparosTab({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [openNova, setOpenNova] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["email-campanhas", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campanhas")
        .select("id, nome, assunto, status, total_contatos, enviados, ultimo_erro, created_at")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
    refetchInterval: 20_000,
  });

  const { data: dests = [] } = useQuery({
    queryKey: ["email-dests", sel],
    enabled: !!sel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_destinatarios")
        .select("id, email, nome, status, erro, abertos, cliques, respondido_em, enviado_em")
        .eq("campanha_id", sel!)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Dest[];
    },
    refetchInterval: 20_000,
  });

  const campanha = campanhas.find((c) => c.id === sel) ?? null;

  const funil = {
    total: dests.length,
    enviados: dests.filter((d) => d.status === "enviado").length,
    abertos: dests.filter((d) => d.abertos > 0).length,
    clicados: dests.filter((d) => d.cliques > 0).length,
    respondidos: dests.filter((d) => !!d.respondido_em).length,
    naoLidos: dests.filter((d) => d.status === "enviado" && d.abertos === 0).length,
    falhas: dests.filter((d) => d.status === "falhou").length,
  };

  async function mudarStatus(c: Campanha, status: string) {
    setBusy(true);
    const { error } = await supabase
      .from("email_campanhas")
      .update({ status, ultimo_erro: null, lock_until: null })
      .eq("id", c.id);
    if (error) { setBusy(false); return toast.error(error.message); }
    if (status === "enviando") {
      const { data, error: eInv } = await supabase.functions.invoke("email-campaign-send", {
        body: { campanha_id: c.id },
      });
      if (eInv) toast.error(eInv.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success("Disparo iniciado — continua em segundo plano.");
    } else {
      toast.success("Campanha pausada");
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["email-campanhas", portfolioId] });
    qc.invalidateQueries({ queryKey: ["email-dests", c.id] });
  }

  async function excluir(c: Campanha) {
    const { error } = await supabase.from("email_campanhas").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    if (sel === c.id) setSel(null);
    qc.invalidateQueries({ queryKey: ["email-campanhas", portfolioId] });
  }

  async function marcarResposta(d: Dest) {
    const { error } = await supabase
      .from("email_destinatarios")
      .update({ respondido_em: d.respondido_em ? null : new Date().toISOString() })
      .eq("id", d.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["email-dests", sel] });
  }

  const dFiltrados = dests.filter((d) =>
    !busca || d.email.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Campanhas de e-mail com personalização, link rastreado e funil de métricas.
        </div>
        <Button onClick={() => setOpenNova(true)} className="gap-2">
          <Plus size={14} /> Nova campanha
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    <Send className="mx-auto mb-2 opacity-40" size={22} />
                    Nenhuma campanha criada ainda.
                  </TableCell>
                </TableRow>
              )}
              {campanhas.map((c) => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer hover:bg-muted/40 ${sel === c.id ? "bg-muted/50" : ""}`}
                  onClick={() => setSel(c.id)}
                >
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">{c.assunto}</TableCell>
                  <TableCell className="text-sm">{c.enviados}/{c.total_contatos}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLS[c.status] ?? ""}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {c.status === "enviando" ? (
                      <Button variant="ghost" size="icon" disabled={busy} onClick={() => mudarStatus(c, "pausada")} title="Pausar">
                        <Pause size={14} />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" disabled={busy || c.status === "concluida"} onClick={() => mudarStatus(c, "enviando")} title="Iniciar disparo">
                        <Play size={14} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => excluir(c)} title="Excluir">
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {campanha && (
        <>
          {campanha.ultimo_erro && (
            <Card className="p-3 border-yellow-500/40 bg-yellow-500/10 text-sm text-yellow-300">
              Disparo pausado: {campanha.ultimo_erro}
            </Card>
          )}

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            <Metric icon={Send} label="Enviados" value={funil.enviados} />
            <Metric icon={Eye} label="Abertos" value={funil.abertos} sub={pct(funil.abertos, funil.enviados)} />
            <Metric icon={MousePointerClick} label="Clicados" value={funil.clicados} sub={pct(funil.clicados, funil.enviados)} />
            <Metric icon={MessageSquare} label="Respondidos" value={funil.respondidos} sub={pct(funil.respondidos, funil.enviados)} />
            <Metric icon={MailCheck} label="Não lidos" value={funil.naoLidos} />
            <Metric icon={RefreshCw} label="Falhas" value={funil.falhas} />
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-medium text-sm">Destinatários — {campanha.nome}</div>
            <Input
              placeholder="Filtrar e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aberturas</TableHead>
                  <TableHead>Cliques</TableHead>
                  <TableHead>Respondeu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dFiltrados.slice(0, 300).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-sm">
                      {d.email}
                      {d.erro && <div className="text-[11px] text-destructive">{d.erro}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{d.status}</Badge></TableCell>
                    <TableCell className="text-sm">{d.abertos}</TableCell>
                    <TableCell className="text-sm">{d.cliques}</TableCell>
                    <TableCell>
                      <Button
                        variant={d.respondido_em ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => marcarResposta(d)}
                      >
                        {d.respondido_em ? "Respondeu" : "Marcar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <NovaCampanhaDialog
        open={openNova}
        onOpenChange={setOpenNova}
        portfolioId={portfolioId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["email-campanhas", portfolioId] })}
      />
    </div>
  );
}

function pct(a: number, b: number) {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={13} className="text-primary" /> {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
