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
import { Loader2 } from "lucide-react";

export function NovoClienteDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [status, setStatus] = useState("active");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [servicos, setServicos] = useState<string[]>([]);
  const [users, setUsers] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => {
      setUsers(data ?? []);
    });
  }, [open]);

  function reset() {
    setName(""); setCnpj(""); setStatus("active");
    setResponsavelId(""); setServicos([]);
  }

  async function handleSave() {
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("portfolios").insert({
      name: name.trim(),
      slug: `${slug}-${Date.now().toString(36)}`,
      cnpj: cnpj.trim() || null,
      status,
      responsavel_id: responsavelId || null,
      servicos,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente criado!");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Responsável</Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.display_name ?? u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Serviços</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {ALL_SERVICES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={servicos.includes(s)}
                    onCheckedChange={(v) => {
                      setServicos((cur) =>
                        v ? [...cur, s] : cur.filter((x) => x !== s),
                      );
                    }}
                  />
                  {SERVICE_LABELS[s]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
