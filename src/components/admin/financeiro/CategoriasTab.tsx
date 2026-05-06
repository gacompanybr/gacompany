import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function CategoriasTab() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#FEA60F");

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ["financial-categories"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("financial_categories")
        .select("id, nome, cor")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function add() {
    if (!nome.trim()) return toast.error("Informe o nome");
    const { error } = await sb
      .from("financial_categories")
      .insert({ nome: nome.trim(), cor });
    if (error) return toast.error(error.message);
    setNome("");
    toast.success("Categoria criada");
    qc.invalidateQueries({ queryKey: ["financial-categories"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await sb.from("financial_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    qc.invalidateQueries({ queryKey: ["financial-categories"] });
  }

  return (
    <Card className="p-4 space-y-4 max-w-xl">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Input
            placeholder="Nome da categoria"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <input
          type="color"
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          className="h-10 w-12 rounded border border-border bg-transparent cursor-pointer"
          title="Cor"
        />
        <Button onClick={add} className="gap-1"><Plus size={14} /> Adicionar</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={18} /></div>
      ) : (
        <ul className="divide-y divide-border">
          {cats.length === 0 && (
            <li className="py-4 text-sm text-muted-foreground text-center">Nenhuma categoria.</li>
          )}
          {cats.map((c: any) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: c.cor }} />
                <span className="text-sm">{c.nome}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
