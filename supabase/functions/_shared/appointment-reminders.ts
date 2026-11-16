// Regras puras dos lembretes do agendamento (sem Deno nem Supabase), usadas por
// send-appointment-reminders e testadas em tests/appointment-reminders.test.ts.

export type ReminderKind = "d1_morning" | "d1_afternoon" | "day_of" | "no_show";

export interface AppointmentReminder {
  id: string;
  lead_id: string;
  kind: ReminderKind;
  appointment_at: string;
}

export interface ReminderLead {
  id: string;
  nome_lead: string | null;
  telefone_lead: string | null;
  organization_id: string | null;
  funnel_stage_id: string | null;
  data_agendamento_reuniao: string | null;
  status_reuniao: string | null;
  responsavel_user_id: string | null;
  whatsapp_instance_id: string | null;
}

export interface ReminderSettings {
  enabled: boolean;
  d1_morning_enabled: boolean;
  d1_morning_message: string;
  d1_afternoon_enabled: boolean;
  d1_afternoon_message: string;
  day_of_enabled: boolean;
  day_of_message: string;
  no_show_task_enabled: boolean;
}

export type ReminderSkipReason =
  | "lead_missing"
  | "not_scheduled_stage"
  | "appointment_changed"
  | "disabled"
  | "missing_phone"
  | "meeting_marked";

export const REMINDER_SKIP_TEXT: Record<ReminderSkipReason, string> = {
  lead_missing: "O lead não existe mais.",
  not_scheduled_stage: "O lead não está mais na etapa de agendamento.",
  appointment_changed: "A data do agendamento mudou.",
  disabled: "O lembrete foi desligado.",
  missing_phone: "O lead não tem telefone.",
  meeting_marked: "A reunião já foi marcada como realizada ou no-show.",
};

const TIME_ZONE = "America/Sao_Paulo";
// Tolerância para considerar o mesmo horário (arredondamentos ao salvar).
const SAME_APPOINTMENT_TOLERANCE_MS = 60_000;

export function isSameAppointment(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Number.isFinite(diff) && diff <= SAME_APPOINTMENT_TOLERANCE_MS;
}

export function isKindEnabled(settings: ReminderSettings | null, kind: ReminderKind): boolean {
  if (!settings?.enabled) return false;
  switch (kind) {
    case "d1_morning":
      return settings.d1_morning_enabled;
    case "d1_afternoon":
      return settings.d1_afternoon_enabled;
    case "day_of":
      return settings.day_of_enabled;
    case "no_show":
      return settings.no_show_task_enabled;
  }
}

/** Motivo para não executar o lembrete, ou null se ele pode sair. */
export function reminderSkipReason(
  reminder: AppointmentReminder,
  lead: ReminderLead | null,
  isScheduledStage: boolean,
  settings: ReminderSettings | null,
): ReminderSkipReason | null {
  if (!lead) return "lead_missing";
  if (!isScheduledStage) return "not_scheduled_stage";
  if (!isSameAppointment(reminder.appointment_at, lead.data_agendamento_reuniao)) return "appointment_changed";
  if (!isKindEnabled(settings, reminder.kind)) return "disabled";
  if (reminder.kind === "no_show") {
    return lead.status_reuniao ? "meeting_marked" : null;
  }
  return lead.telefone_lead?.trim() ? null : "missing_phone";
}

export function messageTemplateFor(settings: ReminderSettings, kind: ReminderKind): string | null {
  switch (kind) {
    case "d1_morning":
      return settings.d1_morning_message;
    case "d1_afternoon":
      return settings.d1_afternoon_message;
    case "day_of":
      return settings.day_of_message;
    case "no_show":
      return null;
  }
}

export function firstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  // Nome que é só número (telefone) não serve para cumprimentar.
  return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(first) ? first : "";
}

/** Data (dd/MM) e hora (HH:mm) do agendamento no horário de Brasília. */
export function formatAppointment(appointmentAt: string): { data: string; hora: string } {
  const date = new Date(appointmentAt);
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }).format(date);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return { data, hora };
}

/** Troca {{nome}}, {{data}} e {{hora}}. Sem nome, "Oi, {{nome}}!" vira "Oi!". */
export function renderReminderMessage(template: string, leadName: string | null, appointmentAt: string): string {
  const { data, hora } = formatAppointment(appointmentAt);
  const name = firstName(leadName);
  return template
    .replace(/,?\s*\{\{\s*nome\s*\}\}/gi, (match) => (name ? match.replace(/\{\{\s*nome\s*\}\}/i, name) : ""))
    .replace(/\{\{\s*data\s*\}\}/gi, data)
    .replace(/\{\{\s*hora\s*\}\}/gi, hora)
    .replace(/\s+([!?.,])/g, "$1")
    .trim();
}
