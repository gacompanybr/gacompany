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
import type { Task, TaskPriority, TaskStatus, TaskSubtask } from "./types";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";

type Portfolio = { id: string; name: string };

function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function NovaTarefaDialog({
  open, onOpenChange, onSaved, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: Task | null;
}) {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("tasks.manage");
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
  const [subtasks, setSubtasks] = useState<Array<Pick<TaskSubtask, "id" | "title" | "is_completed">>>([]);

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
        setPrazoDate(localDateKey(d));
        setPrazoTime(d.toTimeString().slice(0, 5));
      } else {
        setPrazoDate(""); setPrazoTime("");
      }
      setPortfolioId(editing.portfolio_id ?? "none");
      setAssignees(editing.assignees ?? []);
      setSubtasks(editing.subtasks ?? []);
    } else {
      setTitulo(""); setDescricao(""); setStatus("a_fazer"); setPrioridade("media");
      setPrazoDate(localDateKey(new Date())); setPrazoTime("23:59"); setPortfolioId("none"); setAssignees([]); setSubtasks([]);
    }
  }, [open, editing]);

  async function handleSave() {
    if (!canManage && editing) {
      const changed = subtasks.filter((item) => !item.id.startsWith("new-") && item.is_completed !== (editing.subtasks ?? []).find((old) => old.id === item.id)?.is_completed);
      try {
        setSaving(true);
        for (const item of changed) {
          const { error } = await sb.from("task_subtasks").update({ is_completed: item.is_completed, completed_by: item.is_completed ? user?.id : null, completed_at: item.is_completed ? new Date().toISOString() : null }).eq("id", item.id);
          if (error) throw error;
        }
        toast.success("Checklist atualizado"); onSaved(); onOpenChange(false);
      } catch (error: any) { toast.error(error.message ?? "Erro ao atualizar checklist"); } finally { setSaving(false); }
      return;
    }
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    if (subtasks.some((item) => !item.title.trim())) { toast.error("Preencha ou remova as subtarefas vazias"); return; }
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
        const { error: pushError } = await sb.functions.invoke("push-notifications", { body: { source: "task_assignment" } });
        if (pushError) console.error("Falha ao disparar notificações:", pushError);
      }

      if (taskId) {
        const currentIds = subtasks.filter((item) => !item.id.startsWith("new-")).map((item) => item.id);
        let deleteQuery = sb.from("task_subtasks").delete().eq("task_id", taskId);
        if (currentIds.length > 0) deleteQuery = deleteQuery.not("id", "in", `(${currentIds.join(",")})`);
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
        for (const [position, item] of subtasks.entries()) {
          const payload = { task_id: taskId, title: item.title.trim(), is_completed: item.is_completed, position, completed_by: item.is_completed ? user.id : null, completed_at: item.is_completed ? new Date().toISOString() : null };
          const query = item.id.startsWith("new-") ? sb.from("task_subtasks").insert(payload) : sb.from("task_subtasks").update(payload).eq("id", item.id);
          const { error } = await query;
          if (error) throw error;
        }
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
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)} disabled={!canManage}>
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
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as TaskPriority)} disabled={!canManage}>
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
              <Input type="date" value={prazoDate} onChange={(e) => setPrazoDate(e.target.value)} disabled={!canManage} />
            </div>
            <div>
              <Label>Hora</Label>
              <Input type="time" value={prazoTime} onChange={(e) => setPrazoTime(e.target.value)} disabled={!canManage} />
            </div>
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
            <Select value={portfolioId} onValueChange={setPortfolioId} disabled={!canManage}>
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
            {canManage ? <ResponsaveisMultiSelect value={assignees} onChange={setAssignees} /> : <p className="text-sm text-muted-foreground">{assignees.map((id) => id.slice(0, 8)).join(", ") || "Sem responsável"}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Subtarefas</Label>
              {canManage && <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setSubtasks((current) => [...current, { id: `new-${crypto.randomUUID()}`, title: "", is_completed: false }])}><Plus size={13} /> Adicionar</Button>}
            </div>
            {subtasks.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox checked={item.is_completed} onCheckedChange={(checked) => setSubtasks((current) => current.map((row, i) => i === index ? { ...row, is_completed: checked === true } : row))} />
                <Input value={item.title} placeholder={`Subtarefa ${index + 1}`} disabled={!canManage} onChange={(event) => setSubtasks((current) => current.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} />
                {canManage && <Button type="button" variant="ghost" size="icon" onClick={() => setSubtasks((current) => current.filter((_, i) => i !== index))} aria-label="Excluir subtarefa"><Trash2 size={14} /></Button>}
              </div>
            ))}
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
