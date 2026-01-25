import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoadingAnimation } from "@/components/LoadingAnimation";

const Tasks = () => {
  const { organizationId, isReady } = useOrganizationReady();

  // Guard: Aguardar inicialização completa (auth + org)
  if (!isReady || !organizationId) {
    return <LoadingAnimation text="Carregando tarefas..." />;
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
