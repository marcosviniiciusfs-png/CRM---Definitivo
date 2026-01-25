import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskStats {
  total: number;
  byColumn: {
    columnId: string;
    columnTitle: string;
    count: number;
    tasks: {
      id: string;
      content: string;
      dueDate?: string;
      isOverdue: boolean;
    }[];
  }[];
  overdueCount: number;
}

export function useMemberTasks(userId: string | undefined, organizationId: string | undefined) {
  return useQuery({
    queryKey: ["member-tasks", userId, organizationId],
    queryFn: async (): Promise<TaskStats> => {
      if (!userId || !organizationId) {
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      // Buscar tarefas atribuídas ao usuário
      const { data: assignees, error } = await supabase
        .from("kanban_card_assignees")
        .select(`
          card_id,
          kanban_cards!inner (
            id,
            content,
            due_date,
            column_id,
            kanban_columns!inner (
              id,
              title,
              position,
              kanban_boards!inner (
                organization_id
              )
            )
          )
        `)
        .eq("user_id", userId);

      if (error || !assignees) {
        console.error("Error fetching member tasks:", error);
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      // Filtrar por organização e processar dados
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const columnMap = new Map<string, {
        columnId: string;
        columnTitle: string;
        position: number;
        tasks: { id: string; content: string; dueDate?: string; isOverdue: boolean }[];
      }>();

      let overdueCount = 0;

      for (const assignee of assignees) {
        const card = assignee.kanban_cards as any;
        const column = card?.kanban_columns;
        const board = column?.kanban_boards;

        if (board?.organization_id !== organizationId) continue;

        const isOverdue = card.due_date ? new Date(card.due_date) < today : false;
        if (isOverdue) overdueCount++;

        if (!columnMap.has(column.id)) {
          columnMap.set(column.id, {
            columnId: column.id,
            columnTitle: column.title,
            position: column.position,
            tasks: [],
          });
        }

        columnMap.get(column.id)?.tasks.push({
          id: card.id,
          content: card.content,
          dueDate: card.due_date,
          isOverdue,
        });
      }

      // Ordenar colunas por posição e converter para array
      const byColumn = Array.from(columnMap.values())
        .sort((a, b) => a.position - b.position)
        .map(({ columnId, columnTitle, tasks }) => ({
          columnId,
          columnTitle,
          count: tasks.length,
          tasks,
        }));

      const total = byColumn.reduce((acc, col) => acc + col.count, 0);

      return { total, byColumn, overdueCount };
    },
    enabled: !!userId && !!organizationId,
    staleTime: 30 * 1000, // 30 segundos
  });
}
