import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useOrganization } from "@/contexts/OrganizationContext";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Shield } from "lucide-react";
import { TaskPermissionAlert } from "@/components/TaskPermissionAlert";

const Tasks = () => {
  const { organizationId, isReady } = useOrganizationReady();
  const { permissions } = useOrganization();

  // Guard: Aguardar inicialização completa (auth + org)
  if (!isReady || !organizationId) {
    return <LoadingAnimation text="Carregando tarefas..." />;
  }

  // Verificar permissão de visualização do Kanban
  // Owners e Admins sempre podem ver (role-based)
  // Members só podem ver se tiverem canViewKanban no cargo personalizado
  const canViewKanban = permissions.role === 'owner' || 
                        permissions.role === 'admin' || 
                        permissions.canViewKanban;

  if (!canViewKanban) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-md">
          Você não tem permissão para visualizar o quadro de tarefas. 
          Entre em contato com o administrador da organização para solicitar acesso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
        <p className="text-muted-foreground">Gerencie suas atividades com o quadro Kanban</p>
      </div>

      {/* Card de alerta para ativar som de notificação */}
      <TaskPermissionAlert />

      <KanbanBoard organizationId={organizationId} />
    </div>
  );
};

export default Tasks;
