import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Send, Trash2, Play, Pause, Upload, FileSpreadsheet } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Campanha = {
  id: string;
  nome: string;
  status: string;
  mensagens: string[];
  planilha_url: string | null;
  delay_min_seg: number;
  delay_max_seg: number;
  total_contatos: number;
  enviados: number;
  instancia_id: string | null;
};

export default function DisparoModule({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["disparo", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_campanhas")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campanha[];
    },
  });

  async function toggleStatus(c: Campanha) {
    const novo = c.status === "executando" ? "pausada" : "executando";
    const { error } = await supabase
      .from("disparo_campanhas")
      .update({ status: novo })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "executando" ? "Campanha iniciada" : "Campanha pausada");
    qc.invalidateQueries({ queryKey: ["disparo", portfolioId] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir campanha?")) return;
    const { error } = await supabase.from("disparo_campanhas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["disparo", portfolioId] });
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Disparo de Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Envios em massa com mensagens variadas e delay aleatório para evitar ban.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus size={14} /> Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
      ) : (data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Send className="mx-auto mb-3 text-muted-foreground" size={28} />
          Nenhuma campanha. Crie a primeira para começar a disparar.
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{c.nome}</p>
                    <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.enviados}/{c.total_contatos} enviados · delay {c.delay_min_seg}–{c.delay_max_seg}s ·{" "}
                    {c.mensagens.length} variações
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => toggleStatus(c)}>
                    {c.status === "executando" ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovaCampanhaDialog
        open={open}
        onOpenChange={setOpen}
        portfolioId={portfolioId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["disparo", portfolioId] })}
      />
    </div>
  );
}

function NovaCampanhaDialog({
  open, onOpenChange, portfolioId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolioId: string;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [mensagens, setMensagens] = useState("");
  const [planilha, setPlanilha] = useState("");
  const [dMin, setDMin] = useState(8);
  const [dMax, setDMax] = useState(20);
  const [busy, setBusy] = useState(false);
  const [contatos, setContatos] = useState<{ nome: string; telefone: string; variaveis: Record<string, any> }[]>([]);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  function normalizarTelefone(v: any): string {
    const s = String(v ?? "").replace(/\D/g, "");
    return s;
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (!rows.length) return toast.error("Planilha vazia");
      const parsed = rows
        .map((r) => {
          const keys = Object.keys(r);
          const telKey = keys.find((k) => /tel|fone|whats|celular|phone|number/i.test(k));
          const nomeKey = keys.find((k) => /nome|name/i.test(k));
          const telefone = normalizarTelefone(telKey ? r[telKey] : Object.values(r)[0]);
          const nome = String((nomeKey ? r[nomeKey] : "") ?? "").trim();
          const variaveis: Record<string, any> = {};
          for (const k of keys) if (k !== telKey && k !== nomeKey) variaveis[k] = r[k];
          return { nome, telefone, variaveis };
        })
        .filter((c) => c.telefone.length >= 8);
      if (!parsed.length) return toast.error("Nenhum telefone válido encontrado");
      setContatos(parsed);
      setArquivoNome(file.name);
      toast.success(`${parsed.length} contatos carregados`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + (e?.message ?? e));
    }
  }

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    const msgs = mensagens.split("\n---\n").map((m) => m.trim()).filter(Boolean);
    if (msgs.length < 2) return toast.error("Inclua ao menos 2 variações separadas por linha com ---");
    if (!contatos.length && !planilha.trim()) return toast.error("Importe um arquivo XLSX/CSV ou informe o link da planilha");
    setBusy(true);
    const { data: campanha, error } = await supabase.from("disparo_campanhas").insert({
      portfolio_id: portfolioId,
      nome: nome.trim(),
      mensagens: msgs,
      planilha_url: planilha.trim() || null,
      delay_min_seg: dMin,
      delay_max_seg: dMax,
      total_contatos: contatos.length,
    }).select("id").single();
    if (error || !campanha) {
      setBusy(false);
      return toast.error(error?.message ?? "Erro ao criar campanha");
    }
    if (contatos.length) {
      const chunk = 500;
      for (let i = 0; i < contatos.length; i += chunk) {
        const slice = contatos.slice(i, i + chunk).map((c) => ({
          campanha_id: campanha.id,
          nome: c.nome || null,
          telefone: c.telefone,
          variaveis: c.variaveis,
        }));
        const { error: cErr } = await supabase.from("disparo_contatos").insert(slice);
        if (cErr) {
          setBusy(false);
          return toast.error("Erro ao salvar contatos: " + cErr.message);
        }
      }
    }
    setBusy(false);
    toast.success("Campanha criada!");
    setNome(""); setMensagens(""); setPlanilha(""); setDMin(8); setDMax(20);
    setContatos([]); setArquivoNome("");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova campanha de disparo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome da campanha</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Promo Black Friday" />
          </div>
          <div>
            <Label>Variações de mensagem (separe com uma linha contendo apenas <code>---</code>)</Label>
            <Textarea
              rows={8}
              value={mensagens}
              onChange={(e) => setMensagens(e.target.value)}
              placeholder={"Oi {nome}, tudo bem?\n---\nOlá {nome}! Tudo certo por aí?\n---\nE aí {nome}, beleza?"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code>{"{nome}"}</code> para personalizar. Quanto mais variações, menor o risco de ban.
            </p>
          </div>
          <div>
            <Label>Importar contatos (XLSX, XLS ou CSV)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-2 mt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload size={14} /> Escolher arquivo
              </Button>
              {arquivoNome && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <FileSpreadsheet size={12} /> {arquivoNome} · {contatos.length} contatos
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas reconhecidas: <code>nome</code> e <code>telefone</code> (ou <code>whatsapp</code>, <code>celular</code>). Demais colunas viram variáveis.
            </p>
          </div>
          <div>
            <Label>Ou link da planilha (opcional)</Label>
            <Input value={planilha} onChange={(e) => setPlanilha(e.target.value)} placeholder="https://docs.google.com/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Delay mín (s)</Label>
              <Input type="number" value={dMin} onChange={(e) => setDMin(Number(e.target.value))} />
            </div>
            <div>
              <Label>Delay máx (s)</Label>
              <Input type="number" value={dMax} onChange={(e) => setDMax(Number(e.target.value))} />
            </div>
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
