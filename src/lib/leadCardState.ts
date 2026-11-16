// Estado de atenção do card no Pipeline, nesta prioridade:
//   precisa responder > tarefa atrasada > tarefa hoje > sem tarefa > normal.
// "Hoje" e "atrasada" usam o dia de Brasília, não o fuso de quem está vendo.

export type LeadAttention = "needs_reply" | "overdue" | "today" | "no_task" | "normal";

export interface LeadOpenTask {
  due_date: string | null;
}

export interface LeadAttentionInput {
  waitingSince: string | null | undefined;
  openTasks: LeadOpenTask[] | undefined;
  /** Etapas finais (ganho/perdido/descartado) não cobram tarefa. */
  isFinalStage?: boolean;
  now?: Date;
}

export interface LeadAttentionResult {
  kind: LeadAttention;
  label: string | null;
}

const TIME_ZONE = "America/Sao_Paulo";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (AAAA-MM-DD) da data no horário de Brasília. */
export function brtDayKey(value: Date | string): string {
  return dayKeyFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * Dia de vencimento da tarefa. O formulário de tarefa grava só a data ("2026-11-14"); salva em
 * coluna timestamptz ela vira meia-noite UTC, que em Brasília cairia no dia anterior. Por isso,
 * data pura ou meia-noite UTC exata valem como o próprio dia; o resto é convertido para Brasília.
 */
export function dueDayKey(dueDate: string): string | null {
  const trimmed = dueDate.trim();
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return dateOnly[1];
  // Postgres devolve "2026-11-14 00:00:00+00"; o Date do JS quer "T" e offset "+00:00".
  const parsed = new Date(trimmed.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
    return parsed.toISOString().slice(0, 10);
  }
  return brtDayKey(parsed);
}

/** "agora", "15 min", "3 h", "2 d". */
export function formatWaitingTime(since: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function getLeadAttention({
  waitingSince,
  openTasks,
  isFinalStage = false,
  now = new Date(),
}: LeadAttentionInput): LeadAttentionResult {
  if (waitingSince && !Number.isNaN(new Date(waitingSince).getTime())) {
    return { kind: "needs_reply", label: `Responder · ${formatWaitingTime(waitingSince, now)}` };
  }

  if (isFinalStage) return { kind: "normal", label: null };

  const tasks = openTasks ?? [];
  if (tasks.length === 0) return { kind: "no_task", label: null };

  const today = brtDayKey(now);
  const dueDays = tasks
    .map((task) => (task.due_date ? dueDayKey(task.due_date) : null))
    .filter((day): day is string => Boolean(day));

  if (dueDays.some((day) => day < today)) return { kind: "overdue", label: "Tarefa atrasada" };
  if (dueDays.some((day) => day === today)) return { kind: "today", label: "Tarefa hoje" };
  return { kind: "normal", label: null };
}

export const ATTENTION_FILTERS = [
  { kind: "needs_reply", label: "Responder" },
  { kind: "overdue", label: "Atrasadas" },
  { kind: "today", label: "Hoje" },
  { kind: "no_task", label: "Sem tarefa" },
] as const satisfies ReadonlyArray<{ kind: Exclude<LeadAttention, "normal">; label: string }>;

export type AttentionFilter = (typeof ATTENTION_FILTERS)[number]["kind"];
