import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, X, Calendar, Clock, CalendarCheck, ExternalLink, User, Users, Check, Timer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MentionInput } from "./MentionInput";
import { format } from "date-fns";
import { useCardTimer } from "@/hooks/useCardTimer";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { AssigneeAvatarGroup } from "./AssigneeAvatarGroup";
import { CollaborativeTaskApproval } from "./CollaborativeTaskApproval";
import { MultiSelectUsers, UserOption } from "./MultiSelectUsers";
import { supabase } from "@/integrations/supabase/client";

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
  is_collaborative?: boolean;
  color?: string | null;
  requires_all_approval?: boolean;
  timer_start_column_id?: string;
}

interface KanbanCardProps {
  card: Card;
  onEdit: (id: string, updates: Partial<Card> & { assignees?: string[] }, oldDescription?: string) => void;
  onDelete: (id: string) => void;
  onSyncCalendar?: (card: Card) => void;
  isInCompletionStage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  orgMembers?: UserOption[];
  initialAssignees?: string[];
  boardId?: string;
  kanbanColumns?: { id: string; title: string }[];
  onCardMoved?: () => void;
}

export const KanbanCard = ({ 
  card, 
  onEdit, 
  onDelete, 
  onSyncCalendar, 
  isInCompletionStage,
  canEdit = true,
  canDelete = true,
  orgMembers = [],
  initialAssignees = [],
  boardId,
  kanbanColumns = [],
  onCardMoved,
}: KanbanCardProps) => {
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
  const [editColor, setEditColor] = useState(card.color || "");
  const [editAssignees, setEditAssignees] = useState<string[]>(initialAssignees);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [completedAssignees, setCompletedAssignees] = useState<string[]>([]);
  const [editTimerStartColumnId, setEditTimerStartColumnId] = useState<string | null>(null);

  // Carregar assignees atuais e timer_start_column_id ao entrar no modo de edição
  useEffect(() => {
    if (isEditing) {
      const loadAssignees = async () => {
        const { data } = await supabase
          .from("kanban_card_assignees")
          .select("user_id, is_completed")
          .eq("card_id", card.id);
        
        if (data) {
          setEditAssignees(data.map(a => a.user_id));
          setCompletedAssignees(data.filter(a => a.is_completed).map(a => a.user_id));
        }
      };
      loadAssignees();
      setEditTimerStartColumnId(card.timer_start_column_id || null);
    }
  }, [isEditing, card.id, card.timer_start_column_id]);

  const colorOptions = [
    { value: "", label: "Sem cor" },
    { value: "#EF4444", label: "Vermelho" },
    { value: "#F97316", label: "Laranja" },
    { value: "#EAB308", label: "Amarelo" },
    { value: "#22C55E", label: "Verde" },
    { value: "#3B82F6", label: "Azul" },
    { value: "#8B5CF6", label: "Roxo" },
  ];

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
        color: editColor || null,
        assignees: editAssignees,
        timer_start_column_id: editTimerStartColumnId,
      },
      oldDescription
    );
    setIsEditing(false);
  };

  // Filtrar usuários que já confirmaram (não podem ser removidos em tarefas colaborativas)
  const handleAssigneeChange = (newAssignees: string[]) => {
    if (card.is_collaborative) {
      // Garantir que membros que já completaram não podem ser removidos
      const safeAssignees = [...new Set([...newAssignees, ...completedAssignees])];
      // Garantir mínimo de 2 para tarefas colaborativas
      if (safeAssignees.length < 2 && editAssignees.length >= 2) {
        return; // Não permitir reduzir abaixo de 2
      }
      setEditAssignees(safeAssignees);
    } else {
      setEditAssignees(newAssignees);
    }
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
      style={{
        ...style,
        backgroundColor: card.color ? `${card.color}1A` : undefined, // 1A = 10% opacity in hex
      }}
      className={`kanban-card bg-card border rounded-lg p-3 mb-2 group relative shadow-sm ${
        !isEditing ? "cursor-grab active:cursor-grabbing" : ""
      } ${card.is_collaborative ? "ring-1 ring-amber-500/40 hover:ring-amber-500/70 transition-all" : ""} ${
        isInCompletionStage ? "ring-1 ring-green-500/50" : ""
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

              {/* Color Picker */}
              <div>
                <label className="text-xs font-medium mb-1 block">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                        editColor === option.value
                          ? "border-foreground scale-110 ring-2 ring-offset-1 ring-foreground/30"
                          : "border-muted hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: option.value || "transparent",
                        backgroundImage: !option.value ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)" : undefined,
                        backgroundSize: !option.value ? "6px 6px" : undefined,
                        backgroundPosition: !option.value ? "0 0, 0 3px, 3px -3px, -3px 0px" : undefined,
                      }}
                      onClick={() => setEditColor(option.value)}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>

              {/* Responsáveis */}
              {orgMembers.length > 0 && (
                <div>
                  <label className="text-xs font-medium mb-1 block flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Responsáveis
                    {card.is_collaborative && (
                      <Badge variant="secondary" className="text-[10px] px-1 ml-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Colaborativa
                      </Badge>
                    )}
                  </label>
                  <MultiSelectUsers
                    value={editAssignees}
                    onChange={handleAssigneeChange}
                    users={orgMembers}
                    placeholder="Selecionar responsáveis..."
                  />
                  {card.is_collaborative && completedAssignees.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Check className="h-3 w-3 inline mr-1 text-green-500" />
                      {completedAssignees.length} membro(s) já confirmaram e não podem ser removidos.
                    </p>
                  )}
                </div>
              )}

              {/* Seletor de etapa do timer */}
              {editEstimatedTime && !editDueDate && kanbanColumns.length > 0 && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                  <label className="text-xs font-medium flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Iniciar cronômetro quando entrar em:
                  </label>
                  <Select 
                    value={editTimerStartColumnId || "immediate"} 
                    onValueChange={(val) => setEditTimerStartColumnId(val === "immediate" ? null : val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Imediatamente</SelectItem>
                      {kanbanColumns.map(col => (
                        <SelectItem key={col.id} value={col.id}>
                          Quando entrar em "{col.title}"
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O cronômetro iniciará automaticamente quando a tarefa for movida para esta etapa.
                  </p>
                </div>
              )}

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
                  onClick={() => canEdit && !card.is_collaborative && setIsEditing(true)}
                  className={`flex-1 font-medium flex items-center gap-2 flex-wrap ${canEdit ? 'cursor-pointer' : ''}`}
                >
                  {card.content}
                  {card.is_collaborative && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                      <Users className="h-3 w-3 mr-1" />
                      Colaborativa
                    </Badge>
                  )}
                </div>
              </div>

              {card.description && (
                <div className="text-sm text-muted-foreground">
                  {card.description.length > 50 
                    ? `${card.description.substring(0, 50)}...` 
                    : card.description
                  }
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

              {/* Assignees Avatar Group */}
              <AssigneeAvatarGroup
                cardId={card.id}
                isCollaborative={card.is_collaborative}
                showProgress={true}
                onAssigneeClick={() => {
                  if (card.is_collaborative) {
                    setApprovalModalOpen(true);
                  }
                }}
              />

              {/* Botão de aprovação para tarefas colaborativas */}
              {card.is_collaborative && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-xs h-7 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setApprovalModalOpen(true);
                  }}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Ver Status e Confirmar
                </Button>
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
                        ? card.timer_started_at
                          ? isOvertime 
                            ? "bg-destructive/10 text-destructive"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-muted"
                    }`}>
                      <Clock className={`h-3 w-3 ${!card.due_date && card.timer_start_column_id && !card.timer_started_at ? 'animate-pulse' : ''}`} />
                      {!card.due_date 
                        ? card.timer_started_at 
                          ? formatTimerDisplay() 
                          : `${formatEstimatedTime(card.estimated_time)} (aguardando)`
                        : formatEstimatedTime(card.estimated_time)
                      }
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
            {canEdit && (
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
            )}
            {card.calendar_event_id ? (
              <DropdownMenuItem
                onClick={() => card.calendar_event_link && window.open(card.calendar_event_link, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir no Calendar
              </DropdownMenuItem>
            ) : (
              onSyncCalendar && canEdit && (
                <DropdownMenuItem onClick={() => onSyncCalendar(card)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Sincronizar Calendar
                </DropdownMenuItem>
              )
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(card.id)}
                  className="text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modal de aprovação colaborativa */}
      {card.is_collaborative && (
        <CollaborativeTaskApproval
          open={approvalModalOpen}
          onOpenChange={setApprovalModalOpen}
          cardId={card.id}
          cardTitle={card.content}
          boardId={boardId}
          onCardMoved={onCardMoved}
        />
      )}
    </div>
  );
};
