// Atendimento por WhatsApp (Fase A): formatação e regras de leitura das métricas por vendedor.

export interface AttendanceRow {
  user_id: string;
  channels: number;
  channels_connected: number;
  conversations: number;
  answered: number;
  pending: number;
  answered_5min: number;
  avg_seconds: number | null;
  median_seconds: number | null;
  first_response_avg_seconds: number | null;
  oldest_pending_at: string | null;
}

/** 45 -> "45 s"; 180 -> "3 min"; 4800 -> "1 h 20 min"; 200000 -> "2 d 7 h". Null vira "—". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours} h ${restMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

/** Conversas respondidas ÷ conversas recebidas. Null sem conversas. */
export function responseRate(row: Pick<AttendanceRow, "answered" | "conversations">): number | null {
  return row.conversations > 0 ? row.answered / row.conversations : null;
}

export const formatRate = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

export type AttendanceTone = "bom" | "atencao" | "ruim" | "sem_dados";

/** Mediana até 5 min é boa, até 30 min pede atenção, acima disso é ruim. */
export function speedTone(medianSeconds: number | null): AttendanceTone {
  if (medianSeconds === null) return "sem_dados";
  if (medianSeconds <= 300) return "bom";
  if (medianSeconds <= 1800) return "atencao";
  return "ruim";
}

/** Taxa de resposta: 90% ou mais é boa, 70% pede atenção. */
export function rateTone(rate: number | null): AttendanceTone {
  if (rate === null) return "sem_dados";
  if (rate >= 0.9) return "bom";
  if (rate >= 0.7) return "atencao";
  return "ruim";
}

/** Totais da equipe: soma de contagens e média dos tempos ponderada pelas conversas respondidas. */
export function teamTotals(rows: AttendanceRow[]) {
  const conversations = rows.reduce((sum, r) => sum + r.conversations, 0);
  const answered = rows.reduce((sum, r) => sum + r.answered, 0);
  const pending = rows.reduce((sum, r) => sum + r.pending, 0);
  const answered5 = rows.reduce((sum, r) => sum + r.answered_5min, 0);
  const weighted = rows.reduce((sum, r) => sum + (r.avg_seconds ?? 0) * r.answered, 0);
  const withTime = rows.reduce((sum, r) => sum + (r.avg_seconds === null ? 0 : r.answered), 0);
  return {
    conversations,
    answered,
    pending,
    rate: conversations > 0 ? answered / conversations : null,
    within5min: answered > 0 ? answered5 / answered : null,
    avgSeconds: withTime > 0 ? weighted / withTime : null,
    channels: rows.reduce((sum, r) => sum + r.channels, 0),
    connected: rows.reduce((sum, r) => sum + r.channels_connected, 0),
  };
}
