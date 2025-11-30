import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, X, Calendar, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { MentionInput } from "./MentionInput";
import { format } from "date-fns";

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
}

interface KanbanCardProps {
  card: Card;
  onEdit: (id: string, updates: Partial<Card>, oldDescription?: string) => void;
  onDelete: (id: string) => void;
}

export const KanbanCard = ({ card, onEdit, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
    });
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(card.content);
  const [editDescription, setEditDescription] = useState(card.description || "");
  const [editDueDate, setEditDueDate] = useState(card.due_date || "");
  const [editEstimatedTime, setEditEstimatedTime] = useState(
    card.estimated_time?.toString() || ""
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
  };

  const handleSave = () => {
    const oldDescription = card.description || "";
    onEdit(
      card.id,
      {
        content: editContent,
        description: editDescription,
        due_date: editDueDate,
        estimated_time: editEstimatedTime ? parseInt(editEstimatedTime) : undefined,
      },
      oldDescription
    );
    setIsEditing(false);
  };

  const formatDueDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch {
      return null;
    }
  };

  const formatEstimatedTime = (minutes?: number) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
    }
    return `${mins}m`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kanban-card bg-card border rounded-lg p-3 mb-2 group relative shadow-sm ${
        !isEditing ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      {...(!isEditing ? { ...attributes, ...listeners } : {})}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Título</label>
                <Input
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Título da tarefa"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Descrição</label>
                <MentionInput
                  value={editDescription}
                  onChange={setEditDescription}
                  placeholder="Adicione uma descrição... Use @ para mencionar usuários"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Prazo Final
                  </label>
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Tempo (min)
                  </label>
                  <Input
                    type="number"
                    value={editEstimatedTime}
                    onChange={(e) => setEditEstimatedTime(e.target.value)}
                    placeholder="60"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer flex-1 font-medium"
                >
                  {card.content}
                </div>
              </div>

              {card.description && (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {card.description}
                </div>
              )}

              {(card.due_date || card.estimated_time) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {card.due_date && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                      <Calendar className="h-3 w-3" />
                      {formatDueDate(card.due_date)}
                    </div>
                  )}
                  {card.estimated_time && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                      <Clock className="h-3 w-3" />
                      {formatEstimatedTime(card.estimated_time)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
            >
              <Settings className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Opções do Cartão</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(card.id)}
              className="text-destructive"
            >
              <X className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
