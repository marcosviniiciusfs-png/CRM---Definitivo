import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { UserOption } from "@/components/MultiSelectUsers";

interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email?: string;
}

export interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
  column_id: string;
  created_at: string;
  created_by: string;
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

export interface Column {
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

interface UseKanbanBoardReturn {
  boardId: string | null;
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
  loading: boolean;
  boardNotFound: boolean;
  orgMembers: UserOption[];
  cardAssigneesMap: Record<string, string[]>;
  setCardAssigneesMap: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  loadColumns: (boardId: string) => Promise<void>;
  addColumn: () => Promise<void>;
  updateColumnTitle: (columnId: string, title: string) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
}

export function useKanbanBoard(
  organizationId: string,
  isOwnerOrAdmin: boolean
): UseKanbanBoardReturn {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardNotFound, setBoardNotFound] = useState(false);
  const [orgMembers, setOrgMembers] = useState<UserOption[]>([]);
  const [cardAssigneesMap, setCardAssigneesMap] = useState<Record<string, string[]>>({});
  const { toast } = useToast();

  // Load organization members
  const loadOrgMembers = useCallback(async () => {
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
      logger.error("[KANBAN] Error loading org members:", error);
    }
  }, []);

  // Load columns with cards
  const loadColumns = useCallback(async (boardId: string) => {
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

    // Fetch assignees for all cards
    const cardIds = cardsData?.map(c => c.id) || [];
    const { data: assigneesData } = await supabase
      .from("kanban_card_assignees")
      .select("card_id, user_id")
      .in("card_id", cardIds);

    // Create map of card_id -> user_ids
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
        is_collaborative: card.is_collaborative ?? false,
        requires_all_approval: card.requires_all_approval ?? true,
        timer_start_column_id: card.timer_start_column_id || null,
      })) || []
    })) || [];

    setColumns(columnsWithCards);
  }, []);

  // Load or create board
  const loadOrCreateBoard = useCallback(async () => {
    logger.log('[KANBAN] Loading board for organization:', organizationId);
    setBoardNotFound(false);

    // Validate organizationId
    if (!organizationId || organizationId.length < 10) {
      logger.error('[KANBAN] Invalid organizationId:', organizationId);
      setLoading(false);
      return;
    }

    try {
      // Fetch existing board
      const { data: existingBoard, error: fetchError } = await supabase
        .from("kanban_boards")
        .select("id")
        .eq("organization_id", organizationId)
        .maybeSingle();

      logger.log('[KANBAN] Existing board result:', { existingBoard, fetchError });

      if (fetchError) {
        const errorCode = (fetchError as any)?.code;
        const errorMessage = fetchError?.message?.toLowerCase() || '';

        if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('policy')) {
          logger.error('[KANBAN] Permission error - RLS may be blocking access:', fetchError);
          toast({
            title: "Erro de permiss\u00e3o",
            description: "Verifique se a organiza\u00e7\u00e3o ativa est\u00e1 correta. Tente trocar de organiza\u00e7\u00e3o e voltar.",
            variant: "destructive"
          });
        } else {
          logger.error('[KANBAN] Error fetching board:', fetchError);
          toast({ title: "Erro ao carregar quadro", variant: "destructive" });
        }
        setLoading(false);
        return;
      }

      let currentBoardId = existingBoard?.id;

      if (!currentBoardId) {
        logger.log('[KANBAN] No board found for organization:', organizationId);

        // Only owners/admins can create boards automatically
        if (!isOwnerOrAdmin) {
          logger.log('[KANBAN] User is not owner/admin, cannot create board');
          setBoardNotFound(true);
          setLoading(false);
          return;
        }

        logger.log('[KANBAN] Owner/Admin creating new board...');
        const { data: newBoard, error: createError } = await supabase
          .from("kanban_boards")
          .insert({ organization_id: organizationId })
          .select()
          .single();

        if (createError) {
          logger.error('[KANBAN] Error creating board:', createError);
          const createErrorCode = (createError as any)?.code;
          if (createErrorCode === '42501') {
            toast({
              title: "Sem permiss\u00e3o para criar quadro",
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
        logger.log('[KANBAN] New board created:', currentBoardId);

        if (currentBoardId) {
          await supabase.from("kanban_columns").insert([
            { board_id: currentBoardId, title: "A Fazer", position: 0 },
            { board_id: currentBoardId, title: "Em Progresso", position: 1 },
            { board_id: currentBoardId, title: "Conclu\u00eddo", position: 2 },
          ]);
        }
      }

      setBoardId(currentBoardId || null);
      await loadColumns(currentBoardId || "");
    } catch (error) {
      logger.error("[KANBAN] Erro ao carregar board:", error);
      toast({ title: "Erro ao carregar quadro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [organizationId, isOwnerOrAdmin, loadColumns, toast]);

  // Add column
  const addColumn = useCallback(async () => {
    if (!boardId) return;

    const newPosition = columns.length;
    const { data } = await supabase
      .from("kanban_columns")
      .insert({ board_id: boardId, title: "Nova Coluna", position: newPosition })
      .select()
      .single();

    if (data) {
      setColumns(prev => [...prev, { ...data, cards: [] }]);
    }
  }, [boardId, columns.length]);

  // Update column title
  const updateColumnTitle = useCallback(async (columnId: string, title: string) => {
    await supabase
      .from("kanban_columns")
      .update({ title })
      .eq("id", columnId);

    setColumns(prev => prev.map(col => col.id === columnId ? { ...col, title } : col));
  }, []);

  // Delete column
  const deleteColumn = useCallback(async (columnId: string) => {
    await supabase.from("kanban_columns").delete().eq("id", columnId);
    setColumns(prev => prev.filter(col => col.id !== columnId));
  }, []);

  // Initialize
  useEffect(() => {
    loadOrCreateBoard();
    loadOrgMembers();
  }, [loadOrCreateBoard, loadOrgMembers]);

  return {
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
  };
}
