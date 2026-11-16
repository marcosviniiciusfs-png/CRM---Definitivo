// Gamificação (Fase 5): níveis, ritmo de metas e catálogo de medalhas. Regras puras.

export type GoalMetric = "producao" | "vendas" | "reunioes" | "pontos";

export const GOAL_METRICS: Array<{ value: GoalMetric; label: string; money: boolean }> = [
  { value: "producao", label: "Produção", money: true },
  { value: "vendas", label: "Vendas", money: false },
  { value: "reunioes", label: "Reuniões feitas", money: false },
  { value: "pontos", label: "Pontos", money: false },
];

export const goalMetricLabel = (metric: string) => GOAL_METRICS.find((m) => m.value === metric)?.label ?? metric;
export const isMoneyMetric = (metric: string) => metric === "producao";

// Níveis: o nível n exige 50·(n−1)² pontos acumulados. Nível 1 com 0, 2 com 50, 5 com 800, 10 com 4.050.
export const MAX_LEVEL = 50;

export function levelFromPoints(points: number): number {
  const safe = Math.max(0, points);
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(safe / 50)) + 1);
}

export const pointsForLevel = (level: number) => 50 * (Math.max(1, level) - 1) ** 2;

export function levelProgress(points: number): { level: number; current: number; next: number | null; ratio: number } {
  const level = levelFromPoints(points);
  const current = pointsForLevel(level);
  if (level >= MAX_LEVEL) return { level, current, next: null, ratio: 1 };
  const next = pointsForLevel(level + 1);
  return { level, current, next, ratio: (points - current) / (next - current) };
}

export function levelTier(level: number): "Bronze" | "Prata" | "Ouro" | "Diamante" {
  if (level >= 30) return "Diamante";
  if (level >= 15) return "Ouro";
  if (level >= 6) return "Prata";
  return "Bronze";
}

/** Dias úteis (segunda a sexta) de um mês, e quantos já passaram até a data (inclusive). */
export function businessDays(isoDate: string): { total: number; elapsed: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let total = 0;
  let elapsed = 0;
  for (let d = 1; d <= last; d += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    total += 1;
    if (d <= day) elapsed += 1;
  }
  return { total, elapsed };
}

export type PaceStatus = "batida" | "no_ritmo" | "abaixo";

/**
 * Ritmo da meta: compara o realizado com o esperado pelos dias úteis já passados.
 * Devolve quanto falta e quanto precisa por dia útil restante.
 */
export function goalPace(achieved: number, target: number, isoToday: string) {
  const { total, elapsed } = businessDays(isoToday);
  const expected = total > 0 ? (target * elapsed) / total : target;
  const remaining = Math.max(0, target - achieved);
  const daysLeft = Math.max(0, total - elapsed);
  const perDay = remaining > 0 ? remaining / Math.max(1, daysLeft) : 0;
  const status: PaceStatus = achieved >= target ? "batida" : achieved >= expected * 0.95 ? "no_ritmo" : "abaixo";
  return { expected, remaining, daysLeft, perDay, status, ratio: target > 0 ? Math.min(1, achieved / target) : 0 };
}

export const ACHIEVEMENTS: Record<string, { label: string; description: string }> = {
  primeira_venda: { label: "Primeira venda", description: "Fechou a primeira venda no KairoZ." },
  cinco_vendas_mes: { label: "5 vendas no mês", description: "Fechou 5 vendas num mesmo mês." },
  dez_reunioes_mes: { label: "10 reuniões no mês", description: "Fez 10 reuniões num mesmo mês." },
  resposta_relampago: { label: "Resposta relâmpago", description: "Respondeu 20 leads em até 5 minutos numa semana." },
  meta_batida: { label: "Meta batida", description: "Bateu a meta do mês." },
  recorde_pessoal: { label: "Recorde pessoal", description: "Superou a própria maior produção mensal." },
  campeao_campanha: { label: "Campeão de campanha", description: "Venceu uma campanha." },
};

export const achievementLabel = (code: string) => ACHIEVEMENTS[code]?.label ?? code;

export type CampaignFormat = "corrida" | "meta" | "equipes" | "batalha";

export const CAMPAIGN_FORMATS: Array<{ value: CampaignFormat; label: string; description: string }> = [
  { value: "corrida", label: "Corrida", description: "Quem tiver o maior resultado no período vence." },
  { value: "meta", label: "Meta", description: "Todos que alcançarem o alvo ganham." },
  { value: "equipes", label: "Equipe contra equipe", description: "Vence a equipe com o maior resultado somado." },
  { value: "batalha", label: "1 contra 1", description: "Dois vendedores frente a frente." },
];

export const campaignFormatLabel = (format: string) => CAMPAIGN_FORMATS.find((f) => f.value === format)?.label ?? format;

export type CampaignStatus = "agendada" | "em_andamento" | "encerrada";

export function campaignStatus(campaign: { starts_on: string; ends_on: string; closed_at: string | null }, isoToday: string): CampaignStatus {
  if (campaign.closed_at || campaign.ends_on < isoToday) return "encerrada";
  if (campaign.starts_on > isoToday) return "agendada";
  return "em_andamento";
}
