import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, MapPin, Download, Search } from "lucide-react";

type Lead = {
  nome: string;
  categoria: string;
  endereco: string;
  telefone: string;
  website: string;
  avaliacao: number | null;
  total_avaliacoes: number | null;
  status: string;
  maps_url: string;
  place_id: string;
};

// Filtra só celulares BR (DDD + 9XXXXXXXX). Retorna E.164 sem "+" (ex: 5514991234567) ou "" se for fixo.
function extrairCelularBR(tel: string): string {
  if (!tel) return "";
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return ""; // celular BR = DDD (2) + 9 + 8 dígitos
  if (d[2] !== "9") return "";    // celular sempre começa com 9 após o DDD
  return "55" + d;
}

export function GoogleMapsTab() {
  const [nicho, setNicho] = useState("Restaurante");
  const [cidade, setCidade] = useState("Bauru");
  const [limite, setLimite] = useState(50);
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);

  async function buscar() {
    if (!nicho.trim() || !cidade.trim()) return toast.error("Informe nicho e cidade");
    setLoading(true);
    setLeads([]);
    const { data, error } = await supabase.functions.invoke("maps-leads-scraper", {
      body: { nicho: nicho.trim(), cidade: cidade.trim(), limite },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error((data as any).error);
    const raw = ((data as any)?.leads ?? []) as Lead[];
    const found = raw.filter((l) => extrairCelularBR(l.telefone));
    setLeads(found);
    toast.success(`${found.length} leads com celular encontrados`);
  }

  function exportar() {
    if (!leads.length) return;
    const ws = XLSX.utils.json_to_sheet(
      leads.map((l) => {
        const cel = extrairCelularBR(l.telefone);
        return {
          Nome: l.nome,
          Categoria: l.categoria,
          Telefone: l.telefone,
          WhatsApp: cel ? `https://wa.me/${cel}` : "",
          Endereço: l.endereco,
          Website: l.website,
          Avaliação: l.avaliacao ?? "",
          "Total avaliações": l.total_avaliacoes ?? "",
          Status: l.status,
          "Google Maps": l.maps_url,
        };
      }),
    );
    ws["!cols"] = [
      { wch: 32 }, { wch: 22 }, { wch: 18 }, { wch: 32 }, { wch: 50 },
      { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 50 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads Google Maps");
    const fileName = `leads-${nicho}-${cidade}-${Date.now()}`
      .replace(/\s+/g, "_")
      .toLowerCase();
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Nicho</Label>
            <Input
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              placeholder="Restaurante, dentista, academia…"
            />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Bauru, São Paulo…"
            />
          </div>
          <div>
            <Label>Qtd leads (máx 60)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={limite}
              onChange={(e) => setLimite(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={buscar} disabled={loading} className="gap-2 flex-1">
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
              Buscar
            </Button>
            <Button
              onClick={exportar}
              variant="outline"
              disabled={!leads.length}
              className="gap-2"
              title="Exportar para planilha XLSX"
            >
              <Download size={14} /> XLSX
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Busca via Google Maps Places API. Limite por consulta: 60 resultados (limite da API).
        </p>
      </Card>

      {loading && (
        <Card className="p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Buscando leads no Google Maps…
        </Card>
      )}

      {!loading && leads.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto mb-3" size={28} />
          Nenhum resultado ainda. Defina o nicho e a cidade e clique em Buscar.
        </Card>
      )}

      {leads.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-medium">{leads.length} leads</div>
            <Button onClick={exportar} variant="outline" size="sm" className="gap-2">
              <Download size={14} /> Exportar XLSX
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Maps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.place_id}>
                    <TableCell className="font-medium">{l.nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.telefone || "—"}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={l.endereco}>
                      {l.endereco}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.avaliacao ? `${l.avaliacao} (${l.total_avaliacoes ?? 0})` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {l.website ? (
                        <a href={l.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {l.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {l.maps_url ? (
                        <a href={l.maps_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          abrir
                        </a>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
