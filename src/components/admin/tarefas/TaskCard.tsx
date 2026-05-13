import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Check, Clock, Pencil } from "lucide-react";
import { type Task, PRIORITY_COLORS, PRIORITY_LABELS, isOverdue } from "./types";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; display_name: string | null };

export function TaskCard({
  task, profiles, portfolioName, onEdit, onComplete, onStatusChange,
}: {
  task: Task;
  profiles: Map<string, Profile>;
  portfolioName?: string;
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  onStatusChange: (t: Task, status: Task["status"]) => void;
}) {
  const overdue = isOverdue(task);
  const prazoLabel = task.prazo
    ? new Date(task.prazo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card className={cn("p-3 space-y-2 hover:border-primary/50 transition-colors", overdue && "border-destructive/50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-tight">{task.titulo}</p>
          {task.descricao && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{task.descricao}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {task.status !== "feita" && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onComplete(task)} title="Marcar feita">
              <Check size={14} />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(task)} title="Editar">
            <Pencil size={12} />
          </Button>
        </div>
      </div>

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

      {task.status !== "feita" && (
        <div className="flex gap-1 pt-1 border-t border-border">
          {task.status === "a_fazer" && (
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
              onClick={() => onStatusChange(task, "em_andamento")}>
              → Em andamento
            </Button>
          )}
          {task.status === "em_andamento" && (
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
              onClick={() => onStatusChange(task, "a_fazer")}>
              ← A fazer
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
