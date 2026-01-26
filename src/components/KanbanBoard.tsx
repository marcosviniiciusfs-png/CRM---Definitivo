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
import { Plus, Calendar, Clock, CalendarCheck, User, Users } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "./LoadingAnimation";
import { CreateTaskEventModal } from "./CreateTaskEventModal";
import { CreateTaskModal } from "./CreateTaskModal";
import { format } from "date-fns";
import { useOrganization } from "@/contexts/OrganizationContext";
import { UserOption } from "./MultiSelectUsers";

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
  timer_start_column_id?: string;
  color?: string | null;
}

interface Column {
  id: string;
  title: string;
  position: number;
  cards: Card[];
  is_completion_stage?: boolean;
  block_backward_movement?: boolean;
  auto_delete_enabled?: boolean;
  auto_delete_hours?: number | null;
  stage_color?: string | null;
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [cardAssigneesMap, setCardAssigneesMap] = useState<Record<string, string[]>>({});
  const [orgMembers, setOrgMembers] = useState<UserOption[]>([]);
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  
  // Get granular permissions from context
  const { permissions } = useOrganization();
  const isOwnerOrAdmin = permissions.role === 'owner' || permissions.role === 'admin';
  const canCreateTasks = isOwnerOrAdmin || permissions.canCreateTasks;
  const canEditOwnTasks = isOwnerOrAdmin || permissions.canEditOwnTasks;
  const canEditAllTasks = isOwnerOrAdmin || permissions.canEditAllTasks;
  const canDeleteTasks = isOwnerOrAdmin || permissions.canDeleteTasks;

  // Buscar usuário atual
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  useEffect(() => {
    loadOrCreateBoard();
    loadOrgMembers();
  }, [organizationId]);

