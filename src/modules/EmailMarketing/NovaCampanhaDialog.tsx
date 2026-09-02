import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Upload, Users } from "lucide-react";

type Contato = { email: string; nome?: string; empresa?: string; variaveis: Record<string, string> };

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function NovaCampanhaDialog({
  open, onOpenChange, portfolioId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolioId: string;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("Oi {nome}, tudo bem?\n\n");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("Saber mais");
  const [remetenteNome, setRemetenteNome] = useState("GA Company");
  const [remetenteEmail, setRemetenteEmail] = useState("contato@gacompany.online");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setContatos([]);
  }, [open]);

  function normalizar(rows: any[]): Contato[] {
    const out: Contato[] = [];
    const vistos = new Set<string>();
    for (const r of rows) {
      const entries = Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase(), String(v ?? "").trim()]);
      const map = Object.fromEntries(entries) as Record<string, string>;
      const email = (map["email"] ?? map["e-mail"] ?? map["mail"] ?? "").toLowerCase();
      if (!EMAIL_OK.test(email) || vistos.has(email)) continue;
      vistos.add(email);
      out.push({
        email,
        nome: map["nome"] ?? map["name"] ?? map["contato"] ?? "",
        empresa: map["empresa"] ?? map["nome_empresa"] ?? map["company"] ?? "",
        variaveis: map,
      });
    }
    return out;
  }

  async function importarArquivo(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      const lista = normalizar(rows);
      if (lista.length === 0) return toast.error("Nenhum e-mail válido encontrado. Use uma coluna 'email'.");
      setContatos(lista);
      toast.success(`${lista.length} contatos carregados`);
    } catch (e) {
      toast.error("Não foi possível ler o arquivo");
    }
  }

  async function usarLeadsSalvos() {
    const { data, error } = await supabase
      .from("email_leads")
      .select("email, nome_empresa")
      .eq("portfolio_id", portfolioId)
      .limit(5000);
    if (error) return toast.error(error.message);
    const lista = (data ?? [])
      .filter((l) => EMAIL_OK.test(l.email))
      .map((l) => ({
        email: l.email.toLowerCase(),
        nome: l.nome_empresa ?? "",
        empresa: l.nome_empresa ?? "",
        variaveis: { email: l.email, empresa: l.nome_empresa ?? "" },
      }));
    if (lista.length === 0) return toast.error("Nenhum lead salvo no scrapper");
    setContatos(lista);
    toast.success(`${lista.length} contatos do scrapper carregados`);
  }

  async function salvar() {
    if (!nome.trim()) return toast.error("Dê um nome à campanha");
    if (!assunto.trim()) return toast.error("Informe o assunto");
    if (!corpo.trim()) return toast.error("Escreva a mensagem");
    if (contatos.length === 0) return toast.error("Importe os contatos");
    setBusy(true);

    const { data: camp, error } = await supabase
      .from("email_campanhas")
      .insert({
        portfolio_id: portfolioId,
        nome: nome.trim(),
        assunto: assunto.trim(),
        corpo,
        link_url: linkUrl.trim() || null,
        link_label: linkLabel.trim() || null,
        remetente_nome: remetenteNome.trim() || null,
        remetente_email: remetenteEmail.trim() || null,
        status: "rascunho",
        total_contatos: contatos.length,
      })
      .select("id")
      .single();

    if (error || !camp) {
      setBusy(false);
      return toast.error(error?.message ?? "Erro ao criar campanha");
    }

    const rows = contatos.map((c) => ({
      campanha_id: camp.id,
      portfolio_id: portfolioId,
      email: c.email,
      nome: c.nome || null,
      empresa: c.empresa || null,
      variaveis: c.variaveis,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: eIns } = await supabase
        .from("email_destinatarios")
        .upsert(rows.slice(i, i + 500), { onConflict: "campanha_id,email", ignoreDuplicates: true });
      if (eIns) {
        setBusy(false);
        return toast.error(eIns.message);
      }
    }

    setBusy(false);
    toast.success("Campanha criada!");
    setNome(""); setAssunto(""); setLinkUrl("");
    setCorpo("Oi {nome}, tudo bem?\n\n");
    setContatos([]);
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova campanha de e-mail</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Prospecção academias" />
            </div>
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="{empresa}, uma ideia rápida" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Remetente (nome)</Label>
              <Input value={remetenteNome} onChange={(e) => setRemetenteNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Remetente (e-mail)</Label>
              <Input value={remetenteEmail} onChange={(e) => setRemetenteEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea
              rows={9}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Oi {nome}, tudo bem?"
            />
            <p className="text-xs text-muted-foreground">
              Personalize com <code>{"{nome}"}</code>, <code>{"{empresa}"}</code> ou qualquer coluna da planilha.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Link (opcional)</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://gacompany.online" />
            </div>
            <div className="space-y-1.5">
              <Label>Texto do botão</Label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <Label>Contatos</Label>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2">
                <label className="cursor-pointer">
                  <Upload size={14} /> Enviar planilha (CSV/XLSX)
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && importarArquivo(e.target.files[0])}
                  />
                </label>
              </Button>
              <Button variant="outline" onClick={usarLeadsSalvos} className="gap-2">
                <Users size={14} /> Usar e-mails do scrapper
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {contatos.length > 0
                ? `${contatos.length} contatos prontos para envio.`
                : "A planilha precisa ter uma coluna 'email'. Colunas extras ficam disponíveis como variáveis."}
            </p>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
