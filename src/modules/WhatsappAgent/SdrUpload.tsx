import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload, Link2, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

type Row = Record<string, any>;
const EXPECTED = ["telefone", "nome", "nicho", "instagram", "motivo_contato", "enviado"] as const;
type Field = (typeof EXPECTED)[number];

function autoDetect(headers: string[]): Record<Field, string | null> {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "");
  const map: Record<string, Field> = {
    telefone: "telefone", celular: "telefone", whatsapp: "telefone", phone: "telefone", numero: "telefone",
    nome: "nome", name: "nome", responsavel: "nome", contato: "nome",
    nicho: "nicho", segmento: "nicho", categoria: "nicho",
    instagram: "instagram", ig: "instagram", insta: "instagram",
    motivocontato: "motivo_contato", motivo: "motivo_contato", briefing: "motivo_contato", motivodecontato: "motivo_contato",
    enviado: "enviado", status: "enviado",
  };
  const out: Record<Field, string | null> = { telefone: null, nome: null, nicho: null, instagram: null, motivo_contato: null, enviado: null };
  for (const h of headers) {
    const f = map[norm(h)];
    if (f && !out[f]) out[f] = h;
  }
  return out;
}

export function SdrUpload({
  portfolioId,
  onCreated,
}: {
  portfolioId: string;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"file" | "sheet">("file");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<Field, string | null>>({
    telefone: null, nome: null, nicho: null, instagram: null, motivo_contato: null, enviado: null,
  });
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [ratePerHour, setRatePerHour] = useState(30);

  function ingest(json: Row[]) {
    if (!json.length) { toast.error("Planilha vazia"); return; }
    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setRows(json);
    setMapping(autoDetect(hdrs));
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const first = wb.SheetNames[0];
      const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[first], { defval: "" });
      ingest(json);
    } catch (e: any) {
      toast.error("Falha ao ler arquivo: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSheet() {
    setBusy(true);
    try {
      if (!/\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(sheetUrl)) {
        throw new Error("Link do Google Sheets inválido");
      }
      const { data, error } = await supabase.functions.invoke("sdr-sheet-fetch", {
        body: { sheetUrl },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const csv = (data as any)?.csv as string;
      if (!csv) throw new Error("Planilha vazia ou inacessível");
      const wb = XLSX.read(csv, { type: "string" });
      const first = wb.SheetNames[0];
      const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[first], { defval: "" });
      ingest(json);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setBusy(false);
    }
  }

  const preview = rows.slice(0, 5);
  const allRequiredMapped = mapping.telefone && mapping.nicho && mapping.motivo_contato;

  function validateRow(r: Row) {
    const tel = mapping.telefone ? String(r[mapping.telefone] ?? "").trim() : "";
    const nicho = mapping.nicho ? String(r[mapping.nicho] ?? "").trim() : "";
    const motivo = mapping.motivo_contato ? String(r[mapping.motivo_contato] ?? "").trim() : "";
    const digits = tel.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return "telefone inválido";
    if (!nicho) return "nicho vazio";
    if (!motivo) return "motivo vazio";
    return null;
  }

  async function submit() {
    if (!allRequiredMapped) { toast.error("Mapeie telefone, nicho e motivo_contato"); return; }
    const payload = rows.map((r) => ({
      telefone: String(r[mapping.telefone!] ?? ""),
      nome: mapping.nome ? String(r[mapping.nome!] ?? "") : "",
      nicho: String(r[mapping.nicho!] ?? ""),
      instagram: mapping.instagram ? String(r[mapping.instagram!] ?? "") : "",
      motivo_contato: String(r[mapping.motivo_contato!] ?? ""),
    }));
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sdr-upload", {
        body: { portfolioId, nome: campaignName || `Campanha ${new Date().toLocaleDateString("pt-BR")}`, ratePerHour, rows: payload },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const inserted = (data as any)?.inserted ?? 0;
      const rejected = (data as any)?.rejected ?? [];
      toast.success(`Campanha criada com ${inserted} leads${rejected.length ? ` — ${rejected.length} linhas ignoradas` : ""}`);
      setRows([]); setHeaders([]); setCampaignName("");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar campanha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-primary" />
        <h3 className="font-semibold">Importar planilha de prospecção</h3>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={mode === "file" ? "default" : "outline"} onClick={() => setMode("file")} className="gap-2">
          <Upload size={14} /> Arquivo
        </Button>
        <Button size="sm" variant={mode === "sheet" ? "default" : "outline"} onClick={() => setMode("sheet")} className="gap-2">
          <Link2 size={14} /> Google Sheets
        </Button>
      </div>

      {mode === "file" ? (
        <div>
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground mt-1">Aceita .xlsx, .xls e .csv</p>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            disabled={busy}
          />
          <Button onClick={handleSheet} disabled={busy || !sheetUrl}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Conectar"}
          </Button>
        </div>
      )}

      {mode === "sheet" && (
        <p className="text-xs text-muted-foreground">
          A planilha precisa estar configurada como <strong>"qualquer um com o link"</strong> (visualização pública).
        </p>
      )}

      {headers.length > 0 && (
        <>
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-2">Mapeamento de colunas</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {EXPECTED.filter((f) => f !== "enviado").map((field) => {
                const required = ["telefone", "nicho", "motivo_contato"].includes(field);
                return (
                  <div key={field}>
                    <Label className="text-xs">
                      {field} {required && <span className="text-destructive">*</span>}
                      {field === "instagram" && (
                        <span className="text-muted-foreground ml-1" title="Análise de Instagram será ativada em versão futura.">(salvo, não analisado)</span>
                      )}
                    </Label>
                    <Select
                      value={mapping[field] ?? "__none__"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === "__none__" ? null : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— não usar —</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-2">Preview (primeiras 5 linhas)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-1.5">#</th>
                    {EXPECTED.filter((f) => f !== "enviado").map((f) => (
                      <th key={f} className="text-left p-1.5">{f}</th>
                    ))}
                    <th className="text-left p-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => {
                    const err = validateRow(r);
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="p-1.5">{i + 1}</td>
                        {EXPECTED.filter((f) => f !== "enviado").map((f) => (
                          <td key={f} className="p-1.5 max-w-[180px] truncate">
                            {mapping[f] ? String(r[mapping[f]!] ?? "") : <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                        <td className="p-1.5">
                          {err ? (
                            <Badge variant="destructive" className="gap-1"><AlertCircle size={10} />{err}</Badge>
                          ) : (
                            <Badge className="bg-green-500/15 text-green-400 border border-green-500/30 gap-1">
                              <CheckCircle2 size={10} /> OK
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{rows.length} linha(s) no total</p>
          </div>

          <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex: Bares zona sul - dez/26" />
            </div>
            <div>
              <Label>Máximo de disparos por hora</Label>
              <Input type="number" min={1} max={500} value={ratePerHour} onChange={(e) => setRatePerHour(Number(e.target.value) || 30)} />
            </div>
          </div>

          <Button onClick={submit} disabled={busy || !allRequiredMapped} className="w-full">
            {busy ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
            Criar campanha com {rows.length} lead(s)
          </Button>
        </>
      )}
    </Card>
  );
}
