import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { OBJETIVOS, type MetaCampanha } from "./types";

type Integration = { id: string; nome_conta_anuncio: string };

export function CampanhaDialog({
  open, onOpenChange, portfolioId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolioId: string;
  editing: MetaCampanha | null;
  onSaved: () => void;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<string>("LEAD_GENERATION");
  const [orcamento, setOrcamento] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [integrationId, setIntegrationId] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("meta_integracoes")
      .select("id, nome_conta_anuncio")
      .eq("portfolio_id", portfolioId)
      .then(({ data }) => setIntegrations(data ?? []));

    if (editing) {
      setName(editing.campaign_name);
      setObjective(editing.objective ?? "LEAD_GENERATION");
      setOrcamento(editing.orcamento_diario?.toString() ?? "");
      setDataInicio(editing.data_inicio ?? "");
      setDataFim(editing.data_fim ?? "");
      setIntegrationId(editing.integration_id);
      setObservacoes(editing.observacoes ?? "");
    } else {
      setName(""); setObjective("LEAD_GENERATION"); setOrcamento("");
      setDataInicio(""); setDataFim(""); setIntegrationId(""); setObservacoes("");
    }
  }, [open, editing, portfolioId]);

  async function save() {
    if (!name.trim()) return toast.error("Nome obrigatório");
    if (!integrationId) return toast.error("Selecione a conta de anúncios");
    setBusy(true);

    const payload = {
      integration_id: integrationId,
      campaign_name: name.trim(),
      objective,
      orcamento_diario: orcamento ? Number(orcamento) : null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      observacoes: observacoes.trim() || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from("meta_campanhas").update(payload).eq("id", editing.id));
    } else {
      // TODO: Integrar com Meta Marketing API para criar campanhas reais via /act_{account_id}/campaigns
      ({ error } = await supabase.from("meta_campanhas").insert({
        ...payload,
        campaign_id: `local_${Date.now()}`,
        status: "PAUSED",
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Campanha atualizada!" : "Campanha criada!");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Objetivo</Label>
              <Select value={objective} onValueChange={setObjective}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJETIVOS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orçamento diário (R$)</Label>
              <Input type="number" step="0.01" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Data fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Conta de anúncios</Label>
            <Select value={integrationId} onValueChange={setIntegrationId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {integrations.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.nome_conta_anuncio}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações internas</Label>
            <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
