import { useState, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Clock, CalendarCheck, User } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "./LoadingAnimation";
import { CreateTaskEventModal } from "./CreateTaskEventModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { format } from "date-fns";

interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email?: string;
}

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
  column_id: string;
  created_at: string;
  timer_started_at?: string;
  calendar_event_id?: string;
  calendar_event_link?: string;
  lead_id?: string;
  lead?: Lead;
  is_collaborative?: boolean;
  requires_all_approval?: boolean;
}

interface Column {
  id: string;
  title: string;
  position: number;
  cards: Card[];
}

interface KanbanBoardProps {
  organizationId: string;
}

export const KanbanBoard = ({ organizationId }: KanbanBoardProps) => {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [selectedCardForCalendar, setSelectedCardForCalendar] = useState<Card | null>(null);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [selectedColumnForTask, setSelectedColumnForTask] = useState<string | null>(null);
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    loadOrCreateBoard();
  }, [organizationId]);

  const loadOrCreateBoard = async () => {
    try {
      // Buscar board existente
      const { data: existingBoard } = await supabase
        .from("kanban_boards")
        .select("id")
        .eq("organization_id", organizationId)
        .single();

      let currentBoardId = existingBoard?.id;

      if (!currentBoardId) {
        // Criar novo board com colunas padrão
        const { data: newBoard } = await supabase
          .from("kanban_boards")
          .insert({ organization_id: organizationId })
          .select()
          .single();

        currentBoardId = newBoard?.id;

        if (currentBoardId) {
          await supabase.from("kanban_columns").insert([
            { board_id: currentBoardId, title: "A Fazer", position: 0 },
            { board_id: currentBoardId, title: "Em Progresso", position: 1 },
            { board_id: currentBoardId, title: "Concluído", position: 2 },
          ]);
        }
      }

      setBoardId(currentBoardId || null);
      await loadColumns(currentBoardId || "");
    } catch (error) {
      console.error("Erro ao carregar board:", error);
      toast({ title: "Erro ao carregar quadro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadColumns = async (boardId: string) => {
    const { data: columnsData } = await supabase
      .from("kanban_columns")
      .select("*")
      .eq("board_id", boardId)
      .order("position");

    const { data: cardsData } = await supabase
      .from("kanban_cards")
      .select("*, leads:lead_id(id, nome_lead, telefone_lead, email)")
      .in("column_id", columnsData?.map(c => c.id) || [])
      .order("position");

    const columnsWithCards = columnsData?.map(col => ({
      ...col,
      cards: cardsData?.filter(card => card.column_id === col.id).map(card => ({
        ...card,
        lead: card.leads || undefined,
      })) || []
    })) || [];

    setColumns(columnsWithCards);
  };

  const addColumn = async () => {
    if (!boardId) return;

    const newPosition = columns.length;
    const { data } = await supabase
      .from("kanban_columns")
      .insert({ board_id: boardId, title: "Nova Coluna", position: newPosition })
      .select()
      .single();

    if (data) {
      setColumns([...columns, { ...data, cards: [] }]);
    }
  };

  const updateColumnTitle = async (columnId: string, title: string) => {
    await supabase
      .from("kanban_columns")
      .update({ title })
      .eq("id", columnId);

    setColumns(columns.map(col => col.id === columnId ? { ...col, title } : col));
  };

  const deleteColumn = async (columnId: string) => {
    await supabase.from("kanban_columns").delete().eq("id", columnId);
    setColumns(columns.filter(col => col.id !== columnId));
  };

  const openCreateTaskModal = (columnId: string) => {
    setSelectedColumnForTask(columnId);
    setCreateTaskModalOpen(true);
  };

  const handleTaskCreated = async (task: {
    content: string;
    description?: string;
    due_date?: string;
    estimated_time?: number;
    lead_id?: string;
    lead?: Lead;
    assignees?: string[];
    is_collaborative?: boolean;
    requires_all_approval?: boolean;
  }) => {
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
    };

    if (task.lead_id) {
      insertData.lead_id = task.lead_id;
    }

    // Set timer_started_at if estimated_time but no due_date
    if (task.estimated_time && !task.due_date) {
      insertData.timer_started_at = new Date().toISOString();
    }

    const { data } = await supabase
      .from("kanban_cards")
      .insert(insertData)
      .select("*, leads:lead_id(id, nome_lead, telefone_lead, email)")
      .single();

    if (data) {
      // Salvar assignees se houver
      if (task.assignees && task.assignees.length > 0) {
        await supabase.from("kanban_card_assignees").insert(
          task.assignees.map((userId) => ({
            card_id: data.id,
            user_id: userId,
            assigned_by: user.id,
          }))
        );

        // Criar notificações para os atribuídos
        for (const assigneeId of task.assignees) {
          if (assigneeId !== user.id) {
            await supabase.from("notifications").insert({
              user_id: assigneeId,
              type: "task_assigned",
              title: "Tarefa atribuída",
              message: `Você foi atribuído à tarefa "${task.content}"`,
              card_id: data.id,
              due_date: task.due_date || null,
              time_estimate: task.estimated_time || null,
            });
          }
        }
      }

      const newCard: Card = {
        ...data,
        lead: data.leads || task.lead,
        is_collaborative: task.is_collaborative,
        requires_all_approval: task.requires_all_approval,
      };

      setColumns(columns.map(col =>
        col.id === selectedColumnForTask ? { ...col, cards: [...col.cards, newCard] } : col
      ));
    }

    setSelectedColumnForTask(null);
  };

  const detectMentions = (text: string): string[] => {
    const mentionRegex = /@([A-Za-zÀ-ÿ\s]+?)(?=\s|$|@)/g;
    const matches = text.matchAll(mentionRegex);
    const mentions: string[] = [];

    for (const match of matches) {
      if (match[1]) {
        mentions.push(match[1].trim());
      }
    }

    return mentions;
  };

  const createNotificationsForMentions = async (
    newDescription: string,
    oldDescription: string,
    card: Card
  ) => {
    const newMentions = detectMentions(newDescription);
    const oldMentions = detectMentions(oldDescription);
    const addedMentions = newMentions.filter(m => !oldMentions.includes(m));

    if (addedMentions.length === 0) return;

    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name");

      for (const mentionName of addedMentions) {
        const matchedProfile = profiles?.find(
          (p) => p.full_name.toLowerCase() === mentionName.toLowerCase()
        );

        if (matchedProfile) {
          await supabase.from("notifications").insert({
            user_id: matchedProfile.user_id,
            type: "task_mention",
            title: "Mencionado em tarefa",
            message: `Você foi mencionado na tarefa "${card.content}"`,
            card_id: card.id,
            due_date: card.due_date || null,
            time_estimate: card.estimated_time || null,
          });
        }
      }
    } catch (error) {
      console.error("Erro ao criar notificações:", error);
    }
  };

  const updateCard = async (
    columnId: string,
    cardId: string,
    updates: Partial<Card>,
    oldDescription?: string
  ) => {
    // Garantir que campos vazios sejam null e valores sejam salvos corretamente
    const dbUpdates: any = {
      content: updates.content,
      description: updates.description || null,
      due_date: updates.due_date || null,
      estimated_time: updates.estimated_time ?? null,
    };

    // Gerenciar timer_started_at baseado em estimated_time e due_date
    if (updates.estimated_time !== undefined) {
      if (updates.estimated_time && !updates.due_date) {
        // Timer ativo: definir timer_started_at para agora
        dbUpdates.timer_started_at = new Date().toISOString();
      } else {
        // Timer não ativo: limpar timer_started_at
        dbUpdates.timer_started_at = null;
      }
    }

    // Remover campos undefined do objeto
    Object.keys(dbUpdates).forEach(key => {
      if (dbUpdates[key] === undefined) {
        delete dbUpdates[key];
      }
    });

    await supabase
      .from("kanban_cards")
      .update(dbUpdates)
      .eq("id", cardId);

    const column = columns.find(col => col.id === columnId);
    const card = column?.cards.find(c => c.id === cardId);

    if (card && updates.description && updates.description !== oldDescription) {
      createNotificationsForMentions(
        updates.description,
        oldDescription || "",
        { ...card, ...updates }
      );
    }

    setColumns(columns.map(col =>
      col.id === columnId
        ? { ...col, cards: col.cards.map(c => c.id === cardId ? { ...c, ...updates } : c) }
        : col
    ));
  };

  const deleteCard = async (columnId: string, cardId: string) => {
    await supabase.from("kanban_cards").delete().eq("id", cardId);
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col
    ));
  };

  const handleSyncCalendar = (card: Card) => {
    setSelectedCardForCalendar(card);
    setCalendarModalOpen(true);
  };

  const handleEventCreated = (cardId: string, eventId: string, eventLink: string) => {
    setColumns(columns.map(col => ({
      ...col,
      cards: col.cards.map(c => 
        c.id === cardId 
          ? { ...c, calendar_event_id: eventId, calendar_event_link: eventLink } 
          : c
      )
    })));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = event.active.id as string;
    const card = columns.flatMap(col => col.cards).find(c => c.id === cardId);
    setActiveCard(card || null);
    setIsDraggingActive(true);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeCardId = active.id as string;
    const overContainerId = over.id as string;

    const sourceColumn = columns.find(col => col.cards.some(card => card.id === activeCardId));
    if (!sourceColumn) return;

    let targetColumn = columns.find(col => col.id === overContainerId);
    if (!targetColumn) {
      targetColumn = columns.find(col => col.cards.some(card => card.id === overContainerId));
    }

    if (!targetColumn || sourceColumn.id === targetColumn.id) return;

    const card = sourceColumn.cards.find(c => c.id === activeCardId);
    if (!card) return;

    const newColumns = columns.map(col => {
      if (col.id === sourceColumn.id) {
        return { ...col, cards: col.cards.filter(c => c.id !== activeCardId) };
      }
      if (col.id === targetColumn.id) {
        return { ...col, cards: [...col.cards, card] };
      }
      return col;
    });

    setColumns(newColumns);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
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

    // Verificar se é tarefa colaborativa e está mudando de coluna
    if (sourceColumn.id !== targetColumn.id && card.is_collaborative && card.requires_all_approval) {
      // Buscar status dos colaboradores
      const { data: assignees } = await supabase
        .from("kanban_card_assignees")
        .select("is_completed")
        .eq("card_id", activeCardId);

      if (assignees && assignees.length > 0) {
        const allCompleted = assignees.every(a => a.is_completed);

        if (!allCompleted) {
          const completedCount = assignees.filter(a => a.is_completed).length;
          toast({
            title: "Movimentação bloqueada",
            description: `Todos os colaboradores devem confirmar a conclusão antes de mover. (${completedCount}/${assignees.length} confirmaram)`,
            variant: "destructive",
          });
          // Recarregar para reverter visualmente
          await loadColumns(boardId || "");
          return;
        }
      }
    }

    // Atualizar no banco se mudou de coluna
    if (sourceColumn.id !== targetColumn.id) {
      await supabase
        .from("kanban_cards")
        .update({ column_id: targetColumn.id })
        .eq("id", activeCardId);
    }

    // Reordenação dentro da mesma coluna
    if (sourceColumn.id === targetColumn.id && activeCardId !== overContainerId) {
      const oldIndex = sourceColumn.cards.findIndex(c => c.id === activeCardId);
      const newIndex = sourceColumn.cards.findIndex(c => c.id === overContainerId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newCards = [...sourceColumn.cards];
        const [removed] = newCards.splice(oldIndex, 1);
        newCards.splice(newIndex, 0, removed);

        setColumns(columns.map(col =>
          col.id === sourceColumn.id ? { ...col, cards: newCards } : col
        ));

        // Atualizar posições no banco
        await Promise.all(
          newCards.map((card, index) =>
            supabase.from("kanban_cards").update({ position: index }).eq("id", card.id)
          )
        );
      }
    }
  };

  if (loading) {
    return <LoadingAnimation text="Carregando quadro Kanban..." />;
  }

  return (
    <div
      className="w-full max-w-full overflow-hidden"
      data-dragging-active={isDraggingActive}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-4 overflow-x-auto overflow-y-hidden min-h-[calc(100vh-200px)]">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onUpdateTitle={updateColumnTitle}
              onDelete={deleteColumn}
              onAddCard={openCreateTaskModal}
              onEditCard={updateCard}
              onDeleteCard={deleteCard}
              onSyncCalendar={handleSyncCalendar}
              isDraggingActive={isDraggingActive}
            />
          ))}

          <Button
            variant="outline"
            className="flex-shrink-0 w-80 h-auto py-8"
            onClick={addColumn}
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Coluna
          </Button>
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="bg-card border rounded-lg p-3 shadow-lg opacity-90 w-80">
              <div className="space-y-2">
                <div className="font-medium">{activeCard.content}</div>
                
                {activeCard.description && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-2">
                    {activeCard.description}
                  </div>
                )}

                {(activeCard.due_date || activeCard.estimated_time) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {activeCard.due_date && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(activeCard.due_date), "dd/MM/yyyy")}
                      </div>
                    )}
                    {activeCard.estimated_time && (
                      <div className={`flex items-center gap-1 px-2 py-1 rounded ${
                        !activeCard.due_date 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted"
                      }`}>
                        <Clock className="h-3 w-3" />
                        {Math.floor(activeCard.estimated_time / 60) > 0 
                          ? `${Math.floor(activeCard.estimated_time / 60)}h${activeCard.estimated_time % 60 > 0 ? ` ${activeCard.estimated_time % 60}m` : ""}`
                          : `${activeCard.estimated_time}m`
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedCardForCalendar && (
        <CreateTaskEventModal
          open={calendarModalOpen}
          onOpenChange={setCalendarModalOpen}
          card={selectedCardForCalendar}
          onEventCreated={handleEventCreated}
        />
      )}

      {selectedColumnForTask && (
        <CreateTaskModal
          open={createTaskModalOpen}
          onOpenChange={setCreateTaskModalOpen}
          columnId={selectedColumnForTask}
          onTaskCreated={handleTaskCreated}
        />
      )}
    </div>
  );
};
