import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Loader2 } from "lucide-react";
import { ServiceBadge } from "./ServiceBadge";
import { NovoClienteDialog } from "./NovoClienteDialog";

type ClienteRow = {
  id: string;
  name: string;
  cnpj: string | null;
  status: string;
  servicos: string[];
  responsavel_id: string | null;
  responsavel_email?: string | null;
};

export function ClientesTab() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [openNovo, setOpenNovo] = useState(false);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, cnpj, status, servicos, responsavel_id")
        .order("name");
      if (error) throw error;

      // Buscar emails dos responsáveis
      const userIds = Array.from(
        new Set((data ?? []).map((c: any) => c.responsavel_id).filter(Boolean)),
      );
      const profilesMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        for (const p of profs ?? []) profilesMap.set(p.user_id, p.display_name ?? "");
      }

      return (data ?? []).map((c: any) => ({
        ...c,
        servicos: Array.isArray(c.servicos) ? c.servicos : [],
        responsavel_email: c.responsavel_id ? profilesMap.get(c.responsavel_id) ?? "—" : "—",
      })) as ClienteRow[];
    },
  });

  const filtrados = clientes.filter((c) =>
    c.name.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            placeholder="Buscar cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setOpenNovo(true)} className="gap-2">
          <Plus size={14} /> Novo Cliente
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
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Serviços</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => nav(`/workspace/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.cnpj ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.servicos.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {c.servicos.map((s) => <ServiceBadge key={s} service={s} />)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.responsavel_email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        c.status === "active"
                          ? "bg-green-500/15 text-green-400 border-green-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }
                    >
                      {c.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <NovoClienteDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin-clientes"] })}
      />
    </div>
  );
}
