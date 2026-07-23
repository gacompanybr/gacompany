import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Users, X, Phone } from "lucide-react";
import type { WhatsappAgent } from "./types";

type Group = { id: string; name: string; participants_count: number; avatar_url: string | null };

export function ReportGroupCard({
  agent,
  onChange,
}: {
  agent: WhatsappAgent;
  onChange: (patch: Partial<WhatsappAgent>) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numberInput, setNumberInput] = useState(agent.report_number ?? "");
  const [savingNumber, setSavingNumber] = useState(false);

  useEffect(() => {
    setNumberInput(agent.report_number ?? "");
  }, [agent.report_number]);

  async function loadGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-connection", {
        body: { action: "list-groups", portfolioId: agent.portfolio_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const list = ((data as any)?.groups ?? []) as Group[];
      setGroups(list);
      toast.success(`${list.length} grupo(s) encontrado(s)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar grupos");
    } finally {
      setLoading(false);
    }
  }

  async function persist(id: string | null, name: string | null) {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-connection", {
        body: {
          action: "save-report-group",
          portfolioId: agent.portfolio_id,
          reportGroupId: id,
          reportGroupName: name,
        },
      });
      if (error) throw error;
      onChange({ report_group_id: id, report_group_name: name });
      toast.success(id ? "Grupo de relatórios salvo" : "Grupo desvinculado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar grupo");
    } finally {
      setSaving(false);
    }
  }

  async function saveNumber(next: string | null) {
    setSavingNumber(true);
    try {
      const { error } = await supabase
        .from("whatsapp_agents")
        .update({ report_number: next })
        .eq("id", agent.id);
      if (error) throw error;
      onChange({ report_number: next });
      toast.success(next ? "Número de relatórios salvo" : "Número removido");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar número");
    } finally {
      setSavingNumber(false);
    }
  }

  function onSubmitNumber() {
    const cleaned = numberInput.replace(/\D/g, "");
    if (!cleaned) {
      saveNumber(null);
      return;
    }
    if (cleaned.length < 10 || cleaned.length > 15) {
      toast.error("Número inválido. Use formato internacional, ex: 5514999999999");
      return;
    }
    saveNumber(cleaned);
  }

  function onPick(groupId: string) {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    persist(g.id, g.name);
  }

  const hasAnyDest = !!agent.report_group_id || !!agent.report_number;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2">
          <Users size={16} /> Destino dos Relatórios
        </h3>
        <Button size="sm" variant="outline" onClick={loadGroups} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          Carregar Grupos
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Escolha um grupo do WhatsApp e/ou um número individual para receber os relatórios de leads
        (reunião confirmada, pedido de atendimento humano ou contato fora do horário). Os relatórios{" "}
        <strong>nunca</strong> são enviados ao número do lead. Você pode configurar apenas um destino
        ou os dois — se ambos estiverem preenchidos, o relatório é enviado para os dois.
      </p>

      {agent.report_group_id ? (
        <div className="flex items-center justify-between gap-2 bg-green-500/10 border border-green-500/30 rounded p-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Grupo vinculado</Badge>
            <span className="truncate text-sm">{agent.report_group_name ?? agent.report_group_id}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => persist(null, null)}
            disabled={saving}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <X size={14} /> Desvincular
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 bg-muted/40 border border-border rounded p-3 text-xs">
          <Users size={14} className="text-muted-foreground shrink-0 mt-0.5" />
          <p>Nenhum grupo vinculado. Clique em "Carregar Grupos" para escolher.</p>
        </div>
      )}

      {groups.length > 0 && (
        <div>
          <Label>Selecione o grupo</Label>
          <Select onValueChange={onPick} disabled={saving}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um grupo..." />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <div className="flex items-center gap-2">
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <Users size={10} />
                      </div>
                    )}
                    <span>{g.name}</span>
                    {g.participants_count > 0 && (
                      <span className="text-xs text-muted-foreground">({g.participants_count})</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-2">
        <Label className="flex items-center gap-2">
          <Phone size={14} /> Número individual (opcional)
        </Label>
        <div className="flex gap-2">
          <Input
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            placeholder="Ex: 5514999999999 (formato internacional, só números)"
            inputMode="numeric"
          />
          <Button onClick={onSubmitNumber} disabled={savingNumber} variant="outline">
            {savingNumber ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
          </Button>
        </div>
        {agent.report_number ? (
          <div className="flex items-center justify-between gap-2 bg-green-500/10 border border-green-500/30 rounded p-2">
            <div className="flex items-center gap-2 min-w-0">
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Número vinculado</Badge>
              <span className="truncate text-sm font-mono">+{agent.report_number}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setNumberInput(""); saveNumber(null); }}
              disabled={savingNumber}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <X size={14} /> Remover
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Formato internacional sem símbolos. Ex: <span className="font-mono">5514999999999</span>.
          </p>
        )}
      </div>

      {!hasAnyDest && (
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p>
            Nenhum destino configurado. Os relatórios não serão enviados até que você vincule um
            grupo ou um número individual.
          </p>
        </div>
      )}
    </Card>
  );
}
