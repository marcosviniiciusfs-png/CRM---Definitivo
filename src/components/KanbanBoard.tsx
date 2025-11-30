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
import { Plus } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "./LoadingAnimation";

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
  position: number;
  column_id: string;
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
      .select("*")
      .in("column_id", columnsData?.map(c => c.id) || [])
      .order("position");

    const columnsWithCards = columnsData?.map(col => ({
      ...col,
      cards: cardsData?.filter(card => card.column_id === col.id) || []
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

  const addCard = async (columnId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const column = columns.find(c => c.id === columnId);
    const newPosition = column?.cards.length || 0;

    const { data } = await supabase
      .from("kanban_cards")
      .insert({
        column_id: columnId,
        content: "Nova tarefa",
        position: newPosition,
        created_by: user.id,
      })
      .select()
      .single();

    if (data) {
      setColumns(columns.map(col =>
        col.id === columnId ? { ...col, cards: [...col.cards, data] } : col
      ));
    }
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
    await supabase
      .from("kanban_cards")
      .update(updates)
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
    <div className="w-full max-w-full overflow-hidden">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-4 overflow-x-auto">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              onUpdateTitle={updateColumnTitle}
              onDelete={deleteColumn}
              onAddCard={addCard}
              onEditCard={updateCard}
              onDeleteCard={deleteCard}
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
              <div className="font-medium">{activeCard.content}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
