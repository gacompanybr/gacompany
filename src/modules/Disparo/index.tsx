import { useRef, useState } from "react";
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
import { Loader2, Plus, Send, Trash2, Play, Pause, Upload, FileSpreadsheet, X } from "lucide-react";
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
  const [contatos, setContatos] = useState<{ nome: string | null; telefone: string }[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  function normalizeTel(raw: any): string {
    const onlyDigits = String(raw ?? "").replace(/\D/g, "");
    return onlyDigits;
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return toast.error("Planilha vazia");
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (!rows.length) return toast.error("Nenhuma linha encontrada");

      const findKey = (row: Record<string, any>, candidates: string[]) => {
        const keys = Object.keys(row);
        for (const cand of candidates) {
          const hit = keys.find((k) => k.toLowerCase().trim() === cand);
          if (hit) return hit;
        }
        // fallback fuzzy includes
        for (const cand of candidates) {
          const hit = keys.find((k) => k.toLowerCase().includes(cand));
          if (hit) return hit;
        }
        return null;
      };

      const first = rows[0];
      const telKey = findKey(first, ["telefone", "celular", "whatsapp", "phone", "numero", "número", "fone"]);
      const nomeKey = findKey(first, ["nome", "name", "contato"]);

      if (!telKey) {
        return toast.error("Não encontrei coluna de telefone (telefone/celular/whatsapp/phone).");
      }

      const parsed = rows
        .map((r) => ({
          nome: nomeKey ? String(r[nomeKey] ?? "").trim() || null : null,
          telefone: normalizeTel(r[telKey]),
        }))
        .filter((c) => c.telefone.length >= 8);

      if (!parsed.length) return toast.error("Nenhum telefone válido encontrado.");
      setContatos(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} contato(s) carregado(s)`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Falha ao ler arquivo");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearFile() {
    setContatos([]);
    setFileName("");
  }

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    const msgs = mensagens.split("\n---\n").map((m) => m.trim()).filter(Boolean);
    if (msgs.length < 2) return toast.error("Inclua ao menos 2 variações separadas por linha com ---");
    setBusy(true);
    const { data: created, error } = await supabase
      .from("disparo_campanhas")
      .insert({
        portfolio_id: portfolioId,
        nome: nome.trim(),
        mensagens: msgs,
        planilha_url: planilha.trim() || (fileName ? `arquivo:${fileName}` : null),
        delay_min_seg: dMin,
        delay_max_seg: dMax,
        total_contatos: contatos.length,
      })
      .select("id")
      .single();
    if (error || !created) {
      setBusy(false);
      return toast.error(error?.message || "Falha ao criar campanha");
    }

    if (contatos.length) {
      const payload = contatos.map((c) => ({
        campanha_id: created.id,
        nome: c.nome,
        telefone: c.telefone,
      }));
      // Insere em lotes para evitar request gigante
      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error: cErr } = await supabase.from("disparo_contatos").insert(slice);
        if (cErr) {
          setBusy(false);
          return toast.error(`Contatos: ${cErr.message}`);
        }
      }
    }

    setBusy(false);
    toast.success(`Campanha criada${contatos.length ? ` com ${contatos.length} contatos` : ""}!`);
    setNome(""); setMensagens(""); setPlanilha(""); setDMin(8); setDMax(20);
    clearFile();
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
          <div className="space-y-2">
            <Label>Contatos (planilha XLSX, XLS ou CSV)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Upload size={14} /> Importar planilha
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {fileName && (
                <div className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                  <FileSpreadsheet size={12} />
                  <span className="truncate max-w-[180px]">{fileName}</span>
                  <Badge variant="outline" className="text-[10px]">{contatos.length}</Badge>
                  <button type="button" onClick={clearFile} className="ml-1 hover:text-destructive">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A planilha deve ter colunas <code>telefone</code> (ou celular/whatsapp/phone) e opcionalmente <code>nome</code>.
            </p>
          </div>
          <div>
            <Label>Ou link de planilha (opcional)</Label>
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
