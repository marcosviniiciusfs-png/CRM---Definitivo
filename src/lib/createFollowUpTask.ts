import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TASK_COLUMNS, followUpTitle, pickOpenColumn } from "@/lib/followUpTask";

export class NoTaskBoardError extends Error {}

interface Input {
  organizationId: string;
  leadId: string;
  leadName: string;
  /** Dia do retorno, AAAA-MM-DD. */
  dueDate: string;
  hour: string;
  assigneeId: string | null;
  canCreateBoard: boolean;
}

async function loadColumns(organizationId: string, canCreateBoard: boolean) {
  const { data: board, error } = await supabase
    .from("kanban_boards").select("id").eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;

  let boardId = board?.id;
  if (!boardId) {
    // Só dono e administrador criam o quadro, como na página Tarefas.
    if (!canCreateBoard) throw new NoTaskBoardError();
    const { data: created, error: createError } = await supabase
      .from("kanban_boards").insert({ organization_id: organizationId }).select("id").single();
    if (createError) throw createError;
    boardId = created.id;
    const { error: columnsError } = await supabase.from("kanban_columns").insert(
      DEFAULT_TASK_COLUMNS.map((title, position) => ({ board_id: boardId as string, title, position })),
    );
    if (columnsError) throw columnsError;
  }

  const { data: columns, error: listError } = await supabase
    .from("kanban_columns").select("id, title, position").eq("board_id", boardId);
  if (listError) throw listError;
  return columns ?? [];
}

/** Cria a tarefa de retorno. Se já houver uma aberta para o mesmo lead e dia, não cria outra. */
export async function createFollowUpTask(input: Input): Promise<{ alreadyExisted: boolean }> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão expirada");

  const column = pickOpenColumn(await loadColumns(input.organizationId, input.canCreateBoard));
  if (!column) throw new NoTaskBoardError();

  const title = followUpTitle(input.leadName);
  const { data: existing, error: existingError } = await supabase
    .from("kanban_cards").select("id")
    .eq("lead_id", input.leadId).eq("due_date", input.dueDate).eq("content", title)
    .is("completed_at", null).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return { alreadyExisted: true };

  const { count, error: countError } = await supabase
    .from("kanban_cards").select("id", { count: "exact", head: true }).eq("column_id", column.id);
  if (countError) throw countError;

  const { data: card, error: cardError } = await supabase
    .from("kanban_cards")
    .insert({
      column_id: column.id,
      content: title,
      description: `Retorno marcado na página Reuniões para as ${input.hour}.`,
      due_date: input.dueDate,
      lead_id: input.leadId,
      position: count ?? 0,
      created_by: userId,
    })
    .select("id")
    .single();
  if (cardError) throw cardError;

  const { error: assigneeError } = await supabase
    .from("kanban_card_assignees")
    .insert({ card_id: card.id, user_id: input.assigneeId ?? userId, assigned_by: userId });
  if (assigneeError) console.error("Retorno criado sem responsável:", assigneeError);

  return { alreadyExisted: false };
}
