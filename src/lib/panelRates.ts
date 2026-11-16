// Taxas do atendimento e ritmo da meta mensal do Painel de acompanhamento.
// Fórmulas trazidas do Painel do Hurtz CRM; testadas em tests/panel-rates.test.ts.

export interface AttendanceDay {
  day: string;
  new_leads: number;
  scheduled: number;
  scheduled_from_ads: number;
  confirmed: number;
  attended: number;
  no_show: number;
  won: number;
  lost: number;
}

export type AttendanceTotals = Omit<AttendanceDay, "day">;

export function sumAttendance(days: AttendanceDay[]): AttendanceTotals {
  return days.reduce<AttendanceTotals>(
    (sum, day) => ({
      new_leads: sum.new_leads + day.new_leads,
      scheduled: sum.scheduled + day.scheduled,
      scheduled_from_ads: sum.scheduled_from_ads + day.scheduled_from_ads,
      confirmed: sum.confirmed + day.confirmed,
      attended: sum.attended + day.attended,
      no_show: sum.no_show + day.no_show,
      won: sum.won + day.won,
      lost: sum.lost + day.lost,
    }),
    { new_leads: 0, scheduled: 0, scheduled_from_ads: 0, confirmed: 0, attended: 0, no_show: 0, won: 0, lost: 0 },
  );
}

/** Taxa entre 0 e 1. Sem base ou acima de 100% (contagens de dias diferentes) vira null ("-"). */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  const value = numerator / denominator;
  return value > 1 ? null : value;
}

export interface AttendanceRates {
  scheduling: number | null;
  confirmation: number | null;
  attendance: number | null;
  closing: number | null;
  leadToWon: number | null;
  fromAds: number | null;
}

export function attendanceRates(t: AttendanceTotals): AttendanceRates {
  return {
    scheduling: rate(t.scheduled, t.new_leads),
    confirmation: rate(t.confirmed, t.scheduled),
    attendance: rate(t.attended, t.attended + t.no_show),
    closing: rate(t.won, t.attended),
    leadToWon: rate(t.won, t.new_leads),
    fromAds: rate(t.scheduled_from_ads, t.scheduled),
  };
}

export type GoalState = "reached" | "early" | "on_pace" | "behind";

export interface GoalProgress {
  goal: number;
  done: number;
  expected: number;
  pace: number;
  perDayNeeded: number;
  state: GoalState;
}

/**
 * Meta do mês: esperado = meta × dia ÷ dias do mês; ritmo = feito ÷ dia × dias do mês;
 * falta por dia = ⌈(meta − feito) ÷ dias restantes⌉. Nos 2 primeiros dias o ritmo ainda não diz nada.
 */
export function goalProgress(goal: number, done: number, dayOfMonth: number, daysInMonth: number): GoalProgress {
  const expected = Math.round((goal * dayOfMonth) / daysInMonth);
  const pace = Math.round((done / Math.max(1, dayOfMonth)) * daysInMonth);
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  const perDayNeeded = Math.max(0, Math.ceil((goal - done) / daysLeft));
  const state: GoalState = done >= goal
    ? "reached"
    : dayOfMonth < 3
    ? "early"
    : pace >= goal
    ? "on_pace"
    : "behind";
  return { goal, done, expected, pace, perDayNeeded, state };
}

export function formatPercent(value: number | null, digits = 0): string {
  return value === null ? "-" : `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

export function formatCurrency(value: number | null): string {
  return value === null
    ? "-"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null ? "-" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
