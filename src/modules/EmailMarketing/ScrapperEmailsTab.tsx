import { useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Search, Mail, Trash2 } from "lucide-react";

type LeadRow = {
  id: string;
  email: string;
  nome_empresa: string | null;
  nicho: string | null;
  cidade: string | null;
  telefone: string | null;
  website: string | null;
  created_at: string;
};

export function ScrapperEmailsTab({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [nicho, setNicho] = useState("Restaurante");
  const [cidade, setCidade] = useState("Bauru");
  const [limite, setLimite] = useState(20);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["email-leads", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_leads")
        .select("id, email, nome_empresa, nicho, cidade, telefone, website, created_at")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const filtrados = leads.filter((l) => {
    const t = busca.toLowerCase();
    if (!t) return true;
    return [l.email, l.nome_empresa, l.nicho, l.cidade]
      .some((v) => (v ?? "").toLowerCase().includes(t));
  });

  async function buscar() {
    if (!nicho.trim() || !cidade.trim()) return toast.error("Informe nicho e cidade");
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("email-scraper", {
      body: {
        portfolio_id: portfolioId,
        nicho: nicho.trim(),
        cidade: cidade.trim(),
        limite,
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    const total = (data as any)?.total ?? 0;
    toast.success(
      total > 0
        ? `${total} e-mail(s) encontrados em ${(data as any)?.com_site ?? 0} sites`
        : "Nenhum e-mail público encontrado nesta busca",
    );
    qc.invalidateQueries({ queryKey: ["email-leads", portfolioId] });
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("email_leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["email-leads", portfolioId] });
  }

  function exportar() {
    if (filtrados.length === 0) return toast.error("Nada para exportar");
    const rows = filtrados.map((l) => ({
      email: l.email,
      empresa: l.nome_empresa ?? "",
      nicho: l.nicho ?? "",
      cidade: l.cidade ?? "",
      telefone: l.telefone ?? "",
      website: l.website ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "emails");
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `emails-${nicho}-${cidade}.csv`.toLowerCase().replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search size={15} className="text-primary" /> Buscar e-mails por nicho e localidade
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Nicho</Label>
            <Input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Academia" />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Bauru" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade de negócios</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={buscar} disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
              Buscar
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A busca localiza negócios no Google Maps e procura e-mails públicos no site de cada um
          (home, contato, sobre). Pode levar 1–2 minutos.
        </p>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            placeholder="Filtrar e-mails, empresa, nicho..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtrados.length} e-mails</span>
          <Button variant="outline" onClick={exportar} className="gap-2">
            <Download size={14} /> Exportar CSV
          </Button>
        </div>
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
                <TableHead>E-mail</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    <Mail className="mx-auto mb-2 opacity-40" size={22} />
                    Nenhum e-mail salvo ainda.
                  </TableCell>
                </TableRow>
              )}
              {filtrados.slice(0, 300).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.email}</TableCell>
                  <TableCell className="text-sm">{l.nome_empresa ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.nicho ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.cidade ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.telefone ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => excluir(l.id)} title="Excluir">
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
