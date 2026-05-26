import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Loader2, Settings2, KeyRound } from "lucide-react";
import { ConvidarUsuarioDialog } from "./ConvidarUsuarioDialog";
import { GerenciarAcessosDialog } from "./GerenciarAcessosDialog";
import { DefinirSenhaDialog } from "./DefinirSenhaDialog";

type EquipeRow = {
  user_id: string;
  display_name: string | null;
  created_at: string;
  role: "admin" | "viewer";
  portfolios: { id: string; name: string }[];
};

export function EquipeTab() {
  const qc = useQueryClient();
  const [openConvidar, setOpenConvidar] = useState(false);
  const [editingUser, setEditingUser] = useState<EquipeRow | null>(null);
  const [senhaUser, setSenhaUser] = useState<EquipeRow | null>(null);

  const { data: equipe = [], isLoading } = useQuery({
    queryKey: ["admin-equipe"],
    queryFn: async (): Promise<EquipeRow[]> => {
      const [{ data: profs }, { data: roles }, { data: access }, { data: ports }] =
        await Promise.all([
          supabase.from("profiles").select("user_id, display_name, created_at"),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("user_portfolio_access").select("user_id, portfolio_id"),
          supabase.from("portfolios").select("id, name"),
        ]);

      const portMap = new Map((ports ?? []).map((p) => [p.id, p.name]));
      const accessByUser = new Map<string, { id: string; name: string }[]>();
      for (const a of access ?? []) {
        const arr = accessByUser.get(a.user_id) ?? [];
        const name = portMap.get(a.portfolio_id);
        if (name) arr.push({ id: a.portfolio_id, name });
        accessByUser.set(a.user_id, arr);
      }

      const roleByUser = new Map<string, "admin" | "viewer">();
      for (const r of roles ?? []) {
        const cur = roleByUser.get(r.user_id);
        // admin tem prioridade
        if (cur !== "admin") roleByUser.set(r.user_id, r.role as any);
      }

      return (profs ?? []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        created_at: p.created_at,
        role: roleByUser.get(p.user_id) ?? "viewer",
        portfolios: accessByUser.get(p.user_id) ?? [],
      }));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenConvidar(true)} className="gap-2">
          <Plus size={14} /> Convidar usuário
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Clientes vinculados</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipe.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum usuário ainda.
                  </TableCell>
                </TableRow>
              )}
              {equipe.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.display_name ?? u.user_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        u.role === "admin"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.portfolios.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="secondary">{u.portfolios.length}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <ul className="text-xs space-y-0.5">
                            {u.portfolios.map((p) => <li key={p.id}>{p.name}</li>)}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setSenhaUser(u)}
                      >
                        <KeyRound size={14} /> Senha
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditingUser(u)}
                      >
                        <Settings2 size={14} /> Acessos
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConvidarUsuarioDialog
        open={openConvidar}
        onOpenChange={setOpenConvidar}
        onInvited={() => qc.invalidateQueries({ queryKey: ["admin-equipe"] })}
      />

      {editingUser && (
        <GerenciarAcessosDialog
          userId={editingUser.user_id}
          userLabel={editingUser.display_name ?? editingUser.user_id.slice(0, 8)}
          currentPortfolioIds={editingUser.portfolios.map((p) => p.id)}
          open={!!editingUser}
          onOpenChange={(o) => !o && setEditingUser(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-equipe"] })}
        />
      )}

      {senhaUser && (
        <DefinirSenhaDialog
          userId={senhaUser.user_id}
          userLabel={senhaUser.display_name ?? senhaUser.user_id.slice(0, 8)}
          open={!!senhaUser}
          onOpenChange={(o) => !o && setSenhaUser(null)}
        />
      )}
    </div>
  );
}
