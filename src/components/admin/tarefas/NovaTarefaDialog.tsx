import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sb } from "@/lib/sb";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ResponsaveisMultiSelect } from "@/components/admin/ResponsaveisMultiSelect";
import type { Task, TaskPriority, TaskStatus } from "./types";

type Portfolio = { id: string; name: string };

export function NovaTarefaDialog({
  open, onOpenChange, onSaved, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: Task | null;
}) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<TaskStatus>("a_fazer");
  const [prioridade, setPrioridade] = useState<TaskPriority>("media");
  const [prazoDate, setPrazoDate] = useState("");
  const [prazoTime, setPrazoTime] = useState("");
  const [portfolioId, setPortfolioId] = useState<string>("none");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    sb.from("portfolios").select("id, name").order("name").then(({ data }: any) => {
      setPortfolios(data ?? []);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitulo(editing.titulo);
      setDescricao(editing.descricao ?? "");
      setStatus(editing.status);
      setPrioridade(editing.prioridade);
      if (editing.prazo) {
        const d = new Date(editing.prazo);
        setPrazoDate(d.toISOString().slice(0, 10));
        setPrazoTime(d.toTimeString().slice(0, 5));
      } else {
        setPrazoDate(""); setPrazoTime("");
      }
      setPortfolioId(editing.portfolio_id ?? "none");
      setAssignees(editing.assignees ?? []);
    } else {
      setTitulo(""); setDescricao(""); setStatus("a_fazer"); setPrioridade("media");
      setPrazoDate(""); setPrazoTime(""); setPortfolioId("none"); setAssignees([]);
    }
  }, [open, editing]);

  async function handleSave() {
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    if (!user) return;
    setSaving(true);
    try {
      const prazo = prazoDate ? new Date(`${prazoDate}T${prazoTime || "23:59"}:00`).toISOString() : null;
      const payload: any = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        status,
        prioridade,
        prazo,
        portfolio_id: portfolioId === "none" ? null : portfolioId,
      };

      let taskId = editing?.id;
      if (editing) {
        const { error } = await sb.from("tasks").update(payload).eq("id", editing.id);
        if (error) throw error;
        // reset assignees
        await sb.from("task_assignees").delete().eq("task_id", editing.id);
      } else {
        payload.created_by = user.id;
        const { data, error } = await sb.from("tasks").insert(payload).select("id").single();
        if (error) throw error;
        taskId = data.id;
      }

      if (taskId && assignees.length > 0) {
        const rows = assignees.map((uid) => ({ task_id: taskId, user_id: uid }));
        const { error } = await sb.from("task_assignees").insert(rows);
        if (error) throw error;
      }

      toast.success(editing ? "Tarefa atualizada" : "Tarefa criada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_fazer">A fazer</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="feita">Feita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data do prazo</Label>
              <Input type="date" value={prazoDate} onChange={(e) => setPrazoDate(e.target.value)} />
            </div>
            <div>
              <Label>Hora</Label>
              <Input type="time" value={prazoTime} onChange={(e) => setPrazoTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
            <Select value={portfolioId} onValueChange={setPortfolioId}>
              <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cliente</SelectItem>
                {portfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Responsáveis</Label>
            <ResponsaveisMultiSelect value={assignees} onChange={setAssignees} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
