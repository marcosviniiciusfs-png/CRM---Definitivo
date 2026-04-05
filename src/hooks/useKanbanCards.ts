import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { Column, Card } from "./useKanbanBoard";

interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email?: string;
}

interface CreateTaskInput {
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  lead_id?: string;
  lead?: Lead;
  assignees?: string[];
  is_collaborative?: boolean;
  requires_all_approval?: boolean;
  timer_start_column_id?: string | null;
  color?: string | null;
}

interface UseKanbanCardsReturn {
  handleTaskCreated: (task: CreateTaskInput, selectedColumnForTask: string, columns: Column[], currentUserId: string | null) => Promise<void>;
  updateCard: (columnId: string, cardId: string, updates: Partial<Card> & { assignees?: string[] }, columns: Column[], currentUserId: string | null, oldDescription?: string) => Promise<void>;
  deleteCard: (columnId: string, cardId: string, columns: Column[]) => Promise<Column[]>;
  handleEventCreated: (cardId: string, eventId: string, eventLink: string, columns: Column[]) => Column[];
}

export function useKanbanCards(
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>,
  setCardAssigneesMap: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
): UseKanbanCardsReturn {
  const { toast } = useToast();

  // Detect mentions in text
  const detectMentions = useCallback((text: string): string[] => {
    const mentionRegex = /@([A-Za-z\u00c0-\u00ff\s]+?)(?=\s|$|@)/g;
    const matches = text.matchAll(mentionRegex);
    const mentions: string[] = [];

    for (const match of matches) {
      if (match[1]) {
        mentions.push(match[1].trim());
      }
    }

    return mentions;
  }, []);

  // Create notifications for mentions
  const createNotificationsForMentions = useCallback(
    async (newDescription: string, oldDescription: string, card: Card) => {
      const newMentions = detectMentions(newDescription);
      const oldMentions = detectMentions(oldDescription);
      const addedMentions = newMentions.filter(m => !oldMentions.includes(m));

      if (addedMentions.length === 0) return;

      logger.log("[KANBAN] Men\u00e7\u00f5es detectadas (notifica\u00e7\u00e3o pendente de implementa\u00e7\u00e3o):", addedMentions);
    },
    [detectMentions]
  );

  // Sync card assignees in database
  const syncCardAssignees = useCallback(async (
    cardId: string,
    newAssignees: string[],
    cardTitle: string,
    currentUserId: string | null
  ) => {
    try {
      const { data: currentAssignees } = await supabase
        .from("kanban_card_assignees")
        .select("id, user_id, is_completed")
        .eq("card_id", cardId);

      const currentIds = currentAssignees?.map(a => a.user_id) || [];

      const toAdd = newAssignees.filter(id => !currentIds.includes(id));
      const toRemove = currentAssignees?.filter(a =>
        !newAssignees.includes(a.user_id) && !a.is_completed
      ) || [];

      if (toAdd.length > 0) {
        await supabase.from("kanban_card_assignees").insert(
          toAdd.map(userId => ({
            card_id: cardId,
            user_id: userId,
            assigned_by: currentUserId,
          }))
        );

        for (const userId of toAdd) {
          if (userId !== currentUserId) {
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "task_assigned",
              title: "Tarefa atribu\u00edda",
              message: `Voc\u00ea foi atribu\u00eddo \u00e0 tarefa "${cardTitle}"`,
              card_id: cardId,
            });
          }
        }
      }

      if (toRemove.length > 0) {
        await supabase.from("kanban_card_assignees")
          .delete()
          .in("id", toRemove.map(a => a.id));
      }

      logger.log('[KANBAN] Assignees sincronizados:', {
        cardId,
        added: toAdd,
        removed: toRemove.map(a => a.user_id),
      });
    } catch (error) {
      logger.error('[KANBAN] Erro ao sincronizar assignees:', error);
      toast({
        title: "Erro",
        description: "N\u00e3o foi poss\u00edvel atualizar os respons\u00e1veis.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle task creation
  const handleTaskCreated = useCallback(async (
    task: CreateTaskInput,
    selectedColumnForTask: string,
    columns: Column[],
    currentUserId: string | null
  ) => {
    if (!selectedColumnForTask) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const column = columns.find(c => c.id === selectedColumnForTask);
    const newPosition = column?.cards.length || 0;

    const insertData: any = {
      column_id: selectedColumnForTask,
      content: task.content,
      description: task.description || null,
      due_date: task.due_date || null,
      estimated_time: task.estimated_time || null,
      position: newPosition,
      created_by: user.id,
      is_collaborative: task.is_collaborative || false,
      requires_all_approval: task.requires_all_approval ?? true,
      timer_start_column_id: task.timer_start_column_id || null,
      color: task.color || null,
    };

    if (task.lead_id) {
      insertData.lead_id = task.lead_id;
    }

    // Set timer_started_at based on timer_start_column_id
    if (task.estimated_time && !task.due_date) {
      if (!task.timer_start_column_id || task.timer_start_column_id === selectedColumnForTask) {
        insertData.timer_started_at = new Date().toISOString();
      } else {
        insertData.timer_started_at = null;
      }
    }

    const { data, error: insertError } = await supabase
      .from("kanban_cards")
      .insert(insertData)
      .select("*, leads:lead_id(id, nome_lead, telefone_lead, email)")
      .single();

    if (insertError) {
      logger.error("Erro ao criar tarefa:", insertError);
      toast({
        title: "Erro ao criar tarefa",
        description: "N\u00e3o foi poss\u00edvel criar a tarefa. Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    if (data) {
      if (task.assignees && task.assignees.length > 0) {
        const { error: assigneeError } = await supabase.from("kanban_card_assignees").insert(
          task.assignees.map((userId) => ({
            card_id: data.id,
            user_id: userId,
            assigned_by: user.id,
          }))
        );
        if (assigneeError) {
          logger.error("Erro ao atribuir respons\u00e1veis:", assigneeError);
        }
      }

      const newCard: Card = {
        ...data,
        lead: data.leads || task.lead,
        is_collaborative: task.is_collaborative,
        requires_all_approval: task.requires_all_approval,
        color: task.color,
      };

      setColumns(prev => prev.map(col =>
        col.id === selectedColumnForTask ? { ...col, cards: [...col.cards, newCard] } : col
      ));
    }
  }, [setColumns, toast]);

  // Update card
  const updateCard = useCallback(async (
    columnId: string,
    cardId: string,
    updates: Partial<Card> & { assignees?: string[] },
    columns: Column[],
    currentUserId: string | null,
    oldDescription?: string
  ) => {
    const { assignees, timer_start_column_id, ...cardUpdates } = updates as any;

    const dbUpdates: any = {
      content: cardUpdates.content,
      description: cardUpdates.description || null,
      due_date: cardUpdates.due_date || null,
      estimated_time: cardUpdates.estimated_time ?? null,
      color: cardUpdates.color !== undefined ? (cardUpdates.color || null) : undefined,
    };

    if (timer_start_column_id !== undefined) {
      dbUpdates.timer_start_column_id = timer_start_column_id;
    }

    // Manage timer_started_at based on estimated_time, due_date and timer_start_column_id
    if (cardUpdates.estimated_time !== undefined) {
      if (cardUpdates.estimated_time && !cardUpdates.due_date) {
        if (timer_start_column_id !== undefined) {
          if (timer_start_column_id === columnId) {
            dbUpdates.timer_started_at = new Date().toISOString();
          } else if (timer_start_column_id === null) {
            dbUpdates.timer_started_at = new Date().toISOString();
          } else {
            dbUpdates.timer_started_at = null;
          }
        } else {
          dbUpdates.timer_started_at = new Date().toISOString();
        }
      } else {
        dbUpdates.timer_started_at = null;
      }
    }

    // Remove undefined fields
    Object.keys(dbUpdates).forEach(key => {
      if (dbUpdates[key] === undefined) {
        delete dbUpdates[key];
      }
    });

    await supabase
      .from("kanban_cards")
      .update(dbUpdates)
      .eq("id", cardId);

    // Sync assignees if changed
    if (assignees !== undefined) {
      await syncCardAssignees(cardId, assignees, cardUpdates.content || '', currentUserId);
    }

    const column = columns.find(col => col.id === columnId);
    const card = column?.cards.find(c => c.id === cardId);

    if (card && cardUpdates.description && cardUpdates.description !== oldDescription) {
      createNotificationsForMentions(
        cardUpdates.description,
        oldDescription || "",
        { ...card, ...cardUpdates }
      );
    }

    setColumns(prev => prev.map(col =>
      col.id === columnId
        ? { ...col, cards: col.cards.map(c => c.id === cardId ? { ...c, ...cardUpdates } : c) }
        : col
    ));

    if (assignees !== undefined) {
      setCardAssigneesMap(prev => ({ ...prev, [cardId]: assignees }));
    }
  }, [setColumns, setCardAssigneesMap, syncCardAssignees, createNotificationsForMentions]);

  // Delete card
  const deleteCard = useCallback(async (columnId: string, cardId: string, columns: Column[]): Promise<Column[]> => {
    await supabase.from("kanban_cards").delete().eq("id", cardId);

    const newColumns = columns.map(col =>
      col.id === columnId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col
    );

    setColumns(newColumns);
    return newColumns;
  }, [setColumns]);

  // Handle calendar event created
  const handleEventCreated = useCallback((cardId: string, eventId: string, eventLink: string, columns: Column[]): Column[] => {
    const newColumns = columns.map(col => ({
      ...col,
      cards: col.cards.map(c =>
        c.id === cardId
          ? { ...c, calendar_event_id: eventId, calendar_event_link: eventLink }
          : c
      )
    }));

    setColumns(newColumns);
    return newColumns;
  }, [setColumns]);

  return {
    handleTaskCreated,
    updateCard,
    deleteCard,
    handleEventCreated,
  };
}
