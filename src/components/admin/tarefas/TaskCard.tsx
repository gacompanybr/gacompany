import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Check, Clock, GripVertical, ListChecks, Pencil } from "lucide-react";
import { type Task, PRIORITY_COLORS, PRIORITY_LABELS, isOverdue } from "./types";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; display_name: string | null };

export function TaskCard({
  task, profiles, portfolioName, onEdit, onComplete, dragHandleProps,
}: {
  task: Task;
  profiles: Map<string, Profile>;
  portfolioName?: string;
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const overdue = isOverdue(task);
  const prazoLabel = task.prazo
    ? new Date(task.prazo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card className={cn("p-3 space-y-2 hover:border-primary/50 transition-colors", overdue && "border-destructive/50")} onClick={() => onEdit(task)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-tight">{task.titulo}</p>
          {task.descricao && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{task.descricao}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <div {...dragHandleProps} className="cursor-grab touch-none p-1 text-muted-foreground" onClick={(event) => event.stopPropagation()}><GripVertical size={14} /></div>
          {task.status !== "feita" && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(event) => { event.stopPropagation(); onComplete(task); }} title="Marcar feita">
              <Check size={14} />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(event) => { event.stopPropagation(); onEdit(task); }} title="Editar">
            <Pencil size={12} />
          </Button>
        </div>
      </div>

      {(task.subtasks ?? []).length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <ListChecks size={12} />
          <span>{task.subtasks?.filter((item) => item.is_completed).length}/{task.subtasks?.length} subtarefas</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${((task.subtasks?.filter((item) => item.is_completed).length ?? 0) / (task.subtasks?.length ?? 1)) * 100}%` }} /></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[task.prioridade])} variant="outline">
          {PRIORITY_LABELS[task.prioridade]}
        </Badge>
        {portfolioName && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{portfolioName}</Badge>
        )}
        {prazoLabel && (
          <span className={cn("inline-flex items-center gap-1 text-[10px]", overdue ? "text-destructive" : "text-muted-foreground")}>
            {overdue ? <Clock size={10} /> : <Calendar size={10} />}
            {prazoLabel}
          </span>
        )}
      </div>

      {(task.assignees ?? []).length > 0 && (
        <div className="flex -space-x-1.5">
          {(task.assignees ?? []).slice(0, 4).map((uid) => {
            const name = profiles.get(uid)?.display_name ?? "?";
            const initials = name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <Avatar key={uid} className="h-6 w-6 border border-background">
                <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
              </Avatar>
            );
          })}
          {(task.assignees ?? []).length > 4 && (
            <span className="text-[10px] text-muted-foreground ml-2 self-center">
              +{(task.assignees ?? []).length - 4}
            </span>
          )}
        </div>
      )}

    </Card>
  );
}
