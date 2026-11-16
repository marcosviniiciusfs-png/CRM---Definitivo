// Eventos de etapa: o que cada etapa do funil representa no atendimento.
// Painel, lembretes e IA de etapas devem perguntar por evento, nunca pelo nome da etapa.
//
// - Eventos da reunião ficam em funnel_stages.linked_event (no máximo um por funil).
// - Ganho e perdido continuam em funnel_stages.stage_type ('won' / 'lost').

export const MEETING_EVENTS = ["scheduled", "confirmed", "attended", "no_show"] as const;

export type MeetingEvent = (typeof MEETING_EVENTS)[number];
export type OutcomeEvent = "won" | "lost";
export type StageEvent = MeetingEvent | OutcomeEvent;

export const MEETING_EVENT_INFO: Record<MeetingEvent, { label: string; description: string }> = {
  scheduled: {
    label: "Agendamento",
    description: "O lead marcou uma reunião ou visita.",
  },
  confirmed: {
    label: "Confirmação",
    description: "O lead confirmou que vai comparecer.",
  },
  attended: {
    label: "Compareceu",
    description: "A reunião ou visita aconteceu.",
  },
  no_show: {
    label: "Não compareceu",
    description: "O lead faltou à reunião ou visita.",
  },
};

export interface StageWithEvent {
  id: string;
  name?: string;
  position?: number;
  stage_type?: string | null;
  linked_event?: string | null;
}

export function isMeetingEvent(value: unknown): value is MeetingEvent {
  return typeof value === "string" && (MEETING_EVENTS as readonly string[]).includes(value);
}

/** Evento que a etapa representa, ou null. */
export function getStageEvent(stage: StageWithEvent): StageEvent | null {
  if (stage.stage_type === "won" || stage.stage_type === "lost") return stage.stage_type;
  return isMeetingEvent(stage.linked_event) ? stage.linked_event : null;
}

/**
 * Etapas de UM funil que representam o evento.
 * Eventos da reunião: no máximo uma etapa. Ganho/perdido: todas as etapas com esse stage_type.
 */
export function findStagesForEvent<T extends StageWithEvent>(stages: T[], event: StageEvent): T[] {
  return stages.filter((stage) => getStageEvent(stage) === event);
}

/** A etapa do funil que já representa o evento da reunião, ignorando `exceptStageId`. */
export function findMeetingEventOwner<T extends StageWithEvent>(
  stages: T[],
  event: MeetingEvent,
  exceptStageId?: string | null,
): T | null {
  return stages.find((stage) => stage.linked_event === event && stage.id !== exceptStageId) ?? null;
}

/** Eventos da reunião que ainda não estão em nenhuma etapa do funil. */
export function missingMeetingEvents(stages: StageWithEvent[]): MeetingEvent[] {
  const present = new Set(stages.map((stage) => stage.linked_event));
  return MEETING_EVENTS.filter((event) => !present.has(event));
}
