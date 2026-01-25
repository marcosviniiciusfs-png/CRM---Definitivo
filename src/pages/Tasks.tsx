import { useOrganization } from "@/contexts/OrganizationContext";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoadingAnimation } from "@/components/LoadingAnimation";

const Tasks = () => {
  const { organizationId, isInitialized } = useOrganization();

  if (!isInitialized) {
    return <LoadingAnimation text="Carregando tarefas..." />;
  }

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">Erro ao carregar organização</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
        <p className="text-muted-foreground">Gerencie suas atividades com o quadro Kanban</p>
      </div>

      <KanbanBoard organizationId={organizationId} />
    </div>
  );
};

export default Tasks;
