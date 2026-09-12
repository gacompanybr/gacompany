export type TaskStatus = "a_fazer" | "em_andamento" | "feita";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TaskStatus;
  prioridade: TaskPriority;
  prazo: string | null;
  portfolio_id: string | null;
  created_by: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  assignees?: string[]; // user_ids
  subtasks?: TaskSubtask[];
};

export type TaskSubtask = {
  id: string;
  task_id: string;
  title: string;
  position: number;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  feita: "Feitas",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-blue-500/15 text-blue-500",
  alta: "bg-orange-500/15 text-orange-500",
  urgente: "bg-destructive/15 text-destructive",
};

export function isOverdue(t: Task): boolean {
  if (t.status === "feita" || !t.prazo) return false;
  return new Date(t.prazo) < new Date();
}
