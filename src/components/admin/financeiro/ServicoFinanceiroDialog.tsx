import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { BILLING_LABEL, generateOccurrences, todayISO, type TipoCobranca } from "@/lib/financeiro";
import { ParticipantesEditor, type ParticipantInput } from "./ParticipantesEditor";

type Editing = {
  id: string;
  portfolio_id: string;
  category_id: string | null;
  nome: string;
  descricao: string | null;
  valor_total: number;
  tipo_cobranca: TipoCobranca;
  dia_vencimento: number | null;
  data_inicio: string;
  status: "ativo" | "pausado" | "finalizado";
  observacoes: string | null;
} | null;

export function ServicoFinanceiroDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Editing;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const [portfolioId, setPortfolioId] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorTotal, setValorTotal] = useState<number>(0);
  const [tipoCobranca, setTipoCobranca] = useState<TipoCobranca>("mensal");
  const [diaVencimento, setDiaVencimento] = useState<number>(10);
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [status, setStatus] = useState<"ativo" | "pausado" | "finalizado">("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("portfolios").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["financial-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_categories").select("id, nome, cor").order("nome");
      return data ?? [];
    },
  });

  // Carrega participantes existentes em edição
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPortfolioId(editing.portfolio_id);
      setCategoryId(editing.category_id ?? "none");
      setNome(editing.nome);
      setDescricao(editing.descricao ?? "");
      setValorTotal(Number(editing.valor_total) || 0);
      setTipoCobranca(editing.tipo_cobranca);
      setDiaVencimento(editing.dia_vencimento ?? 10);
      setDataInicio(editing.data_inicio);
      setStatus(editing.status);
      setObservacoes(editing.observacoes ?? "");
      supabase
        .from("financial_service_participants")
        .select("user_id, percentual")
        .eq("service_id", editing.id)
        .then(({ data }) =>
          setParticipants(
            (data ?? []).map((p: any) => ({
              user_id: p.user_id,
              percentual: Number(p.percentual),
            })),
          ),
        );
    } else {
      setPortfolioId("");
      setCategoryId("none");
      setNome("");
      setDescricao("");
      setValorTotal(0);
      setTipoCobranca("mensal");
      setDiaVencimento(10);
      setDataInicio(todayISO());
      setStatus("ativo");
      setObservacoes("");
      setParticipants([]);
    }
  }, [open, editing]);

  const totalPct = participants.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
  const pctOk = Math.abs(totalPct - 100) < 0.01;
  const allUsersFilled = participants.every((p) => p.user_id);

  async function handleSave() {
    if (!portfolioId) return toast.error("Selecione o cliente");
    if (!nome.trim()) return toast.error("Informe o nome do serviço");
    if (participants.length === 0) return toast.error("Adicione pelo menos um participante");
    if (!allUsersFilled) return toast.error("Selecione todos os usuários participantes");
    if (!pctOk) return toast.error("A soma dos percentuais deve ser 100%");

    setBusy(true);

    const payload = {
      portfolio_id: portfolioId,
      category_id: categoryId === "none" ? null : categoryId,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      valor_total: Number(valorTotal) || 0,
      tipo_cobranca: tipoCobranca,
      dia_vencimento: tipoCobranca === "mensal" ? diaVencimento : null,
      data_inicio: dataInicio,
      status,
      observacoes: observacoes.trim() || null,
      created_by: editing ? undefined : user?.id ?? null,
    };

    let serviceId = editing?.id;

    if (editing) {
      const { error } = await supabase
        .from("financial_services")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    } else {
      const { data, error } = await supabase
        .from("financial_services")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
      serviceId = data.id;
    }

    if (!serviceId) {
      setBusy(false);
      return toast.error("Falha ao identificar serviço");
    }

    // Sincroniza participantes (apaga e recria — mais simples e atômico do lado do client)
    await supabase.from("financial_service_participants").delete().eq("service_id", serviceId);
    const { error: partErr } = await supabase
      .from("financial_service_participants")
      .insert(
        participants.map((p) => ({
          service_id: serviceId!,
          user_id: p.user_id,
          percentual: p.percentual,
        })),
      );
    if (partErr) {
      setBusy(false);
      return toast.error(partErr.message);
    }

    // Regera recebimentos pendentes/atrasados
    await supabase
      .from("financial_receivables")
      .delete()
      .eq("service_id", serviceId)
      .in("status", ["pendente", "atrasado"]);

    const dates = generateOccurrences({
      tipo_cobranca: tipoCobranca,
      data_inicio: dataInicio,
      dia_vencimento: tipoCobranca === "mensal" ? diaVencimento : null,
      count: 12,
    });

    const novos: any[] = [];
    for (const d of dates) {
      for (const p of participants) {
        novos.push({
          service_id: serviceId,
          participant_user_id: p.user_id,
          portfolio_id: portfolioId,
          valor_previsto: (Number(valorTotal) * Number(p.percentual)) / 100,
          data_prevista: d,
          status: "pendente",
        });
      }
    }
    if (novos.length) {
      const { error: recErr } = await supabase.from("financial_receivables").insert(novos);
      if (recErr) {
        setBusy(false);
        return toast.error("Falha ao gerar recebimentos: " + recErr.message);
      }
    }

    setBusy(false);
    toast.success(editing ? "Serviço atualizado" : "Serviço criado e recebimentos gerados");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar serviço" : "Novo serviço financeiro"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Cliente *</Label>
              <Select value={portfolioId} onValueChange={setPortfolioId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhuma —</SelectItem>
                  {categorias.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Nome do serviço *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gestão Meta Ads — Mensalidade" />
          </div>

          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Valor total (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={valorTotal}
                onChange={(e) => setValorTotal(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Tipo de cobrança</Label>
              <Select value={tipoCobranca} onValueChange={(v) => setTipoCobranca(v as TipoCobranca)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Data de início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            {tipoCobranca === "mensal" && (
              <div>
                <Label>Dia do vencimento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={diaVencimento}
                  onChange={(e) => setDiaVencimento(Number(e.target.value) || 10)}
                />
              </div>
            )}
          </div>

          <ParticipantesEditor
            participants={participants}
            onChange={setParticipants}
            valorTotal={Number(valorTotal) || 0}
          />

          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={busy || !pctOk}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
