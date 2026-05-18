import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Zap, Trash2, Play, Pause } from "lucide-react";

type Robo = {
  id: string;
  nome: string;
  tipo: string;
  prompt: string | null;
  conteudo_url: string | null;
  horario_inicio: string;
  horario_fim: string;
  intervalo_min_min: number;
  intervalo_max_min: number;
  status: string;
  instancia_id: string | null;
  dias_semana: string[];
};

const DIAS = [
  { v: "seg", l: "Seg" }, { v: "ter", l: "Ter" }, { v: "qua", l: "Qua" },
  { v: "qui", l: "Qui" }, { v: "sex", l: "Sex" }, { v: "sab", l: "Sáb" }, { v: "dom", l: "Dom" },
];

export default function RoboModule({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["robo", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("robo_campanhas")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Robo[];
    },
  });

  async function toggle(r: Robo) {
    const novo = r.status === "ativo" ? "pausado" : "ativo";
    const { error } = await supabase.from("robo_campanhas").update({ status: novo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir robô?")) return;
    const { error } = await supabase.from("robo_campanhas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Robô de Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Envios programados em horários definidos. Ideal para grupos de promoções com conteúdo de planilha.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus size={14} /> Novo robô</Button>
      </div>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
      ) : (data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Zap className="mx-auto mb-3" size={28} />
          Nenhum robô configurado.
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{r.nome}</p>
                    <Badge variant="outline" className="text-[10px]">{r.tipo}</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.horario_inicio.slice(0, 5)}–{r.horario_fim.slice(0, 5)} ·{" "}
                    {r.intervalo_min_min}–{r.intervalo_max_min} min ·{" "}
                    {(Array.isArray(r.dias_semana) ? r.dias_semana : []).join(", ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => toggle(r)}>
                    {r.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NovoRoboDialog
        open={open} onOpenChange={setOpen} portfolioId={portfolioId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["robo", portfolioId] })}
      />
    </div>
  );
}

function NovoRoboDialog({
  open, onOpenChange, portfolioId, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  portfolioId: string; onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("mensagem");
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [hIni, setHIni] = useState("09:00");
  const [hFim, setHFim] = useState("20:00");
  const [iMin, setIMin] = useState(30);
  const [iMax, setIMax] = useState(90);
  const [dias, setDias] = useState<string[]>(["seg", "ter", "qua", "qui", "sex"]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    setBusy(true);
    const { error } = await supabase.from("robo_campanhas").insert({
      portfolio_id: portfolioId,
      nome: nome.trim(),
      tipo,
      prompt: prompt.trim() || null,
      conteudo_url: url.trim() || null,
      horario_inicio: hIni,
      horario_fim: hFim,
      intervalo_min_min: iMin,
      intervalo_max_min: iMax,
      dias_semana: dias,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Robô criado!");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo robô</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Grupo Promoções Shopee" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensagem">Mensagem (gerar com prompt)</SelectItem>
                <SelectItem value="conteudo">Conteúdo (planilha/link)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tipo === "mensagem" ? (
            <div>
              <Label>Prompt</Label>
              <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Você vai mandar mensagens de bom dia motivacionais..." />
            </div>
          ) : (
            <div>
              <Label>Link do conteúdo / planilha</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/..." />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="time" value={hFim} onChange={(e) => setHFim(e.target.value)} />
            </div>
            <div>
              <Label>Intervalo mín (min)</Label>
              <Input type="number" value={iMin} onChange={(e) => setIMin(Number(e.target.value))} />
            </div>
            <div>
              <Label>Intervalo máx (min)</Label>
              <Input type="number" value={iMax} onChange={(e) => setIMax(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {DIAS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => setDias((cur) => cur.includes(d.v) ? cur.filter((x) => x !== d.v) : [...cur, d.v])}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    dias.includes(d.v)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {d.l}
                </button>
              ))}
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
