import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff, Copy, RefreshCw } from "lucide-react";

function gerarSenha() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  let s = "";
  for (let i = 0; i < 12; i++) s += charset[Math.floor(Math.random() * charset.length)];
  return s;
}

export function DefinirSenhaDialog({
  open, onOpenChange, userId, userLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  userLabel: string;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSalvar() {
    if (password.length < 6) return toast.error("Senha precisa ter no mínimo 6 caracteres");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-set-password", {
      body: { target_user_id: userId, password },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Erro ao definir senha");
    }
    toast.success(`Senha definida para ${userLabel}`);
    setPassword("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha de acesso para <strong>{userLabel}</strong>. O usuário poderá fazer login imediatamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nova senha</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { setPassword(gerarSenha()); setShow(true); }}
                title="Gerar senha aleatória"
              >
                <RefreshCw size={14} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (!password) return;
                  navigator.clipboard.writeText(password);
                  toast.success("Senha copiada");
                }}
                title="Copiar"
              >
                <Copy size={14} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lembre de compartilhar a senha com o usuário por um canal seguro.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : "Salvar senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
