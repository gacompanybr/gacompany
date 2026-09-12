import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ManagedUser = { user_id: string; display_name: string | null; is_admin: boolean; job_role_id: string | null };
type JobRole = { id: string; label: string };

export function GerenciarUsuarioDialog({ user, roles, open, onOpenChange, onSaved }: { user: ManagedUser; roles: JobRole[]; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState(user.display_name ?? "");
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [jobRoleId, setJobRoleId] = useState(user.job_role_id ?? "none");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(user.display_name ?? ""); setIsAdmin(user.is_admin); setJobRoleId(user.job_role_id ?? "none"); }, [user]);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", { body: { action: "update", user_id: user.user_id, display_name: name, is_admin: isAdmin, job_role_id: jobRoleId === "none" ? null : jobRoleId } });
    setBusy(false);
    if (error || data?.error) {
      let message = data?.error ?? error?.message ?? "Não foi possível atualizar o usuário";
      const response = (error as { context?: Response } | null)?.context;
      if (response) {
        try {
          const body = await response.clone().json();
          if (typeof body?.error === "string") message = body.error;
        } catch {
          // Mantém a mensagem original quando a resposta não contém JSON.
        }
      }
      toast.error(message);
      return;
    }
    toast.success("Usuário atualizado"); onSaved(); onOpenChange(false);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Editar usuário</DialogTitle><DialogDescription>Defina o nome, cargo e o acesso administrativo.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div><Label>Nome</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div><Label>Cargo</Label><Select value={jobRoleId} onValueChange={setJobRoleId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem cargo</SelectItem>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">Administrador</p><p className="text-xs text-muted-foreground">Acesso total, independente do cargo.</p></div><Switch checked={isAdmin} onCheckedChange={setIsAdmin} /></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}