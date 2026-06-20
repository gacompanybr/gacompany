import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Users, X } from "lucide-react";
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

  function onPick(groupId: string) {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    persist(g.id, g.name);
  }

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
        Escolha um grupo do WhatsApp para receber os relatórios de leads (reunião confirmada ou pedido de
        atendimento humano). Os relatórios <strong>nunca</strong> são enviados ao número do lead.
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
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p>
            Nenhum grupo de relatórios configurado. Os relatórios não serão enviados até que um grupo seja
            selecionado.
          </p>
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
    </Card>
  );
}
