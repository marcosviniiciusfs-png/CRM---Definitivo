import { format } from "date-fns";

export interface MeetingSchedule {
  date: string;
  time: string;
  scheduledAt: Date;
  phone?: string;
  notes?: string;
  value?: string;
  reminderAt?: string;
  reminderSent?: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Appointments are wall-clock times. Constructing a Date from numeric parts
 * keeps the selected date/time intact instead of treating a date-only value as UTC.
 */
export const parseMeetingSchedule = (content: string): MeetingSchedule | null => {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rawDate = String(parsed.data ?? parsed.date ?? parsed.dataHora ?? parsed.datetime ?? "").trim();
    const rawTime = String(parsed.hora ?? parsed.time ?? "00:00").trim();
    let date = rawDate;
    let time = rawTime;
    let scheduledAt: Date;

    if (rawDate.includes("T")) {
      scheduledAt = new Date(rawDate);
      if (Number.isNaN(scheduledAt.getTime())) return null;
      date = format(scheduledAt, "yyyy-MM-dd");
      time = format(scheduledAt, "HH:mm");
    } else {
      const brDate = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
      if (brDate) {
        const [, day, month, year] = brDate;
        date = `${year.length === 2 ? `20${year}` : year}-${month}-${day}`;
      }

      const dateParts = date.match(DATE_PATTERN);
      const timeParts = time.match(TIME_PATTERN);
      if (!dateParts || !timeParts) return null;

      const [, year, month, day] = dateParts;
      const [, hour, minute] = timeParts;
      scheduledAt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

      if (
        scheduledAt.getFullYear() !== Number(year) ||
        scheduledAt.getMonth() !== Number(month) - 1 ||
        scheduledAt.getDate() !== Number(day)
      ) {
        return null;
      }
      time = `${hour}:${minute}`;
    }

    return {
      date,
      time,
      scheduledAt,
      phone: typeof parsed.telefone === "string" ? parsed.telefone : undefined,
      notes: typeof parsed.observacoes === "string" ? parsed.observacoes : undefined,
      value: typeof parsed.valor === "string" ? parsed.valor : undefined,
      reminderAt: typeof parsed.lembrete_at === "string" ? parsed.lembrete_at : undefined,
      reminderSent: typeof parsed.lembrete_sent === "string" ? parsed.lembrete_sent : undefined,
    };
  } catch {
    return null;
  }
};

export const toMeetingScheduleLocalISOString = (schedule: MeetingSchedule) =>
  format(schedule.scheduledAt, "yyyy-MM-dd'T'HH:mm:ss");

export const isMeetingScheduleActivity = (activityType: string) => {
  const normalized = activityType.toLocaleLowerCase("pt-BR");
  return normalized.includes("agendamento") && (normalized.includes("reuni") || normalized.includes("venda"));
};
