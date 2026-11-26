// Tarefa de retorno criada a partir de uma reunião. Regras puras.

export interface TaskColumn {
  id: string;
  title: string;
  position: number;
}

export const DEFAULT_TASK_COLUMNS = ["A Fazer", "Em Progresso", "Concluído"] as const;

/** Mesma regra de lead_open_tasks no banco: a coluna de concluídas é reconhecida pelo título. */
export const isDoneColumn = (title: string) => /^conclu/i.test(title.trim());

/** Primeira coluna que ainda conta como tarefa aberta. */
export function pickOpenColumn(columns: TaskColumn[]): TaskColumn | null {
  return [...columns].filter((c) => !isDoneColumn(c.title)).sort((a, b) => a.position - b.position)[0] ?? null;
}

export function followUpTitle(leadName: string): string {
  return `Retorno: ${leadName.trim() || "lead sem nome"}`;
}
