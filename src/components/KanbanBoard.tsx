import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Clock, CalendarCheck, User, Users } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { LoadingAnimation } from "./LoadingAnimation";
import { CreateTaskEventModal } from "./CreateTaskEventModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { format } from "date-fns";

import { useKanbanPermissions } from "@/hooks/useKanbanPermissions";
import { useKanbanBoard, Card } from "@/hooks/useKanbanBoard";
import { useKanbanCards } from "@/hooks/useKanbanCards";
import { useKanbanDrag } from "@/hooks/useKanbanDrag";
import { supabase } from "@/integrations/supabase/client";

interface KanbanBoardProps {
  organizationId: string;
}

export const KanbanBoard = ({ organizationId }: KanbanBoardProps) => {
  // Permissions
  const {
    isOwnerOrAdmin,
    canCreateTasks,
    canEditOwnTasks,
    canEditAllTasks,
    canDeleteTasks,
  } = useKanbanPermissions();

  // Board state and operations
  const {
    boardId,
    columns,
    setColumns,
    loading,
    boardNotFound,
    orgMembers,
    cardAssigneesMap,
    setCardAssigneesMap,
    loadColumns,
    addColumn,
    updateColumnTitle,
    deleteColumn,
  } = useKanbanBoard(organizationId, isOwnerOrAdmin);

  // Card CRUD operations
  const {
    handleTaskCreated: createTask,
    updateCard: editCard,
    deleteCard: removeCard,
    handleEventCreated: eventCreated,
  } = useKanbanCards(setColumns, setCardAssigneesMap);

  // Drag and drop
  const {
    activeCard,
    isDraggingActive,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd: dragEnd,
  } = useKanbanDrag(setColumns, loadColumns);

  // Local UI state
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [selectedCardForCalendar, setSelectedCardForCalendar] = useState<Card | null>(null);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [selectedColumnForTask, setSelectedColumnForTask] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Open create task modal
  const openCreateTaskModal = (columnId: string) => {
    setSelectedColumnForTask(columnId);
    setCreateTaskModalOpen(true);
  };

  // Handle task created wrapper
  const handleTaskCreated = async (task: Parameters<typeof createTask>[0]) => {
    if (!selectedColumnForTask) return;
    await createTask(task, selectedColumnForTask, columns, currentUserId);
    setSelectedColumnForTask(null);
  };

  // Handle card update wrapper
  const handleUpdateCard = async (
    columnId: string,
    cardId: string,
    updates: Parameters<typeof editCard>[2],
    oldDescription?: string
  ) => {
    await editCard(columnId, cardId, updates, columns, currentUserId, oldDescription);
  };

  // Handle card delete wrapper
  const handleDeleteCard = async (columnId: string, cardId: string) => {
    await removeCard(columnId, cardId, columns);
  };

  // Handle calendar sync
  const handleSyncCalendar = (card: Card) => {
    setSelectedCardForCalendar(card);
    setCalendarModalOpen(true);
  };

  // Handle event created wrapper
  const handleEventCreated = (cardId: string, eventId: string, eventLink: string) => {
    eventCreated(cardId, eventId, eventLink, columns);
  };

  // Handle drag end wrapper
  const handleDragEnd = async (event: Parameters<typeof dragEnd>[0]) => {
    await dragEnd(event, columns, boardId, organizationId);
  };

  // Handle drag start with columns
  const onDragStart = (event: Parameters<typeof handleDragStart>[0]) => {
    handleDragStart(event, columns);
  };

  if (loading) {
    return <LoadingAnimation text="Carregando quadro Kanban..." />;
  }

  // Board not found - show friendly message for members
  if (boardNotFound) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <div className="p-4 bg-muted rounded-full mb-4">
          <CalendarCheck className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Quadro nao encontrado</h2>
        <p className="text-muted-foreground max-w-md mb-4">
          O quadro de tarefas ainda nao foi criado para esta organizacao.
          Peca ao administrador para acessar a secao de Tarefas e criar o quadro.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>Aguardando criacao pelo administrador</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-full overflow-hidden"
      data-dragging-active={isDraggingActive}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-4 overflow-x-auto overflow-y-hidden min-h-[calc(100vh-200px)]">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              currentUserId={currentUserId}
              cardAssigneesMap={cardAssigneesMap}
              onUpdateTitle={updateColumnTitle}
              onDelete={deleteColumn}
              onAddCard={openCreateTaskModal}
              onEditCard={handleUpdateCard}
              onDeleteCard={handleDeleteCard}
              onSyncCalendar={handleSyncCalendar}
              isDraggingActive={isDraggingActive}
              onSettingsUpdated={() => loadColumns(boardId || "")}
              canCreateTasks={canCreateTasks}
              canEditOwnTasks={canEditOwnTasks}
              canEditAllTasks={canEditAllTasks}
              canDeleteTasks={canDeleteTasks}
              isOwnerOrAdmin={isOwnerOrAdmin}
              orgMembers={orgMembers}
              boardId={boardId || undefined}
              kanbanColumns={columns.map(c => ({ id: c.id, title: c.title }))}
              onCardMoved={() => loadColumns(boardId || "")}
            />
          ))}

          {isOwnerOrAdmin && (
            <Button
              variant="outline"
              className="flex-shrink-0 w-60 sm:w-80 h-auto py-8"
              onClick={addColumn}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Coluna
            </Button>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className={`bg-card border rounded-lg p-3 shadow-lg opacity-90 w-60 sm:w-80 ${
              activeCard.is_collaborative ? "ring-2 ring-primary" : ""
            }`}>
              <div className="space-y-2">
                {activeCard.is_collaborative && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                    <Users className="h-3 w-3" />
                    <span>Tarefa Colaborativa - Requer aprovacao de todos</span>
                  </div>
                )}

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
