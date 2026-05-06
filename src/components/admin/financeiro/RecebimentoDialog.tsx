import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
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
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  BRL, formatDateBR, PAYMENT_LABEL, todayISO, RECEIVABLE_STATUS_LABEL,
} from "@/lib/financeiro";

export type RecebimentoEdit = {
  id: string;
  valor_previsto: number;
  valor_recebido: number | null;
  data_prevista: string;
  data_recebimento: string | null;
  status: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  cliente_nome?: string;
  servico_nome?: string;
  participante_nome?: string;
} | null;

export function RecebimentoDialog({
  rec, onClose, onSaved,
}: {
  rec: RecebimentoEdit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("pendente");
  const [valorRecebido, setValorRecebido] = useState<number>(0);
  const [dataRecebimento, setDataRecebimento] = useState<string>(todayISO());
  const [formaPagamento, setFormaPagamento] = useState<string>("pix");
  const [observacoes, setObservacoes] = useState<string>("");

  useEffect(() => {
    if (!rec) return;
    setStatus(rec.status);
    setValorRecebido(rec.valor_recebido ?? rec.valor_previsto);
    setDataRecebimento(rec.data_recebimento ?? todayISO());
    setFormaPagamento(rec.forma_pagamento ?? "pix");
    setObservacoes(rec.observacoes ?? "");
  }, [rec]);

  if (!rec) return null;

  async function save() {
    if (!rec) return;
    setBusy(true);
    const payload: any = {
      status,
      observacoes: observacoes.trim() || null,
    };
    if (status === "recebido" || status === "parcial") {
      payload.valor_recebido = Number(valorRecebido) || 0;
      payload.data_recebimento = dataRecebimento;
      payload.forma_pagamento = formaPagamento;
    } else {
      payload.valor_recebido = null;
      payload.data_recebimento = null;
    }
    const { error } = await supabase
      .from("financial_receivables")
      .update(payload)
      .eq("id", rec.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Recebimento atualizado");
    onClose();
    onSaved();
  }

  async function quickReceive() {
    if (!rec) return;
    setBusy(true);
    const { error } = await supabase
      .from("financial_receivables")
      .update({
        status: "recebido",
        valor_recebido: rec.valor_previsto,
        data_recebimento: todayISO(),
        forma_pagamento: formaPagamento,
      })
      .eq("id", rec.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Marcado como recebido");
    onClose();
    onSaved();
  }

  return (
    <Dialog open={!!rec} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rec.cliente_nome ?? "Recebimento"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {rec.servico_nome}
            {rec.participante_nome ? ` · ${rec.participante_nome}` : ""}
            <br />
            Previsto {formatDateBR(rec.data_prevista)} · {BRL(rec.valor_previsto)}
          </p>
        </DialogHeader>

        <Button onClick={quickReceive} disabled={busy} className="w-full gap-2">
          <CheckCircle2 size={16} /> Marcar como recebido (valor cheio)
        </Button>
        <div className="text-center text-xs text-muted-foreground -my-1">ou edite manualmente</div>

        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RECEIVABLE_STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(status === "recebido" || status === "parcial") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor recebido</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Data recebimento</Label>
                  <Input
                    type="date"
                    value={dataRecebimento}
                    onChange={(e) => setDataRecebimento(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