  // Carregar membros da organização
  const loadOrgMembers = async () => {
    try {
      const { data: members } = await supabase.rpc('get_organization_members_masked');
      
      if (members) {
        const userIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);

        const memberOptions: UserOption[] = members
          .filter((m: any) => m.user_id)
          .map((m: any) => {
            const profile = profiles?.find(p => p.user_id === m.user_id);
            return {
              user_id: m.user_id,
              full_name: profile?.full_name || null,
              avatar_url: profile?.avatar_url || null,
            };
          });

        setOrgMembers(memberOptions);
      }
    } catch (error) {
      console.error("[KANBAN] Error loading org members:", error);
    }
  };

  // State for board not found scenario
  const [boardNotFound, setBoardNotFound] = useState(false);

  const loadOrCreateBoard = async () => {
    console.log('[KANBAN] Loading board for organization:', organizationId);
    setBoardNotFound(false);
    
    // Validar organizationId antes de prosseguir
    if (!organizationId || organizationId.length < 10) {
      console.error('[KANBAN] Invalid organizationId:', organizationId);
      setLoading(false);
      return;
    }
    
    try {
      // Buscar board existente usando maybeSingle para evitar erro se não existir
      const { data: existingBoard, error: fetchError } = await supabase
        .from("kanban_boards")
        .select("id")
        .eq("organization_id", organizationId)
        .maybeSingle();

      console.log('[KANBAN] Existing board result:', { existingBoard, fetchError });

      if (fetchError) {
        // Check if it's a 403/permission error
        const errorCode = (fetchError as any)?.code;
        const errorMessage = fetchError?.message?.toLowerCase() || '';
        
        if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('policy')) {
          console.error('[KANBAN] Permission error - RLS may be blocking access:', fetchError);
          toast({ 
            title: "Erro de permissão", 
            description: "Verifique se a organização ativa está correta. Tente trocar de organização e voltar.",
            variant: "destructive" 
          });
        } else {
          console.error('[KANBAN] Error fetching board:', fetchError);
          toast({ title: "Erro ao carregar quadro", variant: "destructive" });
        }
        setLoading(false);
        return;
      }

      let currentBoardId = existingBoard?.id;

      if (!currentBoardId) {
        console.log('[KANBAN] No board found for organization:', organizationId);
        
        // CRITICAL: Only owners/admins can create boards automatically
        // Members should see a friendly message instead of getting 403 error
        if (!isOwnerOrAdmin) {
          console.log('[KANBAN] User is not owner/admin, cannot create board');
          setBoardNotFound(true);
          setLoading(false);
          return;
        }

        console.log('[KANBAN] Owner/Admin creating new board...');
        // Criar novo board com colunas padrão
        const { data: newBoard, error: createError } = await supabase
          .from("kanban_boards")
          .insert({ organization_id: organizationId })
          .select()
          .single();

        if (createError) {
          console.error('[KANBAN] Error creating board:', createError);
          // Better error message for 403
          const createErrorCode = (createError as any)?.code;
          if (createErrorCode === '42501') {
            toast({ 
              title: "Sem permissão para criar quadro", 
              description: "Apenas administradores podem criar o quadro de tarefas.",
              variant: "destructive" 
            });
          } else {
            toast({ title: "Erro ao criar quadro", variant: "destructive" });
          }
          setLoading(false);
          return;
        }

        currentBoardId = newBoard?.id;
        console.log('[KANBAN] New board created:', currentBoardId);

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
      console.error("[KANBAN] Erro ao carregar board:", error);
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

    // Buscar assignees para todos os cards
    const cardIds = cardsData?.map(c => c.id) || [];
    const { data: assigneesData } = await supabase
      .from("kanban_card_assignees")
      .select("card_id, user_id")
      .in("card_id", cardIds);

    // Criar mapa de card_id -> user_ids para contador de tarefas do usuário
    const assigneesMap: Record<string, string[]> = {};
    assigneesData?.forEach(a => {
      if (!assigneesMap[a.card_id]) {
        assigneesMap[a.card_id] = [];
      }
      assigneesMap[a.card_id].push(a.user_id);
    });
    setCardAssigneesMap(assigneesMap);

    const columnsWithCards = columnsData?.map(col => ({
      ...col,
      is_completion_stage: col.is_completion_stage ?? false,
      block_backward_movement: col.block_backward_movement ?? false,
      auto_delete_enabled: col.auto_delete_enabled ?? false,
      auto_delete_hours: col.auto_delete_hours,
      stage_color: col.stage_color,
      cards: cardsData?.filter(card => card.column_id === col.id).map(card => ({
        ...card,
        lead: card.leads || undefined,
        // Garantir que flags colaborativas estejam sempre presentes
        is_collaborative: card.is_collaborative ?? false,
        requires_all_approval: card.requires_all_approval ?? true,
        timer_start_column_id: card.timer_start_column_id || null,
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
    timer_start_column_id?: string | null;
    color?: string | null;
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
      timer_start_column_id: task.timer_start_column_id || null,
      color: task.color || null,
    };

    if (task.lead_id) {
      insertData.lead_id = task.lead_id;
    }

    // Set timer_started_at based on timer_start_column_id
    if (task.estimated_time && !task.due_date) {
      // Se não tem coluna de início configurada OU a coluna atual é a coluna de início
      if (!task.timer_start_column_id || task.timer_start_column_id === selectedColumnForTask) {
        insertData.timer_started_at = new Date().toISOString();
      } else {
        // Timer aguarda chegar na coluna configurada
        insertData.timer_started_at = null;
      }
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
        color: task.color,
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
    updates: Partial<Card> & { assignees?: string[] },
    oldDescription?: string
  ) => {
    // Separar assignees dos updates normais do card
    const { assignees, timer_start_column_id, ...cardUpdates } = updates as any;

    // Garantir que campos vazios sejam null e valores sejam salvos corretamente
    const dbUpdates: any = {
      content: cardUpdates.content,
      description: cardUpdates.description || null,
      due_date: cardUpdates.due_date || null,
      estimated_time: cardUpdates.estimated_time ?? null,
      color: cardUpdates.color !== undefined ? (cardUpdates.color || null) : undefined,
    };

    // Atualizar timer_start_column_id se fornecido
    if (timer_start_column_id !== undefined) {
      dbUpdates.timer_start_column_id = timer_start_column_id;
    }

    // Gerenciar timer_started_at baseado em estimated_time, due_date e timer_start_column_id
    if (cardUpdates.estimated_time !== undefined) {
      if (cardUpdates.estimated_time && !cardUpdates.due_date) {
        // Se timer_start_column_id foi definido, verificar se é a coluna atual
        if (timer_start_column_id !== undefined) {
          if (timer_start_column_id === columnId) {
            // Timer inicia agora pois está na coluna correta
            dbUpdates.timer_started_at = new Date().toISOString();
          } else if (timer_start_column_id === null) {
            // Timer inicia imediatamente (sem coluna específica)
            dbUpdates.timer_started_at = new Date().toISOString();
          } else {
            // Timer aguarda chegar na coluna configurada - resetar timer
            dbUpdates.timer_started_at = null;
          }
        } else {
          // Manter comportamento padrão: timer começa agora
          dbUpdates.timer_started_at = new Date().toISOString();
        }
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

    // Sincronizar assignees se foram alterados
    if (assignees !== undefined) {
      await syncCardAssignees(cardId, assignees, cardUpdates.content || '');
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

    setColumns(columns.map(col =>
      col.id === columnId
        ? { ...col, cards: col.cards.map(c => c.id === cardId ? { ...c, ...cardUpdates } : c) }
        : col
    ));

    // Atualizar mapa de assignees local
    if (assignees !== undefined) {
      setCardAssigneesMap(prev => ({ ...prev, [cardId]: assignees }));
    }
  };

  // Sincronizar assignees no banco de dados
  const syncCardAssignees = async (cardId: string, newAssignees: string[], cardTitle: string) => {
    try {
      // Buscar assignees atuais
      const { data: currentAssignees } = await supabase
        .from("kanban_card_assignees")
        .select("id, user_id, is_completed")
        .eq("card_id", cardId);

      const currentIds = currentAssignees?.map(a => a.user_id) || [];

      // Identificar adições e remoções
      const toAdd = newAssignees.filter(id => !currentIds.includes(id));
      const toRemove = currentAssignees?.filter(a => 
        !newAssignees.includes(a.user_id) && !a.is_completed // Não remover quem já confirmou
      ) || [];

      // Inserir novos assignees
      if (toAdd.length > 0) {
        await supabase.from("kanban_card_assignees").insert(
          toAdd.map(userId => ({
            card_id: cardId,
            user_id: userId,
            assigned_by: currentUserId,
          }))
        );

        // Criar notificações para novos atribuídos
        for (const userId of toAdd) {
          if (userId !== currentUserId) {
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "task_assigned",
              title: "Tarefa atribuída",
              message: `Você foi atribuído à tarefa "${cardTitle}"`,
              card_id: cardId,
            });
          }
        }
      }

      // Remover os que foram desmarcados (exceto quem já confirmou)
      if (toRemove.length > 0) {
        await supabase.from("kanban_card_assignees")
          .delete()
          .in("id", toRemove.map(a => a.id));
      }

      console.log('[KANBAN] Assignees sincronizados:', {
        cardId,
        added: toAdd,
        removed: toRemove.map(a => a.user_id),
      });
    } catch (error) {
      console.error('[KANBAN] Erro ao sincronizar assignees:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar os responsáveis.",
        variant: "destructive",
      });
    }
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

  const handleDragOver = async (event: DragOverEvent) => {
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

    // BLOQUEIO TOTAL para tarefas colaborativas - verificar no banco de dados
    if (card.is_collaborative && card.requires_all_approval) {
      // Buscar status atual dos assignees diretamente do banco
      const { data: assignees } = await supabase
        .from("kanban_card_assignees")
        .select("is_completed, user_id")
        .eq("card_id", activeCardId);

      console.log("🔍 DragOver - Tarefa Colaborativa:", {
        cardId: activeCardId,
        is_collaborative: card.is_collaborative,
        requires_all_approval: card.requires_all_approval,
        assignees: assignees,
      });

      if (assignees && assignees.length > 0) {
        const allCompleted = assignees.every(a => a.is_completed);
        
        if (!allCompleted) {
          const completedCount = assignees.filter(a => a.is_completed).length;
          
          // Buscar nomes dos pendentes para feedback
          const pendingIds = assignees.filter(a => !a.is_completed).map(a => a.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("full_name")
            .in("user_id", pendingIds);
          
          const pendingNames = profiles?.map(p => p.full_name).join(", ") || "colaboradores";

          toast({
            title: "⚠️ Tarefa Colaborativa Bloqueada",
            description: `Todos devem confirmar antes de mover. Faltam: ${pendingNames} (${completedCount}/${assignees.length})`,
            variant: "destructive",
            duration: 4000,
          });
          
          // NÃO MOVER - Bloquear movimento visual
          return;
        }
      }
    }

    // Verificar bloqueio de movimento reverso durante drag
    if (sourceColumn.block_backward_movement) {
      const sourcePos = columns.findIndex(c => c.id === sourceColumn.id);
      const targetPos = columns.findIndex(c => c.id === targetColumn.id);
      
      if (targetPos < sourcePos) {
        // Bloquear visualmente - não mover
        return;
      }
    }

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

    console.log("🔍 DragEnd - Card Info:", {
      cardId: activeCardId,
      is_collaborative: card.is_collaborative,
      requires_all_approval: card.requires_all_approval,
      sourceColumn: sourceColumn.title,
      targetColumn: targetColumn.title,
    });

    // Verificar se é tarefa colaborativa e está mudando de coluna
    if (sourceColumn.id !== targetColumn.id && card.is_collaborative && card.requires_all_approval) {
      console.log("🔍 DragEnd - Validando tarefa colaborativa...");
      
      // Buscar status dos colaboradores com nomes
      const { data: assignees, error } = await supabase
        .from("kanban_card_assignees")
        .select("is_completed, user_id")
        .eq("card_id", activeCardId);

      console.log("🔍 DragEnd - Assignees:", { assignees, error });

      if (error) {
        console.error("❌ Erro ao buscar assignees:", error);
        toast({
          title: "Erro",
          description: "Não foi possível validar a tarefa colaborativa.",
          variant: "destructive",
        });
        await loadColumns(boardId || "");
        return;
      }

      if (assignees && assignees.length > 0) {
        const allCompleted = assignees.every(a => a.is_completed);
        console.log("🔍 DragEnd - Todos completaram?", allCompleted);

        if (!allCompleted) {
          const completedCount = assignees.filter(a => a.is_completed).length;
          
          // Buscar nomes dos pendentes
          const pendingIds = assignees.filter(a => !a.is_completed).map(a => a.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("full_name")
            .in("user_id", pendingIds);
          
          const pendingNames = profiles?.map(p => p.full_name).join(", ") || "colaboradores";
          
          console.log("🚫 DragEnd - BLOQUEANDO movimento. Pendentes:", pendingNames);
          
          toast({
            title: "⚠️ Movimentação Bloqueada",
            description: `Tarefa colaborativa requer aprovação de todos. Faltam: ${pendingNames} (${completedCount}/${assignees.length} confirmaram)`,
            variant: "destructive",
            duration: 5000,
          });
          
          // IMPORTANTE: Recarregar para reverter visualmente
          await loadColumns(boardId || "");
          return;
        }
      } else {
        console.log("⚠️ DragEnd - Tarefa colaborativa sem assignees cadastrados");
      }
    }

    // Verificar bloqueio de movimento reverso
    if (sourceColumn.id !== targetColumn.id && sourceColumn.block_backward_movement) {
      const sourcePos = columns.findIndex(c => c.id === sourceColumn.id);
      const targetPos = columns.findIndex(c => c.id === targetColumn.id);
      
      if (targetPos < sourcePos) {
        toast({
          title: "⚠️ Movimento Bloqueado",
          description: `Tarefas não podem voltar da etapa "${sourceColumn.title}" para etapas anteriores.`,
          variant: "destructive",
        });
        await loadColumns(boardId || "");
        return;
      }
    }

    // Atualizar no banco se mudou de coluna
    if (sourceColumn.id !== targetColumn.id) {
      const updateData: any = { column_id: targetColumn.id };
      
      // Verificar se deve iniciar o timer ao entrar nesta coluna
      if (card.timer_start_column_id === targetColumn.id && !card.timer_started_at && card.estimated_time) {
        updateData.timer_started_at = new Date().toISOString();
        toast({
          title: "⏱️ Cronômetro Iniciado",
          description: `Timer da tarefa "${card.content}" começou a contar!`,
        });
      }
      
      await supabase
        .from("kanban_cards")
        .update(updateData)
        .eq("id", activeCardId);
      
      // Update local state for collaborative tasks that passed validation
      setColumns(columns.map(col => {
        if (col.id === sourceColumn.id) {
          return { ...col, cards: col.cards.filter(c => c.id !== activeCardId) };
        }
        if (col.id === targetColumn.id) {
          const updatedCard = { 
            ...card, 
            timer_started_at: updateData.timer_started_at || card.timer_started_at 
          };
          return { ...col, cards: [...col.cards, updatedCard] };
        }
        return col;
      }));
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

  // Board not found - show friendly message for members
  if (boardNotFound) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <div className="p-4 bg-muted rounded-full mb-4">
          <CalendarCheck className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Quadro não encontrado</h2>
        <p className="text-muted-foreground max-w-md mb-4">
          O quadro de tarefas ainda não foi criado para esta organização.
          Peça ao administrador para acessar a seção de Tarefas e criar o quadro.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>Aguardando criação pelo administrador</span>
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
        onDragStart={handleDragStart}
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
              onEditCard={updateCard}
              onDeleteCard={deleteCard}
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
              className="flex-shrink-0 w-80 h-auto py-8"
              onClick={addColumn}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Coluna
            </Button>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className={`bg-card border rounded-lg p-3 shadow-lg opacity-90 w-80 ${
              activeCard.is_collaborative ? "ring-2 ring-primary" : ""
            }`}>
              <div className="space-y-2">
                {/* Indicador de tarefa colaborativa */}
                {activeCard.is_collaborative && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                    <Users className="h-3 w-3" />
                    <span>Tarefa Colaborativa - Requer aprovação de todos</span>
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
