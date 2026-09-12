import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, AlertCircle, CalendarDays } from "lucide-react";
import { sb } from "@/lib/sb";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { NovaTarefaDialog } from "./tarefas/NovaTarefaDialog";
import { TaskCard } from "./tarefas/TaskCard";
import { type Task, type TaskStatus, STATUS_LABELS, isOverdue } from "./tarefas/types";

type Profile = { user_id: string; display_name: string | null };
type Portfolio = { id: string; name: string };
const COLUMNS: TaskStatus[] = ["a_fazer", "em_andamento", "feita"];

function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DraggableTask({ task, ...props }: { task: Task; profiles: Map<string, Profile>; portfolioName?: string; onEdit: (task: Task) => void; onComplete: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { task } });
  return <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.45 : 1 }}><TaskCard task={task} {...props} dragHandleProps={{ ...attributes, ...listeners }} /></div>;
}

function KanbanColumn({ status, tasks, children }: { status: TaskStatus; tasks: Task[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <section ref={setNodeRef} className={`w-[calc(100vw-2.75rem)] shrink-0 snap-start rounded-md border bg-muted/20 p-2 transition-colors sm:w-auto sm:min-w-[280px] ${isOver ? "border-primary bg-primary/5" : "border-border"}`}>
    <div className="mb-2 flex items-center justify-between px-1"><h3 className="text-sm font-semibold">{STATUS_LABELS[status]}</h3><span className="text-xs text-muted-foreground">{tasks.length}</span></div>
    <div className="max-h-[28rem] md:max-h-[calc(100vh-250px)] min-h-[8rem] space-y-2 overflow-y-auto pr-1">{children}{tasks.length === 0 && <div className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">Arraste uma tarefa para cá</div>}</div>
  </section>;
}

export function TarefasTab() {
  const { user, hasPermission } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [portfolios, setPortfolios] = useState<Map<string, Portfolio>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [filterScope, setFilterScope] = useState<"all" | "mine">("all");
  const [filterPortfolio, setFilterPortfolio] = useState("all");
  const [filterDate, setFilterDate] = useState(() => localDateKey(new Date()));
  const [search, setSearch] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canManage = hasPermission("tasks.manage");

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, assigneesRes, profilesRes, portfoliosRes, subtasksRes] = await Promise.all([
      sb.from("tasks").select("*").order("prazo", { ascending: true, nullsFirst: false }),
      sb.from("task_assignees").select("task_id, user_id"), sb.from("profiles").select("user_id, display_name"),
      sb.from("portfolios").select("id, name"), sb.from("task_subtasks").select("*").order("position"),
    ]);
    if (tasksRes.error) { toast.error(tasksRes.error.message); setLoading(false); return; }
    const assigneeMap = new Map<string, string[]>();
    for (const row of assigneesRes.data ?? []) assigneeMap.set(row.task_id, [...(assigneeMap.get(row.task_id) ?? []), row.user_id]);
    const subtaskMap = new Map<string, any[]>();
    for (const row of subtasksRes.data ?? []) subtaskMap.set(row.task_id, [...(subtaskMap.get(row.task_id) ?? []), row]);
    setTasks((tasksRes.data ?? []).map((task: any) => ({ ...task, assignees: assigneeMap.get(task.id) ?? [], subtasks: subtaskMap.get(task.id) ?? [] })));
    setProfiles(new Map((profilesRes.data ?? []).map((profile: Profile) => [profile.user_id, profile])));
    setPortfolios(new Map((portfoliosRes.data ?? []).map((portfolio: Portfolio) => [portfolio.id, portfolio])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => tasks.filter((task) => {
    if (filterScope === "mine" && user && !(task.assignees ?? []).includes(user.id)) return false;
    if (filterPortfolio !== "all" && task.portfolio_id !== filterPortfolio) return false;
    if (filterDate && (!task.prazo || localDateKey(task.prazo) !== filterDate)) return false;
    if (search.trim() && !task.titulo.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, filterScope, filterPortfolio, filterDate, search, user]);

  const byStatus = useMemo(() => Object.fromEntries(COLUMNS.map((status) => [status, filtered.filter((task) => task.status === status)])) as Record<TaskStatus, Task[]>, [filtered]);
  const overdueTasks = filtered.filter(isOverdue);

  async function handleStatus(task: Task, status: TaskStatus) {
    if (!canManage && !(task.assignees ?? []).includes(user?.id ?? "")) { toast.error("Você só pode atualizar tarefas atribuídas a você."); return; }
    if (task.status === status) return;
    if ((task.subtasks ?? []).some((item) => !item.is_completed) && COLUMNS.indexOf(status) > COLUMNS.indexOf(task.status)) {
      toast.error(`Conclua todas as subtarefas de “${task.titulo}” antes de avançar.`); return;
    }
    const payload: Record<string, unknown> = { status, completed_at: status === "feita" ? new Date().toISOString() : null, completed_by: status === "feita" ? user?.id : null };
    setTasks((current) => current.map((row) => row.id === task.id ? { ...row, ...payload } as Task : row));
    const { error } = await sb.from("tasks").update(payload).eq("id", task.id);
    if (error) { toast.error(error.message); load(); }
  }

  function handleDragEnd(event: DragEndEvent) {
    const task = event.active.data.current?.task as Task | undefined;
    const status = event.over?.id as TaskStatus | undefined;
    if (task && status && COLUMNS.includes(status)) handleStatus(task, status);
  }

  return <div className="space-y-4">
    <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
      <div className="relative col-span-2 min-w-0 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} /><Input placeholder="Buscar tarefas..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" /></div>
      <div className="relative min-w-0"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} /><Input type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} className="h-9 w-full pl-9 sm:w-[155px]" /></div>
      <Button variant="ghost" size="sm" onClick={() => setFilterDate("")}>Todas as datas</Button>
      <Select value={filterScope} onValueChange={(value: "all" | "mine") => setFilterScope(value)}><SelectTrigger className="h-9 w-full sm:w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="mine">Minhas tarefas</SelectItem></SelectContent></Select>
      <Select value={filterPortfolio} onValueChange={setFilterPortfolio}><SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{Array.from(portfolios.values()).map((portfolio) => <SelectItem key={portfolio.id} value={portfolio.id}>{portfolio.name}</SelectItem>)}</SelectContent></Select>
      <div className="flex-1" />
      {canManage && <Button onClick={() => { setEditing(null); setOpenDialog(true); }} className="col-span-2 gap-2 sm:w-auto"><Plus size={14} /> Nova tarefa</Button>}
    </div>
    {overdueTasks.length > 0 && <Card className="flex items-center gap-2 border-destructive/50 bg-destructive/5 p-3"><AlertCircle size={16} className="text-destructive" /><span className="text-sm"><strong>{overdueTasks.length}</strong> tarefa(s) atrasada(s)</span></Card>}
    {loading ? <Card className="p-8 text-center text-muted-foreground sm:p-12">Carregando...</Card> : <DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">{COLUMNS.map((status) => <KanbanColumn key={status} status={status} tasks={byStatus[status]}>{byStatus[status].map((task) => <DraggableTask key={task.id} task={task} profiles={profiles} portfolioName={task.portfolio_id ? portfolios.get(task.portfolio_id)?.name : undefined} onEdit={(selected) => { setEditing(selected); setOpenDialog(true); }} onComplete={(selected) => handleStatus(selected, "feita")} />)}</KanbanColumn>)}</div></DndContext>}
    <NovaTarefaDialog open={openDialog} onOpenChange={setOpenDialog} onSaved={load} editing={editing} />
  </div>;
}