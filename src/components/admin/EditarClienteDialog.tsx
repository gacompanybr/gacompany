import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALL_SERVICES, SERVICE_LABELS } from "./ServiceBadge";
import { ResponsaveisMultiSelect } from "./ResponsaveisMultiSelect";
import { Loader2, Trash2 } from "lucide-react";
import { CobrancaSection, emptyCobranca, saveCobranca, type CobrancaState } from "./CobrancaSection";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ClienteRow = {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  servicos: string[];
  responsavel_id: string | null;
};

export function EditarClienteDialog({
  open, onOpenChange, cliente, onSaved, onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cliente: ClienteRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [status, setStatus] = useState("active");
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [servicos, setServicos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cobranca, setCobranca] = useState<CobrancaState>(emptyCobranca());

  useEffect(() => {
    if (!open || !cliente) return;
    setName(cliente.name);
    setCnpj(cliente.cnpj ?? "");
    setStatus(cliente.status);
    setServicos(cliente.servicos ?? []);
    supabase.from("portfolio_responsaveis")
      .select("user_id")
      .eq("portfolio_id", cliente.id)
      .then(({ data }) => {
        const ids = (data ?? []).map((r: any) => r.user_id);
        // fallback: incluir responsavel_id legado
        if (cliente.responsavel_id && !ids.includes(cliente.responsavel_id)) {
          ids.push(cliente.responsavel_id);
        }
        setResponsaveis(ids);
      });
    supabase.from("cobranca_config")
      .select("*")
      .eq("portfolio_id", cliente.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setCobranca(emptyCobranca());
        setCobranca({
          id: data.id,
          valor: String(data.valor ?? ""),
          dia_vencimento: String(data.dia_vencimento ?? ""),
          sender_instance: data.sender_instance ?? "",
          sender_portfolio_id: data.sender_portfolio_id ?? null,
          contato_jid: data.contato_jid ?? "",
          contato_telefone: data.contato_telefone ?? "",
          contato_nome: data.contato_nome ?? "",
          mensagem_template: data.mensagem_template ?? "",
          ativo: !!data.ativo,
        });
      });
  }, [open, cliente]);

  async function handleSave() {
    if (!cliente || !name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);

    const { error } = await supabase.from("portfolios").update({
      name: name.trim(),
      cnpj: cnpj.trim() || null,
      status,
      responsavel_id: responsaveis[0] ?? null,
      servicos,
    }).eq("id", cliente.id);

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    // Sincroniza responsáveis (substitui set)
    const { data: existing } = await supabase
      .from("portfolio_responsaveis")
      .select("user_id")
      .eq("portfolio_id", cliente.id);
    const existingIds = new Set((existing ?? []).map((r: any) => r.user_id));
    const newIds = new Set(responsaveis);

    const toRemove = [...existingIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
      await supabase.from("portfolio_responsaveis")
        .delete()
        .eq("portfolio_id", cliente.id)
        .in("user_id", toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from("portfolio_responsaveis").insert(
        toAdd.map((uid) => ({ portfolio_id: cliente.id, user_id: uid })),
      );
    }

    const okCobranca = await saveCobranca(cliente.id, cobranca);
    setBusy(false);
    if (!okCobranca) return;
    toast.success("Cliente atualizado!");
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!cliente) return;
    setBusy(true);
    const { error } = await supabase.from("portfolios").delete().eq("id", cliente.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído!");
    setConfirmDelete(false);
    onOpenChange(false);
    onDeleted();
  }

  function toggleServico(s: string, checked: boolean) {
    setServicos((cur) => (checked ? [...cur, s] : cur.filter((x) => x !== s)));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="space-y-2">
              <Label>Responsáveis</Label>
              <ResponsaveisMultiSelect value={responsaveis} onChange={setResponsaveis} />
              <p className="text-xs text-muted-foreground">
                Cada responsável recebe acesso automático a este cliente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Serviços / Módulos ativos</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SERVICES.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={servicos.includes(s)}
                      onCheckedChange={(v) => toggleServico(s, !!v)}
                    />
                    {SERVICE_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
            <CobrancaSection
              value={cobranca}
              onChange={(patch) => setCobranca((c) => ({ ...c, ...patch }))}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="gap-2"
            >
              <Trash2 size={14} /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              "{cliente?.name}" e todos os dados vinculados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
