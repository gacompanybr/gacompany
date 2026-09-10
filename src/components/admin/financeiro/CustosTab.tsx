import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/sb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BRL, formatDateBR, todayISO } from "@/lib/financeiro";

type CostRow = {
  id: string;
  nome: string;
  descricao: string | null;
  valor: number;
  tipo: "mensal" | "unico";
  categoria: string | null;
  data_referencia: string;
  ativo: boolean;
};

type Draft = {
  id?: string;
  nome: string;
  descricao: string;
  valor: string;
  tipo: "mensal" | "unico";
  categoria: string;
  data_referencia: string;
  ativo: boolean;
};

const emptyDraft = (): Draft => ({
  nome: "",
  descricao: "",
  valor: "",
  tipo: "mensal",
  categoria: "",
  data_referencia: todayISO(),
  ativo: true,
});

export function CustosTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));

  const { data: custos = [], isLoading } = useQuery({
    queryKey: ["financial-costs"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("financial_costs")
        .select("id, nome, descricao, valor, tipo, categoria, data_referencia, ativo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CostRow[];
    },
  });

  const totais = useMemo(() => {
    const mensais = custos
      .filter((c) => c.ativo && c.tipo === "mensal")
      .reduce((s, c) => s + Number(c.valor ?? 0), 0);
    const unicosMes = custos
      .filter((c) => c.ativo && c.tipo === "unico" && c.data_referencia.slice(0, 7) === mes)
      .reduce((s, c) => s + Number(c.valor ?? 0), 0);
    return { mensais, unicosMes, total: mensais + unicosMes };
  }, [custos, mes]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["financial-costs"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }

  function openNew() {
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(c: CostRow) {
    setDraft({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao ?? "",
      valor: String(c.valor ?? ""),
      tipo: c.tipo,
      categoria: c.categoria ?? "",
      data_referencia: c.data_referencia,
      ativo: c.ativo,
    });
    setOpen(true);
  }

  async function save() {
    if (!draft.nome.trim()) return toast.error("Informe o nome do custo");
    const valor = Number(String(draft.valor).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) return toast.error("Valor inválido");

    const payload = {
      nome: draft.nome.trim(),
      descricao: draft.descricao.trim() || null,
      valor,
      tipo: draft.tipo,
      categoria: draft.categoria.trim() || null,
      data_referencia: draft.data_referencia,
      ativo: draft.ativo,
    };

    const { error } = draft.id
      ? await sb.from("financial_costs").update(payload).eq("id", draft.id)
      : await sb.from("financial_costs").insert(payload);

    if (error) return toast.error(error.message);
    toast.success(draft.id ? "Custo atualizado" : "Custo criado");
    setOpen(false);
    refresh();
  }

  async function toggleAtivo(c: CostRow) {
    const { error } = await sb
      .from("financial_costs")
      .update({ ativo: !c.ativo })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function remove(c: CostRow) {
    if (!confirm(`Excluir o custo "${c.nome}"?`)) return;
    const { error } = await sb.from("financial_costs").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Custo excluído");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Custos mensais (recorrentes)</div>
          <div className="text-2xl font-bold text-red-400">{BRL(totais.mensais)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Custos únicos no mês</div>
          <div className="text-2xl font-bold text-red-400">{BRL(totais.unicosMes)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total do mês</div>
          <div className="text-2xl font-bold">{BRL(totais.total)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label className="text-xs">Mês de referência</Label>
          <Input
            type="month"
            className="w-[180px]"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus size={14} /> Novo custo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : custos.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nenhum custo cadastrado ainda.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {custos.map((c) => (
              <li key={c.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{c.nome}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.tipo === "mensal" ? "Mensal" : "Único"}
                    </Badge>
                    {c.categoria && (
                      <Badge variant="secondary" className="text-[10px]">{c.categoria}</Badge>
                    )}
                    {!c.ativo && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.tipo === "mensal"
                      ? `Desde ${formatDateBR(c.data_referencia)}`
                      : formatDateBR(c.data_referencia)}
                    {c.descricao ? ` · ${c.descricao}` : ""}
                  </div>
                </div>
                <div className="font-semibold text-red-400">{BRL(c.valor)}</div>
                <Switch checked={c.ativo} onCheckedChange={() => toggleAtivo(c)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar custo" : "Novo custo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={draft.nome}
                onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                placeholder="Ex: Aluguel do escritório"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.valor}
                  onChange={(e) => setDraft({ ...draft, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={draft.tipo}
                  onValueChange={(v) => setDraft({ ...draft, tipo: v as "mensal" | "unico" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal (recorrente)</SelectItem>
                    <SelectItem value="unico">Único</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">
                  {draft.tipo === "mensal" ? "Início" : "Data"}
                </Label>
                <Input
                  type="date"
                  value={draft.data_referencia}
                  onChange={(e) => setDraft({ ...draft, data_referencia: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Categoria (opcional)</Label>
                <Input
                  value={draft.categoria}
                  onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
                  placeholder="Ex: Estrutura, Software"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações</Label>
              <Input
                value={draft.descricao}
                onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Custo ativo</div>
                <div className="text-xs text-muted-foreground">
                  Custos inativos não entram no cálculo do lucro líquido.
                </div>
              </div>
              <Switch
                checked={draft.ativo}
                onCheckedChange={(v) => setDraft({ ...draft, ativo: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
