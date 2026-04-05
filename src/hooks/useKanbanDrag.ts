import { useState, useCallback } from "react";
import {
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { Column, Card } from "./useKanbanBoard";

interface UseKanbanDragReturn {
  activeCard: Card | null;
  isDraggingActive: boolean;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: DragStartEvent, columns: Column[]) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent, columns: Column[], boardId: string | null, organizationId: string) => Promise<void>;
}

export function useKanbanDrag(
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>,
  loadColumns: (boardId: string) => Promise<void>
): UseKanbanDragReturn {
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent, columns: Column[]) => {
    const cardId = event.active.id as string;
    const card = columns.flatMap(col => col.cards).find(c => c.id === cardId);
    setActiveCard(card || null);
    setIsDraggingActive(true);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Only for visual feedback of dnd-kit, no state modifications here
  }, []);

  const handleDragEnd = useCallback(async (
    event: DragEndEvent,
    columns: Column[],
    boardId: string | null,
    organizationId: string
  ) => {
    const { active, over } = event;
    setActiveCard(null);
    setIsDraggingActive(false);

    if (!over) return;

    const activeCardId = active.id as string;
    const overContainerId = over.id as string;

    const sourceColumn = columns.find(col => col.cards.some(card => card.id === activeCardId));
    if (!sourceColumn) return;

    let targetColumn = columns.find(col => col.id === overContainerId);
    if (!targetColumn) {
      targetColumn = columns.find(col => col.cards.some(card => card.id === overContainerId));
    }

    if (!targetColumn) return;

    const card = sourceColumn.cards.find(c => c.id === activeCardId);
    if (!card) return;

    logger.log("DragEnd - Card Info:", {
      cardId: activeCardId,
      is_collaborative: card.is_collaborative,
      requires_all_approval: card.requires_all_approval,
      sourceColumn: sourceColumn.title,
      targetColumn: targetColumn.title,
    });

    // Check for collaborative task with approval requirement
    if (sourceColumn.id !== targetColumn.id && card.is_collaborative && card.requires_all_approval) {
      logger.log("DragEnd - Validating collaborative task...");

      const { data: assignees, error } = await supabase
        .from("kanban_card_assignees")
        .select("is_completed, user_id")
        .eq("card_id", activeCardId);

      logger.log("DragEnd - Assignees:", { assignees, error });

      if (error) {
        logger.error("Error fetching assignees:", error);
        toast({
          title: "Erro",
          description: "N\u00e3o foi poss\u00edvel validar a tarefa colaborativa.",
          variant: "destructive",
        });
        await loadColumns(boardId || "");
        return;
      }

      if (assignees && assignees.length > 0) {
        const allCompleted = assignees.every(a => a.is_completed);
        logger.log("DragEnd - All completed?", allCompleted);

        if (!allCompleted) {
          const completedCount = assignees.filter(a => a.is_completed).length;

          const pendingIds = assignees.filter(a => !a.is_completed).map(a => a.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("full_name")
            .in("user_id", pendingIds);

          const pendingNames = profiles?.map(p => p.full_name).join(", ") || "colaboradores";

          logger.log("DragEnd - BLOCKING movement. Pending:", pendingNames);

          toast({
            title: "Movimenta\u00e7\u00e3o Bloqueada",
            description: `Tarefa colaborativa requer aprova\u00e7\u00e3o de todos. Faltam: ${pendingNames} (${completedCount}/${assignees.length} confirmaram)`,
            variant: "destructive",
            duration: 5000,
          });

          await loadColumns(boardId || "");
          return;
        }
      } else {
        logger.log("DragEnd - Collaborative task without assignees");
      }
    }

    // Check for backward movement block
    if (sourceColumn.id !== targetColumn.id && sourceColumn.block_backward_movement) {
      const sourcePos = columns.findIndex(c => c.id === sourceColumn.id);
      const targetPos = columns.findIndex(c => c.id === targetColumn.id);

      if (targetPos < sourcePos) {
        toast({
          title: "Movimento Bloqueado",
          description: `Tarefas n\u00e3o podem voltar da etapa "${sourceColumn.title}" para etapas anteriores.`,
          variant: "destructive",
        });
        await loadColumns(boardId || "");
        return;
      }
    }

    // Update in database if moved to different column
    if (sourceColumn.id !== targetColumn.id) {
      const updateData: any = { column_id: targetColumn.id };

      const shouldStartTimer =
        card.timer_start_column_id === targetColumn.id &&
        !card.timer_started_at &&
        card.estimated_time &&
        !card.due_date;

      if (shouldStartTimer) {
        updateData.timer_started_at = new Date().toISOString();
        toast({
          title: "Cron\u00f4metro Iniciado",
          description: `Timer da tarefa "${card.content}" come\u00e7ou a contar!`,
        });
      }

      await supabase
        .from("kanban_cards")
        .update(updateData)
        .eq("id", activeCardId);

      const newTimerStartedAt = updateData.timer_started_at ?? card.timer_started_at;

      setColumns(prevColumns => prevColumns.map(col => {
        if (col.id === sourceColumn.id) {
          return { ...col, cards: col.cards.filter(c => c.id !== activeCardId) };
        }
        if (col.id === targetColumn.id) {
          const updatedCard: Card = {
            ...card,
            column_id: targetColumn.id,
            timer_started_at: newTimerStartedAt,
          };
          return { ...col, cards: [...col.cards, updatedCard] };
        }
        return col;
      }));

      // Score registration when entering completion stage
      if (targetColumn.is_completion_stage && !sourceColumn.is_completion_stage && organizationId) {
        const now = new Date();

        const hadDueDate = !!card.due_date;
        const wasOnTimeDueDate = hadDueDate && new Date(card.due_date) >= now;

        const hadTimer = !!(card.estimated_time && card.timer_started_at && !card.due_date);
        let wasOnTimeTimer = false;

        if (hadTimer && card.timer_started_at && card.estimated_time) {
          const timerStart = new Date(card.timer_started_at);
          const elapsedMinutes = Math.floor((now.getTime() - timerStart.getTime()) / 60000);
          wasOnTimeTimer = elapsedMinutes <= card.estimated_time;
        }

        const { data: cardAssignees } = await supabase
          .from("kanban_card_assignees")
          .select("user_id")
          .eq("card_id", card.id);

        const usersToScore = cardAssignees && cardAssignees.length > 0
          ? cardAssignees
          : [{ user_id: card.created_by }];

        for (const assignee of usersToScore) {
          await supabase.from("task_completion_logs").upsert({
            organization_id: organizationId,
            card_id: card.id,
            user_id: assignee.user_id,
            had_due_date: hadDueDate,
            was_on_time_due_date: wasOnTimeDueDate,
            had_timer: hadTimer,
            was_on_time_timer: wasOnTimeTimer,
            base_points: 2,
            bonus_due_date: wasOnTimeDueDate ? 1 : 0,
            bonus_timer: wasOnTimeTimer ? 3 : 0,
          }, { onConflict: 'card_id,user_id' });
        }

        logger.log("Pontua\u00e7\u00e3o registrada:", {
          card: card.content,
          users: usersToScore.length,
          hadTimer,
          wasOnTimeTimer,
          hadDueDate,
          wasOnTimeDueDate,
        });
      }
    }

    // Reordering within same column
    if (sourceColumn.id === targetColumn.id && activeCardId !== overContainerId) {
      const oldIndex = sourceColumn.cards.findIndex(c => c.id === activeCardId);
      const newIndex = sourceColumn.cards.findIndex(c => c.id === overContainerId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newCards = [...sourceColumn.cards];
        const [removed] = newCards.splice(oldIndex, 1);
        newCards.splice(newIndex, 0, removed);

        setColumns(prev => prev.map(col =>
          col.id === sourceColumn.id ? { ...col, cards: newCards } : col
        ));

        await Promise.all(
          newCards.map((card, index) =>
            supabase.from("kanban_cards").update({ position: index }).eq("id", card.id)
          )
        );
      }
    }
  }, [setColumns, loadColumns, toast]);

  return {
    activeCard,
    isDraggingActive,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
