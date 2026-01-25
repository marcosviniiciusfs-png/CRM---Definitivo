import { useState, useEffect, useRef } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Settings, ChevronDown, User } from "lucide-react";
import { KanbanCard } from "./KanbanCard";
import { StageSettingsModal } from "./StageSettingsModal";

interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead?: string;
  email?: string;
}

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
  created_at: string;
  timer_started_at?: string;
  calendar_event_id?: string;
  calendar_event_link?: string;
  lead_id?: string;
  lead?: Lead;
  color?: string | null;
}

interface Column {
  id: string;
  title: string;
  cards: Card[];
  is_completion_stage?: boolean;
  block_backward_movement?: boolean;
  auto_delete_enabled?: boolean;
  auto_delete_hours?: number | null;
  stage_color?: string | null;
}

interface KanbanColumnProps {
  column: Column;
  currentUserId?: string | null;
  cardAssigneesMap?: Record<string, string[]>;
  onUpdateTitle: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string) => void;
  onEditCard: (
    columnId: string,
    cardId: string,
    updates: Partial<Card>,
    oldDescription?: string
  ) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onSyncCalendar?: (card: Card) => void;
  isDraggingActive: boolean;
  onSettingsUpdated?: () => void;
}

export const KanbanColumn = ({
  column,
  currentUserId,
  cardAssigneesMap,
  onUpdateTitle,
  onDelete,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onSyncCalendar,
  isDraggingActive,
  onSettingsUpdated,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  // Local state for instant typing feedback
  const [localTitle, setLocalTitle] = useState(column.title);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local state when column prop changes (e.g., from external update)
  useEffect(() => {
    setLocalTitle(column.title);
  }, [column.title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setLocalTitle(newTitle);

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the database update by 500ms
    debounceRef.current = setTimeout(() => {
      onUpdateTitle(column.id, newTitle);
    }, 500);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="flex-shrink-0 w-80 bg-background rounded-lg p-4 shadow-md border flex flex-col max-h-[calc(100vh-200px)]"
      style={{
        borderTopColor: column.stage_color || undefined,
        borderTopWidth: column.stage_color ? "3px" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-2 gap-1 flex-shrink-0">
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          className="font-semibold border-none focus-visible:ring-0 px-0 h-auto flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className="h-6 w-6 p-0"
          title="Configurações da etapa"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(column.id)}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Task counter indicator */}
      <div className="flex flex-col items-center gap-0.5 mb-2 flex-shrink-0">
        {/* Total de tarefas - amarelo */}
        <div className="flex items-center justify-center gap-1.5 py-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
          <span>{column.cards.length} tarefa{column.cards.length !== 1 ? 's' : ''}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </div>
        
        {/* Tarefas do usuário - azul */}
        {currentUserId && (() => {
          const myTasksCount = column.cards.filter(card => 
            cardAssigneesMap?.[card.id]?.includes(currentUserId)
          ).length;
          
          return myTasksCount > 0 ? (
            <div className="flex items-center justify-center gap-1.5 py-1 text-blue-600 dark:text-blue-400 text-xs font-medium">
              <User className="h-3 w-3" />
              <span>{myTasksCount} sua{myTasksCount !== 1 ? 's' : ''}</span>
            </div>
          ) : null;
        })()}
      </div>

      <div
        ref={setNodeRef}
        className={`kanban-column space-y-2 min-h-[100px] flex-1 overflow-y-auto scrollbar-subtle pr-1 ${
          !isDraggingActive ? "transition-colors" : ""
        } ${isOver ? "bg-accent/30" : ""}`}
      >
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={(id, updates, oldDesc) =>
                onEditCard(column.id, id, updates, oldDesc)
              }
              onDelete={(id) => onDeleteCard(column.id, id)}
              onSyncCalendar={onSyncCalendar}
              isInCompletionStage={column.is_completion_stage}
            />
          ))}
        </SortableContext>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 flex-shrink-0"
        onClick={() => onAddCard(column.id)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Cartão
      </Button>

      <StageSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        columnId={column.id}
        columnTitle={column.title}
        onSettingsUpdated={onSettingsUpdated || (() => {})}
      />
    </div>
  );
};
