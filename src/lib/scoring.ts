// Ranking e pontuação (Fase 2): regras puras usadas pelas telas e pelos testes.
// A pontuação em si é calculada no banco (score_events / ranking_board).

export type ScoreKind =
  | "venda"
  | "reuniao_agendada"
  | "reuniao_feita"
  | "resposta_5min"
  | "resposta_15min"
  | "meta_batida"
  | "recorde_pessoal";

export const SCORE_KINDS: Array<{ kind: ScoreKind; label: string; points: number; dailyCap: number | null; hint: string }> = [
  { kind: "venda", label: "Venda", points: 100, dailyCap: null, hint: "Cota vendida ou lead na etapa de ganho" },
  { kind: "reuniao_agendada", label: "Reunião agendada", points: 10, dailyCap: 100, hint: "Lead entrou na etapa ligada a agendamento" },
  { kind: "reuniao_feita", label: "Reunião feita", points: 25, dailyCap: null, hint: "Lead entrou na etapa ligada a comparecimento" },
  { kind: "resposta_5min", label: "Resposta em até 5 min", points: 5, dailyCap: 50, hint: "Respondeu o lead no WhatsApp em até 5 minutos" },
  { kind: "resposta_15min", label: "Resposta em até 15 min", points: 2, dailyCap: 20, hint: "Respondeu o lead no WhatsApp em até 15 minutos" },
  { kind: "meta_batida", label: "Meta do mês batida", points: 300, dailyCap: null, hint: "Bateu a meta mensal de produção" },
  { kind: "recorde_pessoal", label: "Recorde pessoal", points: 100, dailyCap: null, hint: "Maior produção mensal da própria história" },
];

export const scoreKindLabel = (kind: string) => SCORE_KINDS.find((k) => k.kind === kind)?.label ?? kind;

export type RankingPeriod = "today" | "week" | "month";

const BRT = "America/Sao_Paulo";

/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export function brtDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Intervalo do período em datas de Brasília. Semana começa na segunda. */
export function periodRange(period: RankingPeriod, now: Date = new Date()): { from: string; to: string } {
  const today = brtDate(now);
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
    const sinceMonday = (weekday + 6) % 7;
    return { from: addDays(today, -sinceMonday), to: today };
  }
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Mesmo período, encerrado ontem (para a seta de subida/descida). Null para "hoje" ou no 1º dia. */
export function periodUntilYesterday(period: RankingPeriod, now: Date = new Date()): { from: string; to: string } | null {
  if (period === "today") return null;
  const { from, to } = periodRange(period, now);
  const yesterday = addDays(to, -1);
  return yesterday < from ? null : { from, to: yesterday };
}

export type RankingMetric = "production" | "sales" | "points" | "conversion";

export interface RankingRow {
  user_id: string;
  production: number | null;
  sales: number;
  points: number;
  leads_received: number;
  meetings_scheduled: number;
  meetings_done: number;
  fast_replies: number;
}

/** Conversão do vendedor: vendas ÷ leads recebidos. Null sem leads recebidos. */
export const conversionRate = (row: Pick<RankingRow, "sales" | "leads_received">): number | null =>
  row.leads_received > 0 ? row.sales / row.leads_received : null;

export function metricValue(row: RankingRow, metric: RankingMetric): number | null {
  switch (metric) {
    case "production":
      return row.production;
    case "sales":
      return row.sales;
    case "points":
      return row.points;
    case "conversion":
      return conversionRate(row);
  }
}

export interface RankedRow<T extends RankingRow> {
  row: T;
  rank: number;
  value: number | null;
}

/**
 * Ordena pela métrica, com empates na mesma posição (1, 2, 2, 4). Desempate visual por pontos.
 * Linhas sem valor (produção escondida ou conversão sem leads) vão para o fim, sem posição.
 */
export function rankRows<T extends RankingRow>(rows: T[], metric: RankingMetric): Array<RankedRow<T>> {
  const withValue = rows
    .map((row) => ({ row, value: metricValue(row, metric) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return b.row.points - a.row.points;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      if (b.value !== a.value) return b.value - a.value;
      return b.row.points - a.row.points;
    });

  const ranked: Array<RankedRow<T>> = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  withValue.forEach((item, index) => {
    if (item.value === null) {
      ranked.push({ ...item, rank: 0 });
      return;
    }
    const rank = item.value === lastValue ? lastRank : index + 1;
    lastValue = item.value;
    lastRank = rank;
    ranked.push({ ...item, rank });
  });
  return ranked;
}

/** Quantas posições o vendedor subiu (positivo) ou desceu (negativo) desde ontem. */
export function rankDelta(currentRank: number, previousRank: number | undefined): number {
  if (!currentRank || !previousRank) return 0;
  return previousRank - currentRank;
}

/** Quanto falta para alcançar quem está logo acima. Null para o primeiro ou sem valor. */
export function gapToNext<T extends RankingRow>(ranked: Array<RankedRow<T>>, userId: string): { gap: number; target: T } | null {
  const index = ranked.findIndex((r) => r.row.user_id === userId);
  if (index <= 0) return null;
  const me = ranked[index];
  if (me.value === null) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const other = ranked[i];
    if (other.value !== null && other.value > me.value) {
      return { gap: other.value - me.value, target: other.row };
    }
  }
  return null;
}

/** Soma as linhas por equipe. Quem está em mais de uma equipe conta em todas. */
export function aggregateByTeam<T extends RankingRow>(
  rows: T[],
  memberships: Array<{ team_id: string; user_id: string }>,
): Array<RankingRow & { team_id: string; members: number }> {
  const byUser = new Map(rows.map((row) => [row.user_id, row]));
  const teams = new Map<string, RankingRow & { team_id: string; members: number }>();
  for (const { team_id, user_id } of memberships) {
    const row = byUser.get(user_id);
    if (!row) continue;
    const current = teams.get(team_id) ?? {
      team_id,
      user_id: team_id,
      members: 0,
      production: 0,
      sales: 0,
      points: 0,
      leads_received: 0,
      meetings_scheduled: 0,
      meetings_done: 0,
      fast_replies: 0,
    };
    current.members += 1;
    current.production = current.production === null || row.production === null ? null : current.production + row.production;
    current.sales += row.sales;
    current.points += row.points;
    current.leads_received += row.leads_received;
    current.meetings_scheduled += row.meetings_scheduled;
    current.meetings_done += row.meetings_done;
    current.fast_replies += row.fast_replies;
    teams.set(team_id, current);
  }
  return [...teams.values()];
}
