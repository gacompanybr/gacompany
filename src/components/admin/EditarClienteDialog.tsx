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
import { Loader2, Trash2 } from "lucide-react";
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
  open,
  onOpenChange,
  cliente,
  onSaved,
  onDeleted,
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
  const [responsavelId, setResponsavelId] = useState("");
  const [servicos, setServicos] = useState<string[]>([]);
  const [users, setUsers] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !cliente) return;
    setName(cliente.name);
    setCnpj(cliente.cnpj ?? "");
    setStatus(cliente.status);
    setResponsavelId(cliente.responsavel_id ?? "");
    setServicos(cliente.servicos ?? []);
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => {
      setUsers(data ?? []);
    });
  }, [open, cliente]);

  async function handleSave() {
    if (!cliente || !name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const { error } = await supabase.from("portfolios").update({
      name: name.trim(),
      cnpj: cnpj.trim() || null,
      status,
      responsavel_id: responsavelId || null,
      servicos,
    }).eq("id", cliente.id);
    setBusy(false);
    if (error) return toast.error(error.message);
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>

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
              <Label>Responsável</Label>
              <Select
                value={responsavelId || "none"}
                onValueChange={(v) => setResponsavelId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.display_name ?? u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="gap-2"
            >
              <Trash2 size={14} /> Excluir cliente
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
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
              "{cliente?.name}" e todos os dados vinculados (campanhas, métricas, leads) serão removidos
              permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
