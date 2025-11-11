import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, AlertCircle } from "lucide-react";

const tasks = [
  {
    id: 1,
    title: "Enviar proposta para Tech Solutions",
    lead: "Carlos Silva",
    dueDate: "2024-01-16",
    priority: "high",
    completed: false,
  },
  {
    id: 2,
    title: "Follow-up com Inovação Digital",
    lead: "Ana Paula",
    dueDate: "2024-01-17",
    priority: "medium",
    completed: false,
  },
  {
    id: 3,
    title: "Preparar apresentação para Global Corp",
    lead: "Pedro Lima",
    dueDate: "2024-01-18",
    priority: "high",
    completed: false,
  },
  {
    id: 4,
    title: "Ligar para Empresa X",
    lead: "João Santos",
    dueDate: "2024-01-15",
    priority: "medium",
    completed: true,
  },
];

const priorityColors: Record<string, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
};

const Tasks = () => {
  const overdueTasks = tasks.filter(t => !t.completed && new Date(t.dueDate) < new Date());
  const upcomingTasks = tasks.filter(t => !t.completed && new Date(t.dueDate) >= new Date());
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">Gerencie suas atividades pendentes</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {overdueTasks.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Tarefas Vencidas ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5">
                  <Checkbox id={`task-${task.id}`} />
                  <div className="flex-1">
                    <label htmlFor={`task-${task.id}`} className="text-sm font-medium cursor-pointer">
                      {task.title}
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{task.lead}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <div className="flex items-center gap-1 text-xs text-destructive">
                        <Calendar className="h-3 w-3" />
                        {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-xs">
                    {task.priority === "high" ? "Alta" : "Média"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tarefas Pendentes ({upcomingTasks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <Checkbox id={`task-${task.id}`} />
                <div className="flex-1">
                  <label htmlFor={`task-${task.id}`} className="text-sm font-medium cursor-pointer">
                    {task.title}
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{task.lead}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
                <Badge variant={task.priority === "high" ? "default" : "secondary"} className="text-xs">
                  {task.priority === "high" ? "Alta" : "Média"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {completedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">
              Tarefas Concluídas ({completedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border opacity-60">
                  <Checkbox id={`task-${task.id}`} checked />
                  <div className="flex-1">
                    <label htmlFor={`task-${task.id}`} className="text-sm font-medium line-through cursor-pointer">
                      {task.title}
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{task.lead}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Tasks;
