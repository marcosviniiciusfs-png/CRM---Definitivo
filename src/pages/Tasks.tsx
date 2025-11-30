import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoadingAnimation } from "@/components/LoadingAnimation";

const Tasks = () => {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrganizationId = async () => {
      if (!user) return;

      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      setOrganizationId(data?.organization_id || null);
      setLoading(false);
    };

    fetchOrganizationId();
  }, [user]);

  if (loading) {
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
