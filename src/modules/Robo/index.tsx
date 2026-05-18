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
import { Loader2, Plus, Zap, Trash2, Play, Pause, RefreshCw, Settings } from "lucide-react";

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
  dias_semana: any;
  mensagens: any;
  destinos: any;
  total_enviados?: number;
  ultimo_erro?: string | null;
  proxima_execucao?: string | null;
};

type Agent = { id: string; nome: string; instancia_id: string | null; status: string };
type Grupo = { id: string; nome: string };

const DIAS = [
  { v: "seg", l: "Seg" }, { v: "ter", l: "Ter" }, { v: "qua", l: "Qua" },
  { v: "qui", l: "Qui" }, { v: "sex", l: "Sex" }, { v: "sab", l: "Sáb" }, { v: "dom", l: "Dom" },
];

export default function RoboModule({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Robo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["robo", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("robo_campanhas" as any)
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Robo[];
    },
  });

  async function toggle(r: Robo) {
    const novo = r.status === "ativo" ? "pausado" : "ativo";
    if (novo === "ativo") {
      const mens = Array.isArray(r.mensagens) ? r.mensagens : [];
      const dest = Array.isArray(r.destinos) ? r.destinos : [];
      if (!r.instancia_id || mens.length === 0 || dest.length === 0) {
        return toast.error("Configure instância, mensagens e destinos antes de ativar.");
      }
    }
    const { error } = await supabase.from("robo_campanhas" as any)
      .update({ status: novo, proxima_execucao: null } as any).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "ativo" ? "Robô ativado!" : "Robô pausado");
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir robô?")) return;
    const { error } = await supabase.from("robo_campanhas" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Robô de Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Envia mensagens para grupos do WhatsApp em horários e intervalos aleatórios — anti-ban.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-2">
          <Plus size={14} /> Novo robô
        </Button>
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
          {(data ?? []).map((r) => {
            const mens = Array.isArray(r.mensagens) ? r.mensagens : [];
            const dest = Array.isArray(r.destinos) ? r.destinos : [];
            const dias = Array.isArray(r.dias_semana) ? r.dias_semana : [];
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{r.nome}</p>
                      <Badge variant={r.status === "ativo" ? "default" : "outline"} className="text-[10px]">
                        {r.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {dest.length} grupo(s)
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {mens.length} msg(s)
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {String(r.horario_inicio).slice(0, 5)}–{String(r.horario_fim).slice(0, 5)} ·{" "}
                      {r.intervalo_min_min}–{r.intervalo_max_min} min · {dias.join(", ")}
                    </p>
                    {r.total_enviados ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        ✓ {r.total_enviados} enviadas
                        {r.proxima_execucao && r.status === "ativo" && (
                          <> · próxima: {new Date(r.proxima_execucao).toLocaleString("pt-BR")}</>
                        )}
                      </p>
                    ) : null}
                    {r.ultimo_erro && (
                      <p className="text-xs text-destructive mt-1 truncate">⚠ {r.ultimo_erro}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Settings size={14} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggle(r)}>
                      {r.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RoboDialog
        open={open} onOpenChange={setOpen} portfolioId={portfolioId}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["robo", portfolioId] })}
      />
    </div>
  );
}

function RoboDialog({
  open, onOpenChange, portfolioId, editing, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  portfolioId: string; editing: Robo | null; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [agentId, setAgentId] = useState<string>("");
  const [instanciaId, setInstanciaId] = useState<string>(editing?.instancia_id ?? "");
  const [mensagensTxt, setMensagensTxt] = useState<string>(
    Array.isArray(editing?.mensagens) ? (editing!.mensagens as string[]).join("\n---\n") : ""
  );
  const [destinos, setDestinos] = useState<string[]>(
    Array.isArray(editing?.destinos) ? (editing!.destinos as string[]) : []
  );
  const [hIni, setHIni] = useState(editing?.horario_inicio?.slice(0, 5) ?? "09:00");
  const [hFim, setHFim] = useState(editing?.horario_fim?.slice(0, 5) ?? "20:00");
  const [iMin, setIMin] = useState(editing?.intervalo_min_min ?? 30);
  const [iMax, setIMax] = useState(editing?.intervalo_max_min ?? 90);
  const [dias, setDias] = useState<string[]>(
    Array.isArray(editing?.dias_semana) ? (editing!.dias_semana as string[]) : ["seg", "ter", "qua", "qui", "sex"]
  );
  const [busy, setBusy] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["wa-agents", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_agents")
        .select("id, nome, instancia_id, status")
        .eq("portfolio_id", portfolioId);
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: open,
  });

  async function carregarGrupos() {
    if (!agentId) return toast.error("Selecione um agente WhatsApp conectado");
    setLoadingGrupos(true);
    const { data, error } = await supabase.functions.invoke("evolution-instance", {
      body: { action: "groups", agentId },
    });
    setLoadingGrupos(false);
    if (error) return toast.error(error.message);
    const gs = (data?.groups ?? []) as Grupo[];
    if (gs.length === 0) toast.warning("Nenhum grupo encontrado nessa instância");
    setGrupos(gs);
  }

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome");
    const mensagens = mensagensTxt.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean);
    if (mensagens.length === 0) return toast.error("Adicione pelo menos uma mensagem");
    if (destinos.length === 0) return toast.error("Selecione pelo menos um grupo de destino");
    if (!instanciaId) return toast.error("Selecione a instância WhatsApp");

    setBusy(true);
    const payload: any = {
      portfolio_id: portfolioId,
      nome: nome.trim(),
      tipo: "mensagem",
      instancia_id: instanciaId,
      mensagens,
      destinos,
      horario_inicio: hIni,
      horario_fim: hFim,
      intervalo_min_min: iMin,
      intervalo_max_min: iMax,
      dias_semana: dias,
      proxima_execucao: null,
    };
    const q = editing
      ? supabase.from("robo_campanhas" as any).update(payload).eq("id", editing.id)
      : supabase.from("robo_campanhas" as any).insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Robô atualizado!" : "Robô criado!");
    onOpenChange(false);
    onSaved();
  }

  const agentesConectados = (agents ?? []).filter((a) => a.instancia_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar robô" : "Novo robô"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Grupo Promoções" />
          </div>

          <div>
            <Label>Agente WhatsApp (instância conectada)</Label>
            <Select value={agentId} onValueChange={(v) => {
              setAgentId(v);
              const a = agentesConectados.find((x) => x.id === v);
              if (a?.instancia_id) setInstanciaId(a.instancia_id);
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente conectado" /></SelectTrigger>
              <SelectContent>
                {agentesConectados.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">
                    Nenhum agente conectado. Conecte um na aba WhatsApp primeiro.
                  </div>
                ) : agentesConectados.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome} {a.status === "active" ? "✓" : `(${a.status})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instanciaId && (
              <p className="text-xs text-muted-foreground mt-1">Instância: <code>{instanciaId}</code></p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Grupos de destino</Label>
              <Button type="button" size="sm" variant="outline" onClick={carregarGrupos}
                disabled={!agentId || loadingGrupos} className="gap-1">
                {loadingGrupos ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Carregar grupos
              </Button>
            </div>
            {grupos.length === 0 && destinos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Clique em "Carregar grupos" para listar os grupos da instância.
              </p>
            ) : (
              <div className="border border-border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                {grupos.length > 0 ? grupos.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={destinos.includes(g.id)}
                      onChange={() => setDestinos((cur) =>
                        cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]
                      )}
                    />
                    <span className="truncate">{g.nome}</span>
                  </label>
                )) : destinos.map((d) => (
                  <div key={d} className="text-xs text-muted-foreground truncate">
                    Selecionado: {d}
                  </div>
                ))}
              </div>
            )}
            {destinos.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{destinos.length} grupo(s) selecionado(s)</p>
            )}
          </div>

          <div>
            <Label>Mensagens (uma por bloco, separadas por uma linha com <code>---</code>)</Label>
            <Textarea
              rows={6}
              value={mensagensTxt}
              onChange={(e) => setMensagensTxt(e.target.value)}
              placeholder={"Bom dia! Confira nossas promoções 🚀\n---\nAproveite o cupom GA10 hoje!\n---\nÚltimas unidades disponíveis 🔥"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Uma mensagem aleatória será escolhida a cada disparo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Horário início</Label>
              <Input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} />
            </div>
            <div>
              <Label>Horário fim</Label>
              <Input type="time" value={hFim} onChange={(e) => setHFim(e.target.value)} />
            </div>
            <div>
              <Label>Intervalo mín (min)</Label>
              <Input type="number" min={1} value={iMin} onChange={(e) => setIMin(Number(e.target.value))} />
            </div>
            <div>
              <Label>Intervalo máx (min)</Label>
              <Input type="number" min={1} value={iMax} onChange={(e) => setIMax(Number(e.target.value))} />
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
            {busy ? <Loader2 className="animate-spin" size={14} /> : editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
