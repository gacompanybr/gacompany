import { useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Loader2, Plus, Send, Trash2, Play, Pause, Upload, FileSpreadsheet, RefreshCw, Users, Link2 } from "lucide-react";
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
  lote_tamanho: number;
  pausa_lote_min: number;
  total_contatos: number;
  enviados: number;
  instancia_id: string | null;
};


type Agent = { id: string; nome: string; nome_atendente?: string | null; instancia_id: string | null; status: string };
type WaContact = { jid: string; phone: string; nome: string };
type Contato = { nome: string; telefone: string; variaveis: Record<string, any> };

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
    refetchInterval: 10000,
  });

  async function toggleStatus(c: Campanha) {
    const novo = c.status === "executando" ? "pausada" : "executando";
    const { error } = await supabase
      .from("disparo_campanhas")
      .update({ status: novo })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["disparo", portfolioId] });
    if (novo === "executando") {
      toast.success("Campanha iniciada — disparando em background");
      // Aciona o worker imediatamente
      supabase.functions.invoke("disparo-worker", { body: { campanhaId: c.id } })
        .catch((e) => console.warn("worker invoke falhou", e));
    } else {
      toast.success("Campanha pausada");
    }
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
                    {c.enviados}/{c.total_contatos} enviados · delay {c.delay_min_seg}–{c.delay_max_seg}s ·
                    lote {c.lote_tamanho} · pausa {c.pausa_lote_min}min
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
  const [mensagem, setMensagem] = useState("");
  const [dMin, setDMin] = useState(8);
  const [dMax, setDMax] = useState(20);
  const [loteTamanho, setLoteTamanho] = useState(10);
  const [pausaLoteMin, setPausaLoteMin] = useState(15);
  const [busy, setBusy] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [sheetUrl, setSheetUrl] = useState<string>("");
  const [importMode, setImportMode] = useState<"file" | "sheet">("file");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [skipCount, setSkipCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);


  // Agente WhatsApp / Instância
  const [agentId, setAgentId] = useState<string>("");
  const [waContacts, setWaContacts] = useState<WaContact[]>([]);
  const [loadingWa, setLoadingWa] = useState(false);
  const [filtroContato, setFiltroContato] = useState("");
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());

  const { data: agents } = useQuery({
    queryKey: ["wa-agents-disparo", portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_agents")
        .select("id, nome, nome_atendente, instancia_id, status")
        .eq("portfolio_id", portfolioId);
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setNome(""); setMensagem(""); setDMin(8); setDMax(20); setLoteTamanho(10); setPausaLoteMin(15);
      setContatos([]); setArquivoNome(""); setSheetUrl(""); setImportMode("file"); setSkipCount(0);
      setAgentId(""); setWaContacts([]); setSelectedJids(new Set()); setFiltroContato("");
    }
  }, [open]);

  const selectedAgent = useMemo(
    () => (agents ?? []).find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  );

  function normalizarTelefone(v: any): string {
    let p = String(v ?? "").replace(/\D/g, "");
    // Garante DDI 55 para Brasil (10 ou 11 dígitos sem DDI)
    if ((p.length === 10 || p.length === 11) && !p.startsWith("55")) p = "55" + p;
    return p;
  }

  function parseRows(rows: Record<string, any>[]): { parsed: Contato[]; skipped: number } {
    if (!rows.length) return { parsed: [], skipped: 0 };
    const keys = Object.keys(rows[0]);
    const nomeKey = keys.find((k) => /^(nome|name|contato)$/i.test(k.trim())) || keys.find((k) => /nome|name|contato/i.test(k));
    const telKey = keys.find((k) => /^(numero|número|telefone|tel|whatsapp|celular|phone)$/i.test(k.trim())) || keys.find((k) => /tel|fone|whats|celular|phone|number|numero|número/i.test(k));
    const nichoKey = keys.find((k) => /^(nicho|segmento|categoria)$/i.test(k.trim())) || keys.find((k) => /nicho|segmento|categoria/i.test(k));
    const envioKey = keys.find((k) => /^(envio|enviado|status)$/i.test(k.trim())) || keys.find((k) => /envio|enviado/i.test(k));
    if (!telKey) {
      toast.error("A planilha precisa ter uma coluna 'numero' (ou 'telefone').");
      return { parsed: [], skipped: 0 };
    }
    let skipped = 0;
    const parsed: Contato[] = [];
    for (const r of rows) {
      const envioVal = envioKey ? String(r[envioKey] ?? "").trim().toLowerCase() : "";
      // Linhas marcadas como já enviadas ("sim", "yes", "true", "1") são puladas
      if (/^(sim|s|yes|y|true|1|enviado)$/i.test(envioVal)) { skipped++; continue; }
      const telefone = normalizarTelefone(r[telKey]);
      if (telefone.length < 8) continue;
      const nome = nomeKey ? String(r[nomeKey] ?? "").trim() : "";
      const variaveis: Record<string, any> = {};
      if (nichoKey) variaveis.nicho = String(r[nichoKey] ?? "").trim();
      for (const k of keys) {
        if (k === telKey || k === nomeKey || k === nichoKey || k === envioKey) continue;
        variaveis[k] = r[k];
      }
      parsed.push({ nome, telefone, variaveis });
    }
    return { parsed, skipped };
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      const { parsed, skipped } = parseRows(rows);
      if (!parsed.length) {
        if (skipped > 0) toast.warning(`Todos os ${skipped} contatos já estão marcados como enviados (envio=sim).`);
        else toast.error("Nenhum contato válido encontrado.");
        return;
      }
      setContatos(parsed);
      setSkipCount(skipped);
      setArquivoNome(file.name);
      setSheetUrl("");
      toast.success(`${parsed.length} contatos carregados${skipped > 0 ? ` (${skipped} pulados por envio=sim)` : ""}`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + (e?.message ?? e));
    }
  }

  async function handleSheet() {
    if (!/\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(sheetUrl)) {
      return toast.error("Link do Google Sheets inválido");
    }
    setLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke("sdr-sheet-fetch", { body: { sheetUrl } });
      let payload: any = data;
      if (error) {
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") payload = await ctx.json();
          else if (ctx && typeof ctx.text === "function") payload = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
        if (!payload?.error && !payload?.csv) throw error;
      }
      if (payload?.error) throw new Error(payload.error);
      const csv = payload?.csv as string;
      if (!csv) throw new Error("Planilha vazia ou inacessível");
      const wb = XLSX.read(csv, { type: "string" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      const { parsed, skipped } = parseRows(rows);
      if (!parsed.length) {
        if (skipped > 0) toast.warning(`Todos os ${skipped} contatos já estão marcados como enviados (envio=sim).`);
        else toast.error("Nenhum contato válido encontrado.");
        return;
      }
      setContatos(parsed);
      setSkipCount(skipped);
      setArquivoNome("");
      toast.success(`${parsed.length} contatos carregados da planilha${skipped > 0 ? ` (${skipped} pulados por envio=sim)` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setLoadingSheet(false);
    }
  }

  async function carregarContatosDoNumero() {
    if (!agentId) return toast.error("Selecione um agente WhatsApp");
    setLoadingWa(true);
    const { data, error } = await supabase.functions.invoke("evolution-instance", {
      body: { action: "contacts", agentId },
    });
    setLoadingWa(false);
    if (error) return toast.error(error.message);
    const list = (data?.contacts ?? []) as WaContact[];
    if (!list.length) return toast.warning("Nenhum contato encontrado nesse número");
    setWaContacts(list);
    setSelectedJids(new Set());
    toast.success(`${list.length} contatos carregados do WhatsApp`);
  }

  const contatosFiltrados = useMemo(() => {
    const q = filtroContato.trim().toLowerCase();
    if (!q) return waContacts;
    return waContacts.filter(
      (c) => c.nome.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [waContacts, filtroContato]);

  function toggleAll() {
    if (selectedJids.size === contatosFiltrados.length) {
      setSelectedJids(new Set());
    } else {
      setSelectedJids(new Set(contatosFiltrados.map((c) => c.jid)));
    }
  }

  async function save() {
    if (!nome.trim()) return toast.error("Informe um nome para a campanha");
    const msg = mensagem.trim();
    if (!msg) return toast.error("Escreva a mensagem que será enviada");

    // Junta contatos: selecionados do WA + da planilha
    const fromWa: Contato[] = waContacts
      .filter((c) => selectedJids.has(c.jid))
      .map((c) => ({ nome: c.nome, telefone: normalizarTelefone(c.phone), variaveis: {} }));
    const todosContatos = [...fromWa, ...contatos.map((c) => ({ ...c, telefone: normalizarTelefone(c.telefone) }))];

    // dedup por telefone normalizado (com DDI)
    const dedup: Contato[] = [];
    const seen = new Set<string>();
    let dupCount = 0;
    for (const c of todosContatos) {
      if (!c.telefone || c.telefone.length < 10) continue;
      if (seen.has(c.telefone)) { dupCount++; continue; }
      seen.add(c.telefone);
      dedup.push(c);
    }
    if (dupCount > 0) toast.info(`${dupCount} contato(s) duplicado(s) removido(s)`);

    if (!dedup.length) {
      return toast.error("Selecione contatos do WhatsApp ou importe uma planilha");
    }

    if (!selectedAgent?.instancia_id) {
      return toast.error("Selecione um agente WhatsApp com número conectado");
    }

    setBusy(true);
    const { data: campanha, error } = await supabase.from("disparo_campanhas").insert({
      portfolio_id: portfolioId,
      nome: nome.trim(),
      mensagens: [msg],
      delay_min_seg: dMin,
      delay_max_seg: dMax,
      lote_tamanho: loteTamanho,
      pausa_lote_min: pausaLoteMin,
      total_contatos: dedup.length,
      instancia_id: selectedAgent.instancia_id,
      planilha_url: sheetUrl || null,
      status: "rascunho",
    }).select("id").single();

    if (error || !campanha) {
      setBusy(false);
      return toast.error(error?.message ?? "Erro ao criar campanha");
    }

    const chunk = 500;
    for (let i = 0; i < dedup.length; i += chunk) {
      const slice = dedup.slice(i, i + chunk).map((c) => ({
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
    setBusy(false);
    toast.success(`Campanha criada com ${dedup.length} contatos! Clique em ▶ para iniciar.`);
    onOpenChange(false);
    onCreated();
  }

  const totalSelecionado =
    (Array.from(selectedJids).length) + contatos.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova campanha de disparo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome da campanha</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Promo Black Friday" />
          </div>

          <div>
            <Label>Mensagem</Label>
            <Textarea
              rows={5}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder={"Oi {nome}, tudo bem? Passando pra te avisar..."}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code>{"{nome}"}</code> para personalizar com o nome do contato.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Delay mínimo entre disparos (segundos)</Label>
              <Input type="number" min={1} value={dMin} onChange={(e) => setDMin(Number(e.target.value))} />
            </div>
            <div>
              <Label>Delay máximo (segundos)</Label>
              <Input type="number" min={dMin} value={dMax} onChange={(e) => setDMax(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tamanho do lote (mensagens por bloco)</Label>
              <Input type="number" min={1} value={loteTamanho} onChange={(e) => setLoteTamanho(Number(e.target.value))} />
            </div>
            <div>
              <Label>Pausa entre lotes (minutos)</Label>
              <Input type="number" min={0} value={pausaLoteMin} onChange={(e) => setPausaLoteMin(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Ex.: 50 contatos com lote de 10 e pausa de 15min → envia 10, espera 15min, envia mais 10, e assim por diante. Reduz risco de ban.
          </p>


          <Card className="p-3 space-y-3">
            <div>
              <Label>Número do WhatsApp (agente conectado)</Label>
              <Select value={agentId} onValueChange={(v) => { setAgentId(v); setWaContacts([]); setSelectedJids(new Set()); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o agente WhatsApp" /></SelectTrigger>
                <SelectContent>
                  {(agents ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.instancia_id}>
                      {a.nome_atendente || a.nome} {a.instancia_id ? "(conectado)" : "(sem número)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Os disparos serão enviados pelo número conectado nesse agente.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Label className="m-0">Contatos do número</Label>
                <Button type="button" size="sm" variant="outline" onClick={carregarContatosDoNumero} disabled={!agentId || loadingWa} className="gap-2">
                  {loadingWa ? <Loader2 className="animate-spin" size={12} /> : <Users size={12} />}
                  Carregar contatos
                </Button>
              </div>
              {waContacts.length > 0 && (
                <>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Buscar por nome ou número..."
                      value={filtroContato}
                      onChange={(e) => setFiltroContato(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={toggleAll}>
                      {selectedJids.size === contatosFiltrados.length ? "Limpar" : "Todos"}
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-border rounded">
                    {contatosFiltrados.map((c) => (
                      <label
                        key={c.jid}
                        className="flex items-center gap-2 p-2 hover:bg-muted/40 cursor-pointer border-b border-border/50 text-sm"
                      >
                        <Checkbox
                          checked={selectedJids.has(c.jid)}
                          onCheckedChange={(checked) => {
                            setSelectedJids((cur) => {
                              const next = new Set(cur);
                              if (checked) next.add(c.jid); else next.delete(c.jid);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate flex-1">{c.nome || "(sem nome)"}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedJids.size} de {waContacts.length} contatos selecionados
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card className="p-3 space-y-3">
            <Label>Importar planilha de contatos</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={importMode === "file" ? "default" : "outline"} onClick={() => setImportMode("file")} className="gap-2">
                <Upload size={14} /> Arquivo
              </Button>
              <Button type="button" size="sm" variant={importMode === "sheet" ? "default" : "outline"} onClick={() => setImportMode("sheet")} className="gap-2">
                <Link2 size={14} /> Google Sheets
              </Button>
            </div>

            {importMode === "file" ? (
              <>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                    <Upload size={14} /> Escolher arquivo
                  </Button>
                  {arquivoNome && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <FileSpreadsheet size={12} /> {arquivoNome} · {contatos.length} contatos
                      {skipCount > 0 && <span className="text-amber-500"> · {skipCount} já enviados pulados</span>}
                    </span>
                  )}
                  {contatos.length > 0 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setContatos([]); setArquivoNome(""); setSkipCount(0); }}>
                      Remover
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    disabled={loadingSheet}
                  />
                  <Button type="button" onClick={handleSheet} disabled={loadingSheet || !sheetUrl} size="sm">
                    {loadingSheet ? <Loader2 className="animate-spin" size={14} /> : "Carregar"}
                  </Button>
                </div>
                {contatos.length > 0 && sheetUrl && (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
                    <FileSpreadsheet size={12} /> {contatos.length} contatos carregados
                    {skipCount > 0 && <span className="text-amber-500">· {skipCount} já enviados pulados</span>}
                    <Button type="button" size="sm" variant="ghost" onClick={handleSheet} className="h-6 px-2 gap-1">
                      <RefreshCw size={10} /> Recarregar
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Planilha precisa estar como <strong>"Qualquer pessoa com o link"</strong> (visualização pública).
                </p>
              </>
            )}

            <div className="text-xs text-muted-foreground border-t border-border pt-2 space-y-1">
              <p><strong>Template esperado:</strong> <code>nome</code> · <code>numero</code> · <code>nicho</code> (opcional) · <code>envio</code></p>
              <p>Linhas com <code>envio = sim</code> são ignoradas (já disparadas). As demais (vazias ou <code>não</code>) viram contatos. Contatos duplicados por telefone são deduplicados automaticamente, então reimportar o mesmo link após novos disparos não duplica.</p>
            </div>
          </Card>

          <div className="text-sm text-center p-2 rounded bg-muted/30">
            Total de contatos: <strong>{totalSelecionado}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
