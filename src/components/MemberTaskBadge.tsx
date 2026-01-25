import { ClipboardList, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemberTasks, TaskStats } from "@/hooks/useMemberTasks";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface MemberTaskBadgeProps {
  userId: string;
  organizationId: string;
  showZero?: boolean;
}

export const MemberTaskBadge = ({
  userId,
  organizationId,
  showZero = false,
}: MemberTaskBadgeProps) => {
  const { data: taskStats, isLoading } = useMemberTasks(userId, organizationId);

  if (isLoading) {
    return <Skeleton className="h-6 w-12 rounded-full" />;
  }

  if (!taskStats || (taskStats.total === 0 && !showZero)) {
    return null;
  }

  const hasOverdue = taskStats.overdueCount > 0;
  const badgeColor = hasOverdue
    ? "bg-red-500/15 text-red-500 border-red-500/30"
    : taskStats.total > 0
    ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-help transition-colors",
            badgeColor
          )}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{taskStats.total}</span>
          {hasOverdue && <AlertCircle className="h-3 w-3 animate-pulse" />}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="p-0 w-64">
        <TaskStatsTooltip stats={taskStats} />
      </TooltipContent>
    </Tooltip>
  );
};

interface TaskStatsTooltipProps {
  stats: TaskStats;
}

const TaskStatsTooltip = ({ stats }: TaskStatsTooltipProps) => {
  if (stats.total === 0) {
    return (
      <div className="p-3 text-center text-sm text-muted-foreground">
        Nenhuma tarefa atribuída
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-sm font-semibold">Tarefas Atribuídas</span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
          {stats.total} total
        </span>
      </div>

      <div className="space-y-2">
        {stats.byColumn.map((col) => (
          <div
            key={col.columnId}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              {col.columnTitle.toLowerCase().includes("conclu") ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : col.columnTitle.toLowerCase().includes("progresso") ? (
                <Clock className="h-3.5 w-3.5 text-yellow-500" />
              ) : (
                <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
              )}
              <span className="text-muted-foreground">{col.columnTitle}</span>
            </div>
            <span className="font-medium">{col.count}</span>
          </div>
        ))}
      </div>

      {stats.overdueCount > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-border text-red-500 text-xs">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{stats.overdueCount} tarefa(s) atrasada(s)</span>
        </div>
      )}
    </div>
  );
};
