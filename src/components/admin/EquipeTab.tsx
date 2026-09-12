import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/lib/sb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Settings2, KeyRound, Trash2 } from "lucide-react";
import { ConvidarUsuarioDialog } from "./ConvidarUsuarioDialog";
import { GerenciarAcessosDialog } from "./GerenciarAcessosDialog";
import { DefinirSenhaDialog } from "./DefinirSenhaDialog";
import { GerenciarUsuarioDialog, type ManagedUser } from "./GerenciarUsuarioDialog";
import { PermissoesCargos } from "./PermissoesCargos";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type EquipeRow = ManagedUser & { created_at: string; portfolios: { id: string; name: string }[]; job_label: string | null };

export function EquipeTab() {
  const qc = useQueryClient(); const { user, isAdmin } = useAuth();
  const [openConvidar, setOpenConvidar] = useState(false); const [accessUser, setAccessUser] = useState<EquipeRow | null>(null); const [editUser, setEditUser] = useState<EquipeRow | null>(null); const [senhaUser, setSenhaUser] = useState<EquipeRow | null>(null); const [deleteUser, setDeleteUser] = useState<EquipeRow | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin-equipe"], queryFn: async () => {
    const [{ data: profs }, { data: roles }, { data: access }, { data: ports }, { data: jobs }, { data: assignments }] = await Promise.all([
      supabase.from("profiles").select("user_id,display_name,created_at"), supabase.from("user_roles").select("user_id,role"), supabase.from("user_portfolio_access").select("user_id,portfolio_id"), supabase.from("portfolios").select("id,name"), sb.from("job_roles").select("id,label").order("label"), sb.from("user_job_roles").select("user_id,job_role_id"),
    ]);
    const portMap = new Map((ports ?? []).map((row: any) => [row.id, row.name])); const accessMap = new Map<string, any[]>();
    for (const row of access ?? []) accessMap.set(row.user_id, [...(accessMap.get(row.user_id) ?? []), { id: row.portfolio_id, name: portMap.get(row.portfolio_id) }]);
    const jobMap = new Map((jobs ?? []).map((row: any) => [row.id, row.label])); const assignmentMap = new Map((assignments ?? []).map((row: any) => [row.user_id, row.job_role_id])); const adminIds = new Set((roles ?? []).filter((row: any) => row.role === "admin").map((row: any) => row.user_id));
    return { roles: jobs ?? [], users: (profs ?? []).map((profile: any) => ({ ...profile, is_admin: adminIds.has(profile.user_id), job_role_id: assignmentMap.get(profile.user_id) ?? null, job_label: jobMap.get(assignmentMap.get(profile.user_id)) ?? null, portfolios: accessMap.get(profile.user_id) ?? [] })) as EquipeRow[] };
  }});
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-equipe"] });
  async function confirmDelete() {
    if (!deleteUser) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      toast.error("Sua sessão expirou. Entre novamente no painel.");
      return;
    }
    const { data: result, error } = await supabase.functions.invoke("admin-manage-user", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: "delete", user_id: deleteUser.user_id },
    });
    if (error || result?.error) toast.error(result?.error ?? error?.message);
    else { toast.success("Usuário excluído"); refresh(); }
    setDeleteUser(null);
  }
  return <div className="space-y-4">{isAdmin && <div className="flex justify-end"><Button onClick={() => setOpenConvidar(true)} className="gap-2"><Plus size={14} /> Convidar usuário</Button></div>}
    <Card className="overflow-x-auto">{isLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" size={20} /></div> : <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cargo</TableHead><TableHead>Acesso</TableHead><TableHead>Clientes</TableHead><TableHead>Cadastro</TableHead>{isAdmin && <TableHead className="text-right">Ações</TableHead>}</TableRow></TableHeader><TableBody>{data?.users.map((row) => <TableRow key={row.user_id}><TableCell className="font-medium">{row.display_name ?? row.user_id.slice(0, 8)}</TableCell><TableCell>{row.job_label ? <Badge variant="secondary">{row.job_label}</Badge> : "—"}</TableCell><TableCell>{row.is_admin ? <Badge>Administrador</Badge> : <Badge variant="outline">Por cargo</Badge>}</TableCell><TableCell>{row.portfolios.length}</TableCell><TableCell>{new Date(row.created_at).toLocaleDateString("pt-BR")}</TableCell>{isAdmin && <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => setSenhaUser(row)} aria-label="Alterar senha"><KeyRound size={14} /></Button><Button variant="ghost" size="icon" onClick={() => setAccessUser(row)} aria-label="Gerenciar clientes"><Settings2 size={14} /></Button><Button variant="ghost" size="icon" onClick={() => setEditUser(row)} aria-label="Editar usuário"><Settings2 size={14} /></Button><Button variant="ghost" size="icon" disabled={row.user_id === user?.id} onClick={() => setDeleteUser(row)} aria-label="Excluir usuário"><Trash2 size={14} /></Button></div></TableCell>}</TableRow>)}</TableBody></Table>}</Card>
    {isAdmin && <PermissoesCargos roles={data?.roles ?? []} />}
    {isAdmin && <ConvidarUsuarioDialog open={openConvidar} onOpenChange={setOpenConvidar} onInvited={refresh} />}
    {accessUser && isAdmin && <GerenciarAcessosDialog userId={accessUser.user_id} userLabel={accessUser.display_name ?? "Usuário"} currentPortfolioIds={accessUser.portfolios.map((item) => item.id)} open onOpenChange={(open) => !open && setAccessUser(null)} onSaved={refresh} />}
    {senhaUser && isAdmin && <DefinirSenhaDialog userId={senhaUser.user_id} userLabel={senhaUser.display_name ?? "Usuário"} open onOpenChange={(open) => !open && setSenhaUser(null)} />}
    {editUser && isAdmin && <GerenciarUsuarioDialog user={editUser} roles={data?.roles ?? []} open onOpenChange={(open) => !open && setEditUser(null)} onSaved={refresh} />}
    <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir este usuário?</AlertDialogTitle><AlertDialogDescription>O login e os acessos serão excluídos definitivamente. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Excluir definitivamente</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}