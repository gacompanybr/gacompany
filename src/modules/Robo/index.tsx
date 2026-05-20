import { useEffect, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Zap, Trash2, Play, Pause, RefreshCw, Settings, ShoppingBag } from "lucide-react";

type Robo = {
  id: string;
  nome: string;
  campaign_type: string;
  marketplace: string | null;
  n8n_datatable_id: string | null;
  n8n_datatable_name: string | null;
  n8n_workflow_id: string | null;
  message_template: string | null;
  planilha_url: string | null;
  horario_inicio: string;
  horario_fim: string;
  intervalo_min_min: number;
  intervalo_max_min: number;
  status: string;
  instancia_id: string | null;
  dias_semana: any;
  mensagens: any;
  destinos: any;
  horarios_por_dia: any;
  total_enviados?: number;
  ultimo_erro?: string | null;
  proxima_execucao?: string | null;
};

type DiaConfig = { enabled: boolean; inicio: string; fim: string; intervalo: number };
type HorariosPorDia = Record<string, DiaConfig>;

const DEFAULT_HORARIOS: HorariosPorDia = {
  seg: { enabled: true, inicio: "09:00", fim: "20:00", intervalo: 30 },
  ter: { enabled: true, inicio: "09:00", fim: "20:00", intervalo: 30 },
  qua: { enabled: true, inicio: "09:00", fim: "20:00", intervalo: 30 },
  qui: { enabled: true, inicio: "09:00", fim: "20:00", intervalo: 30 },
  sex: { enabled: true, inicio: "09:00", fim: "20:00", intervalo: 30 },
  sab: { enabled: false, inicio: "10:00", fim: "18:00", intervalo: 60 },
  dom: { enabled: false, inicio: "10:00", fim: "18:00", intervalo: 60 },
};

type Agent = { id: string; nome: string; instancia_id: string | null; status: string };
type Grupo = { id: string; nome: string };
type DataTable = { id: string; name: string };

const DIAS = [
  { v: "seg", l: "Seg" }, { v: "ter", l: "Ter" }, { v: "qua", l: "Qua" },
  { v: "qui", l: "Qui" }, { v: "sex", l: "Sex" }, { v: "sab", l: "Sáb" }, { v: "dom", l: "Dom" },
];

const MARKETPLACES = [
  { v: "shopee", l: "Shopee" },
  { v: "mercadolivre", l: "Mercado Livre" },
  { v: "amazon", l: "Amazon" },
];

