import { useEffect, useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, AlertCircle } from "lucide-react";
import { sb } from "@/lib/sb";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { NovaTarefaDialog } from "./tarefas/NovaTarefaDialog";
import { TaskCard } from "./tarefas/TaskCard";
import { type Task, type TaskStatus, STATUS_LABELS, isOverdue } from "./tarefas/types";

type Profile = { user_id: string; display_name: string | null };
type Portfolio = { id: string; name: string };

const COLUMNS: TaskStatus[] = ["a_fazer", "em_andamento", "feita"];

export function TarefasTab() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [portfolios, setPortfolios] = useState<Map<string, Portfolio>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const [filterScope, setFilterScope] = useState<"all" | "mine">("all");
  const [filterPortfolio, setFilterPortfolio] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes, portfoliosRes] = await Promise.all([
      sb.from("tasks").select("*").order("created_at", { ascending: false }),
      sb.from("task_assignees").select("task_id, user_id"),
      sb.from("profiles").select("user_id, display_name"),
      sb.from("portfolios").select("id, name"),
    ]);
    if (tasksRes.error) { toast.error(tasksRes.error.message); setLoading(false); return; }

    const assigneeMap = new Map<string, string[]>();
    (assigneesRes.data ?? []).forEach((a: any) => {
      const arr = assigneeMap.get(a.task_id) ?? [];
      arr.push(a.user_id);
      assigneeMap.set(a.task_id, arr);
    });
    const enriched: Task[] = (tasksRes.data ?? []).map((t: any) => ({
      ...t, assignees: assigneeMap.get(t.id) ?? [],
    }));
    setTasks(enriched);
    setProfiles(new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p])));
    setPortfolios(new Map((portfoliosRes.data ?? []).map((p: any) => [p.id, p])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterScope === "mine" && user && !(t.assignees ?? []).includes(user.id)) return false;
      if (filterPortfolio !== "all" && t.portfolio_id !== filterPortfolio) return false;
      if (search.trim() && !t.titulo.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, filterScope, filterPortfolio, search, user]);

  const overdueTasks = filtered.filter((t) => isOverdue(t));
  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { a_fazer: [], em_andamento: [], feita: [] };
    filtered.forEach((t) => m[t.status].push(t));
    return m;
  }, [filtered]);

  async function handleComplete(t: Task) {
    const { error } = await sb.from("tasks").update({
      status: "feita",
      completed_at: new Date().toISOString(),
      completed_by: user?.id ?? null,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Tarefa concluída");
    load();
  }

  async function handleStatus(t: Task, status: TaskStatus) {
    const payload: any = { status };
    if (status === "feita") {
      payload.completed_at = new Date().toISOString();
      payload.completed_by = user?.id ?? null;
    } else {
      payload.completed_at = null;
      payload.completed_by = null;
    }
    const { error } = await sb.from("tasks").update(payload).eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  }

  function openEdit(t: Task) { setEditing(t); setOpenDialog(true); }
  function openNew() { setEditing(null); setOpenDialog(true); }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterScope} onValueChange={(v: any) => setFilterScope(v)}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="mine">Minhas tarefas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPortfolio} onValueChange={setFilterPortfolio}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {Array.from(portfolios.values()).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={openNew} className="gap-2"><Plus size={14} /> Nova tarefa</Button>
      </div>

      {/* Atrasadas alert */}
      {overdueTasks.length > 0 && (
        <Card className="p-3 border-destructive/50 bg-destructive/5 flex items-center gap-2">
          <AlertCircle size={16} className="text-destructive" />
          <span className="text-sm">
            <strong>{overdueTasks.length}</strong> tarefa(s) atrasada(s)
          </span>
        </Card>
      )}

      {/* Kanban */}
      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">Carregando...</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((status) => (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3>
                <span className="text-xs text-muted-foreground">{byStatus[status].length}</span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {byStatus[status].length === 0 && (
                  <Card className="p-4 text-xs text-center text-muted-foreground border-dashed">
                    Sem tarefas
                  </Card>
                )}
                {byStatus[status].map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    profiles={profiles}
                    portfolioName={t.portfolio_id ? portfolios.get(t.portfolio_id)?.name : undefined}
                    onEdit={openEdit}
                    onComplete={handleComplete}
                    onStatusChange={handleStatus}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NovaTarefaDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSaved={load}
        editing={editing}
      />
    </div>
  );
}
