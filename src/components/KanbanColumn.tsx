import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { KanbanCard } from "./KanbanCard";

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
}

interface Column {
  id: string;
  title: string;
  cards: Card[];
}

interface KanbanColumnProps {
  column: Column;
  onUpdateTitle: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string) => void;
  onEditCard: (columnId: string, cardId: string, updates: Partial<Card>, oldDescription?: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
}

export const KanbanColumn = ({
  column,
  onUpdateTitle,
  onDelete,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex-shrink-0 w-80 bg-background rounded-lg p-4 shadow-md border">
      <div className="flex items-center justify-between mb-4">
        <Input
          value={column.title}
          onChange={(e) => onUpdateTitle(column.id, e.target.value)}
          className="font-semibold border-none focus-visible:ring-0 px-0 h-auto"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(column.id)}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[100px] transition-colors ${
          isOver ? "bg-accent/50 rounded-lg p-2" : ""
        }`}
      >
        <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={(id, updates, oldDesc) => onEditCard(column.id, id, updates, oldDesc)}
              onDelete={(id) => onDeleteCard(column.id, id)}
            />
          ))}
        </SortableContext>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2"
        onClick={() => onAddCard(column.id)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Cartão
      </Button>
    </div>
  );
};