const DEFAULT_TEMPLATE = `🔥 *{productname}*

💰 R$ {price}  ({pricediscountrate}% OFF)
🏪 {shopname}

👉 {offerlink}`;

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
    const ativar = r.status !== "ativo";
    if (ativar) {
      if (!r.n8n_workflow_id) return toast.error("Salve o robô antes de ativar.");
      if (r.campaign_type === "ecommerce") {
        const dest = Array.isArray(r.destinos) ? r.destinos : [];
        if (!r.n8n_datatable_id || dest.length === 0 || !r.instancia_id) {
          return toast.error("Configure data table, grupos e instância antes de ativar.");
        }
      }
    }
    const action = ativar ? "activate" : "deactivate";
    const { error: fnErr } = await supabase.functions.invoke("n8n-sync", {
      body: { action, workflowId: r.n8n_workflow_id },
    });
    if (fnErr) return toast.error(fnErr.message);
    const { error } = await supabase.from("robo_campanhas" as any)
      .update({ status: ativar ? "ativo" : "pausado" } as any).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(ativar ? "Robô ativado no n8n!" : "Robô pausado");
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }

  async function remove(r: Robo) {
    if (!confirm("Excluir robô e apagar workflow do n8n?")) return;
    if (r.n8n_workflow_id) {
      await supabase.functions.invoke("n8n-sync", {
        body: { action: "delete", workflowId: r.n8n_workflow_id },
      });
    }
    const { error } = await supabase.from("robo_campanhas" as any).delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["robo", portfolioId] });
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Robô de Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Automatize disparos via n8n: ecommerce em grupos ou contatos por CSV.
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
            const dest = Array.isArray(r.destinos) ? r.destinos : [];
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{r.nome}</p>
                      <Badge variant={r.status === "ativo" ? "default" : "outline"} className="text-[10px]">
                        {r.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {r.campaign_type === "ecommerce" ? <><ShoppingBag size={10} /> {r.marketplace ?? "ecommerce"}</> : "disparo"}
                      </Badge>
                      {r.campaign_type === "ecommerce" && (
                        <Badge variant="outline" className="text-[10px]">{dest.length} grupo(s)</Badge>
                      )}
                      {r.n8n_workflow_id && (
                        <Badge variant="outline" className="text-[10px]">n8n ✓</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.n8n_datatable_name ? `📊 ${r.n8n_datatable_name} · ` : ""}
                      intervalo {r.intervalo_min_min} min
                    </p>
                    {r.total_enviados ? (
                      <p className="text-xs text-muted-foreground mt-1">✓ {r.total_enviados} enviadas</p>
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
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}>
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
  const [campaignType, setCampaignType] = useState<string>(editing?.campaign_type ?? "ecommerce");
  const [marketplace, setMarketplace] = useState<string>(editing?.marketplace ?? "shopee");
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [agentId, setAgentId] = useState<string>("");
  const [instanciaId, setInstanciaId] = useState<string>(editing?.instancia_id ?? "");
  const [destinos, setDestinos] = useState<string[]>(
    Array.isArray(editing?.destinos) ? (editing!.destinos as string[]) : []
  );
  const [horarios, setHorarios] = useState<HorariosPorDia>(
    (editing?.horarios_por_dia && typeof editing.horarios_por_dia === "object")
      ? { ...DEFAULT_HORARIOS, ...(editing.horarios_por_dia as HorariosPorDia) }
      : DEFAULT_HORARIOS
  );
  const [template, setTemplate] = useState(editing?.message_template ?? DEFAULT_TEMPLATE);
  const [tableId, setTableId] = useState<string>(editing?.n8n_datatable_id ?? "");
  const [tableName, setTableName] = useState<string>(editing?.n8n_datatable_name ?? "");
  const [datatables, setDatatables] = useState<DataTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [planilhaUrl, setPlanilhaUrl] = useState(editing?.planilha_url ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCampaignType(editing?.campaign_type ?? "ecommerce");
    setMarketplace(editing?.marketplace ?? "shopee");
    setNome(editing?.nome ?? "");
    setInstanciaId(editing?.instancia_id ?? "");
    setDestinos(Array.isArray(editing?.destinos) ? (editing!.destinos as string[]) : []);
    setHorarios(
      (editing?.horarios_por_dia && typeof editing.horarios_por_dia === "object")
        ? { ...DEFAULT_HORARIOS, ...(editing.horarios_por_dia as HorariosPorDia) }
        : DEFAULT_HORARIOS
    );
    setTemplate(editing?.message_template ?? DEFAULT_TEMPLATE);
    setTableId(editing?.n8n_datatable_id ?? "");
    setTableName(editing?.n8n_datatable_name ?? "");
    setPlanilhaUrl(editing?.planilha_url ?? "");
    setAgentId("");
    setDatatables([]);
    setGrupos([]);
  }, [open, editing]);

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

  async function carregarDatatables() {
    setLoadingTables(true);
    const { data, error } = await supabase.functions.invoke("n8n-sync", {
      body: { action: "list_datatables", marketplace },
    });
    setLoadingTables(false);
    if (error) return toast.error(error.message);
    const tables = (data?.datatables ?? []) as DataTable[];
    setDatatables(tables);
    if (tables.length === 0) toast.warning(`Nenhuma data table ${marketplace.toUpperCase()} encontrada no n8n`);
  }

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
    if (campaignType === "ecommerce") {
      if (!tableId) return toast.error("Selecione a data table do n8n");
      if (destinos.length === 0) return toast.error("Selecione pelo menos um grupo de destino");
      if (!instanciaId) return toast.error("Selecione a instância WhatsApp");
    } else {
      if (!planilhaUrl.trim()) return toast.error("Informe a URL da planilha de contatos");
    }

    setBusy(true);
    const payload: any = {
      portfolio_id: portfolioId,
      nome: nome.trim(),
      campaign_type: campaignType,
      marketplace: campaignType === "ecommerce" ? marketplace : null,
      n8n_datatable_id: campaignType === "ecommerce" ? tableId : null,
      n8n_datatable_name: campaignType === "ecommerce" ? tableName : null,
      message_template: campaignType === "ecommerce" ? template : null,
      planilha_url: campaignType === "disparo" ? planilhaUrl.trim() : null,
      instancia_id: instanciaId || null,
      destinos,
      horarios_por_dia: horarios,
      dias_semana: DIAS.filter((d) => horarios[d.v]?.enabled).map((d) => d.v),
    };
    // mantém campos legados sincronizados com o menor intervalo configurado
    const intervalos = Object.values(horarios).filter((h) => h.enabled).map((h) => h.intervalo);
    const minInt = intervalos.length ? Math.min(...intervalos) : 30;
    payload.intervalo_min_min = minInt;
    payload.intervalo_max_min = minInt;



    let roboId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("robo_campanhas" as any).update(payload).eq("id", editing.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    } else {
      const { data: inserted, error } = await supabase
        .from("robo_campanhas" as any).insert(payload).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      roboId = (inserted as any).id;
    }

    // Cria/atualiza workflow no n8n
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("n8n-sync", {
      body: { action: "upsert_workflow", roboId },
    });
    setBusy(false);
    if (fnErr) {
      toast.error(`Robô salvo, mas falhou ao sincronizar com n8n: ${fnErr.message}`);
    } else {
      toast.success(`Robô salvo! Workflow n8n: ${fnData?.workflowId ?? "ok"}`);
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar robô" : "Novo robô"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de campanha</Label>
            <RadioGroup value={campaignType} onValueChange={setCampaignType} className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="ecommerce" id="ec" />
                <span className="text-sm">Ecommerce em grupos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="disparo" id="ds" />
                <span className="text-sm">Disparo de contatos</span>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label>Nome do robô</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Promo Shopee Adriana" />
          </div>

          {campaignType === "ecommerce" && (
            <>
              <div>
                <Label>Marketplace</Label>
                <div className="flex gap-2 mt-1">
                  <Select value={marketplace} onValueChange={(v) => { setMarketplace(v); setTableId(""); setTableName(""); setDatatables([]); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MARKETPLACES.map((m) => (
                        <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={carregarDatatables} disabled={loadingTables} className="gap-1">
                    {loadingTables ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Carregar data tables
                  </Button>
                </div>
              </div>

              {(datatables.length > 0 || tableId) && (
                <div>
                  <Label>Data table (fonte dos produtos)</Label>
                  <Select value={tableId} onValueChange={(v) => {
                    setTableId(v);
                    const t = datatables.find((x) => x.id === v);
                    if (t) setTableName(t.name);
                  }}>
                    <SelectTrigger><SelectValue placeholder={tableName || "Selecione a data table"} /></SelectTrigger>
                    <SelectContent>
                      {datatables.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                      {tableId && !datatables.find((d) => d.id === tableId) && (
                        <SelectItem value={tableId}>{tableName || tableId}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Agente WhatsApp</Label>
                <Select value={agentId} onValueChange={async (v) => {
                  setAgentId(v);
                  const { data: conn } = await supabase
                    .from("whatsapp_connections")
                    .select("instance_name,status")
                    .eq("portfolio_id", portfolioId)
                    .maybeSingle();
                  const a = (agents ?? []).find((x) => x.id === v);
                  const live = conn?.instance_name ?? a?.instancia_id ?? "";
                  setInstanciaId(live);
                  if (conn && conn.status !== "connected") {
                    toast.warning(`Instância está ${conn.status}. Conecte primeiro.`);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                  <SelectContent>
                    {(agents ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {instanciaId && <p className="text-xs text-muted-foreground mt-1">Instância: <code>{instanciaId}</code></p>}
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
                  <p className="text-xs text-muted-foreground">Clique em "Carregar grupos".</p>
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
                      <div key={d} className="text-xs text-muted-foreground truncate">Selecionado: {d}</div>
                    ))}
                  </div>
                )}
                {destinos.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{destinos.length} grupo(s) selecionado(s)</p>
                )}
              </div>

              <div>
                <Label>Template da mensagem</Label>
                <Textarea rows={6} value={template} onChange={(e) => setTemplate(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">
                  Placeholders: <code>{"{productname}"}</code> <code>{"{price}"}</code> <code>{"{pricediscountrate}"}</code> <code>{"{shopname}"}</code> <code>{"{offerlink}"}</code> <code>{"{imageUrl}"}</code>
                </p>
              </div>
            </>
          )}

          {campaignType === "disparo" && (
            <div>
              <Label>URL da planilha de contatos (CSV)</Label>
              <Input value={planilhaUrl} onChange={(e) => setPlanilhaUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div className="space-y-2">
            <Label>Cronograma por dia da semana</Label>
            <p className="text-xs text-muted-foreground">
              Ative os dias e configure horário de início, fim e intervalo entre disparos (em minutos) pra cada um.
            </p>
            <div className="border border-border rounded-md divide-y divide-border">
              {DIAS.map((d) => {
                const cfg = horarios[d.v] ?? DEFAULT_HORARIOS[d.v];
                const set = (patch: Partial<DiaConfig>) =>
                  setHorarios((cur) => ({ ...cur, [d.v]: { ...cur[d.v], ...patch } }));
                return (
                  <div key={d.v} className="flex items-center gap-2 p-2 flex-wrap">
                    <label className="flex items-center gap-2 w-20 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!cfg.enabled}
                        onChange={(e) => set({ enabled: e.target.checked })}
                      />
                      <span className="text-sm font-medium">{d.l}</span>
                    </label>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">de</span>
                      <Input
                        type="time"
                        value={cfg.inicio}
                        disabled={!cfg.enabled}
                        onChange={(e) => set({ inicio: e.target.value })}
                        className="h-8 w-28"
                      />
                      <span className="text-muted-foreground">até</span>
                      <Input
                        type="time"
                        value={cfg.fim}
                        disabled={!cfg.enabled}
                        onChange={(e) => set({ fim: e.target.value })}
                        className="h-8 w-28"
                      />
                    </div>
                    <div className="flex items-center gap-1 text-xs ml-auto">
                      <span className="text-muted-foreground">intervalo</span>
                      <Input
                        type="number"
                        min={1}
                        value={cfg.intervalo}
                        disabled={!cfg.enabled}
                        onChange={(e) => set({ intervalo: Number(e.target.value) || 1 })}
                        className="h-8 w-20"
                      />
                      <span className="text-muted-foreground">min</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              O n8n verifica a cada minuto se está dentro de algum dia/horário ativo e respeita o intervalo daquele dia. Se não houver produto novo no data table, ele só aguarda o próximo scraper rodar — sem registrar erro.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : editing ? "Salvar e sincronizar" : "Criar e sincronizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
