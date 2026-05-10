import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Info } from "lucide-react";

export function ConvidarUsuarioDialog({
  open, onOpenChange, onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("portfolios").select("id, name").order("name").then(({ data }) => {
      setPortfolios(data ?? []);
    });
  }, [open]);

  async function handleInvite() {
    if (!email.trim()) return toast.error("Email obrigatório");
    if (role === "viewer" && selectedIds.length === 0) {
      return toast.error("Selecione pelo menos um cliente para o viewer");
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email: email.trim(),
        role,
        portfolio_ids: role === "admin" ? [] : selectedIds,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Erro ao convidar");
    }
    toast.success("Convite enviado!");
    setEmail(""); setRole("viewer"); setSelectedIds([]);
    onOpenChange(false);
    onInvited();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Envie um convite por email com o papel e acessos definidos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
            />
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (cliente)</SelectItem>
                <SelectItem value="admin">Admin (equipe)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1 flex gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              {role === "viewer"
                ? "Vai logar em /painel e ver apenas os clientes vinculados."
                : "Vai logar em /paineladmin e ter acesso administrativo total."}
            </p>
          </div>

          {role === "viewer" && (
            <div>
              <Label>Clientes que terá acesso</Label>
              <div className="border border-border rounded p-2 max-h-48 overflow-auto space-y-1 mt-2">
                {portfolios.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum cliente cadastrado.</p>
                )}
                {portfolios.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedIds.includes(p.id)}
                      onCheckedChange={(v) => {
                        setSelectedIds((cur) =>
                          v ? [...cur, p.id] : cur.filter((x) => x !== p.id),
                        );
                      }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleInvite} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Enviar convite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
