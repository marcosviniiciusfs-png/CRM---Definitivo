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

      // Step 1: Get card_ids assigned to this user
      const { data: assignedCards, error: assignError } = await supabase
        .from("kanban_card_assignees")
        .select("card_id")
        .eq("user_id", userId);

      if (assignError) {
        console.error("[useMemberTasks] Error fetching assignees:", assignError);
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      if (!assignedCards || assignedCards.length === 0) {
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      const cardIds = assignedCards.map(a => a.card_id);

      // Step 2: Get cards with their columns and boards
      const { data: cards, error: cardsError } = await supabase
        .from("kanban_cards")
        .select(`
          id,
          content,
          due_date,
          column_id,
          kanban_columns!kanban_cards_column_id_fkey (
            id,
            title,
            position,
            board_id,
            kanban_boards (
              organization_id
            )
          )
        `)
        .in("id", cardIds);

      if (cardsError) {
        console.error("[useMemberTasks] Error fetching cards:", cardsError);
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      if (!cards || cards.length === 0) {
        return { total: 0, byColumn: [], overdueCount: 0 };
      }

      // Step 3: Process and filter by organization
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const columnMap = new Map<string, {
        columnId: string;
        columnTitle: string;
        position: number;
        tasks: { id: string; content: string; dueDate?: string; isOverdue: boolean }[];
      }>();

      let overdueCount = 0;

      for (const card of cards) {
        const column = card.kanban_columns as any;
        const board = column?.kanban_boards;

        // Filter by organization
        if (!board || board.organization_id !== organizationId) continue;

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
          dueDate: card.due_date || undefined,
          isOverdue,
        });
      }

      // Sort columns by position and convert to array
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
    staleTime: 30 * 1000, // 30 seconds
  });
}
