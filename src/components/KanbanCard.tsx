import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, X, Calendar, Clock, CalendarCheck, ExternalLink, User } from "lucide-react";
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
import { useCardTimer } from "@/hooks/useCardTimer";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

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
}

interface KanbanCardProps {
  card: Card;
  onEdit: (id: string, updates: Partial<Card>, oldDescription?: string) => void;
  onDelete: (id: string) => void;
  onSyncCalendar?: (card: Card) => void;
}

export const KanbanCard = ({ card, onEdit, onDelete, onSyncCalendar }: KanbanCardProps) => {
  const navigate = useNavigate();
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

  const isTimerActive = card.estimated_time && !card.due_date;
  const { formatTimerDisplay, isOvertime } = useCardTimer({
    timerStartedAt: card.timer_started_at,
    estimatedTime: card.estimated_time,
    isActive: !!isTimerActive,
  });

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
        description: editDescription || undefined,
        due_date: editDueDate || undefined,
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

              {/* Lead Badge */}
              {card.lead && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="flex items-center gap-1 px-2 py-1 bg-muted text-foreground border border-primary/20 rounded cursor-pointer hover:bg-muted/80 transition-colors text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/leads/${card.lead!.id}`);
                        }}
                      >
                        <User className="h-3 w-3" />
                        {card.lead.nome_lead}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ver detalhes do lead</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {(card.due_date || card.estimated_time || card.calendar_event_id) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {card.calendar_event_id && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div 
                            className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded cursor-pointer hover:bg-primary/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (card.calendar_event_link) {
                                window.open(card.calendar_event_link, '_blank');
                              }
                            }}
                          >
                            <CalendarCheck className="h-3 w-3" />
                            Sincronizado
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Clique para abrir no Google Calendar</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {card.due_date && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
                      <Calendar className="h-3 w-3" />
                      {formatDueDate(card.due_date)}
                    </div>
                  )}
                  {card.estimated_time && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded ${
                      !card.due_date 
                        ? isOvertime 
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary" 
                        : "bg-muted"
                    }`}>
                      <Clock className="h-3 w-3" />
                      {!card.due_date ? formatTimerDisplay() : formatEstimatedTime(card.estimated_time)}
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
            {card.calendar_event_id ? (
              <DropdownMenuItem
                onClick={() => card.calendar_event_link && window.open(card.calendar_event_link, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir no Calendar
              </DropdownMenuItem>
            ) : (
              onSyncCalendar && (
                <DropdownMenuItem onClick={() => onSyncCalendar(card)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Sincronizar Calendar
                </DropdownMenuItem>
              )
            )}
            <DropdownMenuSeparator />
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
