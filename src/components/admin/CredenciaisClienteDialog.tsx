import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cliente: { id: string; name: string } | null;
};

export function CredenciaisClienteDialog({ open, onOpenChange, cliente }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!cliente) return;
    if (!email || !password) return toast.error("Preencha email e senha");
    if (password.length < 8) return toast.error("Senha deve ter no mínimo 8 caracteres");

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-client-credentials", {
      body: { email, password, portfolio_id: cliente.id },
    });
    setBusy(false);

    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Erro");
    }
    toast.success(
      (data as any)?.updated
        ? "Senha atualizada e acesso vinculado"
        : "Credenciais criadas com sucesso",
    );
    setEmail(""); setPassword("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credenciais de acesso — {cliente?.name}</DialogTitle>
          <DialogDescription>
            Crie ou redefina o login do cliente para acessar o painel em <code>/painel</code>.
            Se o email já existir, a senha será atualizada e o acesso a este cliente será vinculado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Anote e envie ao cliente — a senha não fica visível depois.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar credenciais"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
