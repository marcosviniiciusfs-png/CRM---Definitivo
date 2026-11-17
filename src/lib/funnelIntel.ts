// Inteligência comercial: leitura do funil por coorte (funnel_intelligence). Regras puras.
import { brtDate } from "@/lib/scoring";

export interface FunnelStageStat {
  id: string;
  name: string;
  position: number;
  stage_type: string;
  is_final: boolean;
  linked_event: string | null;
  color: string | null;
  reached: number;
  avg_seconds_in_stage: number | null;
  current: number;
  stalled: number;
  lost_here: number;
}

export interface FunnelIntel {
  totals: { leads: number; won: number; lost: number; won_value: number; avg_days_to_win: number | null };
  stages: FunnelStageStat[];
}

export type IntelPreset = "7d" | "30d" | "this_month" | "last_month";

export const INTEL_PRESETS: Array<{ key: IntelPreset; label: string }> = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
];

function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function presetRange(preset: IntelPreset, now: Date = new Date()): { from: string; to: string } {
  const today = brtDate(now);
  if (preset === "7d") return { from: shift(today, -6), to: today };
  if (preset === "30d") return { from: shift(today, -29), to: today };
  if (preset === "this_month") return { from: `${today.slice(0, 8)}01`, to: today };
  const firstThisMonth = `${today.slice(0, 8)}01`;
  const lastDayPrev = shift(firstThisMonth, -1);
  return { from: `${lastDayPrev.slice(0, 8)}01`, to: lastDayPrev };
}

export interface FunnelStep {
  stage: FunnelStageStat;
  /** Parte dos leads da coorte que passaram pela etapa. */
  shareOfLeads: number | null;
  /** Dos que passaram pela etapa anterior, quantos chegaram a esta. Null na primeira etapa. */
  conversionFromPrevious: number | null;
}

/** Etapas do caminho de venda (sem "Perdido"), na ordem do funil, com as taxas entre elas. */
export function buildSteps(intel: FunnelIntel): FunnelStep[] {
  const main = intel.stages
    .filter((s) => s.stage_type !== "lost")
    .sort((a, b) => Number(a.is_final) - Number(b.is_final) || a.position - b.position);
  const total = intel.totals.leads;
  return main.map((stage, index) => {
    const previous = index > 0 ? main[index - 1] : null;
    return {
      stage,
      shareOfLeads: total > 0 ? stage.reached / total : null,
      conversionFromPrevious: previous && previous.reached > 0 ? Math.min(1, stage.reached / previous.reached) : null,
    };
  });
}

/** Maior queda entre duas etapas seguidas, ignorando etapas com poucos leads para não destacar ruído. */
export function biggestDrop(steps: FunnelStep[], minLeads = 5) {
  let best: { from: FunnelStageStat; to: FunnelStageStat; lossRate: number; lost: number } | null = null;
  for (let i = 1; i < steps.length; i += 1) {
    const from = steps[i - 1].stage;
    const to = steps[i].stage;
    if (from.reached < minLeads) continue;
    const lost = Math.max(0, from.reached - to.reached);
    const lossRate = lost / from.reached;
    if (!best || lossRate > best.lossRate) best = { from, to, lossRate, lost };
  }
  return best && best.lossRate > 0 ? best : null;
}

export const winRate = (intel: FunnelIntel) => (intel.totals.leads > 0 ? intel.totals.won / intel.totals.leads : null);

export function stalledTotal(intel: FunnelIntel): number {
  return intel.stages.filter((s) => !s.is_final).reduce((sum, s) => sum + s.stalled, 0);
}

/** Etapa aberta com mais leads parados há mais de 7 dias. */
export function worstStalledStage(intel: FunnelIntel): FunnelStageStat | null {
  const open = intel.stages.filter((s) => !s.is_final && s.stalled > 0);
  if (open.length === 0) return null;
  return open.reduce((a, b) => (b.stalled > a.stalled ? b : a));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Frases curtas para o gestor agir. */
export function buildInsights(intel: FunnelIntel): string[] {
  const out: string[] = [];
  if (intel.totals.leads === 0) return out;

  const drop = biggestDrop(buildSteps(intel));
  if (drop) {
    out.push(`A maior queda é de "${drop.from.name}" para "${drop.to.name}": ${pct(drop.lossRate)} dos leads (${drop.lost}) não passam dessa etapa.`);
  }

  const stalled = stalledTotal(intel);
  const worst = worstStalledStage(intel);
  const open = intel.stages.filter((s) => !s.is_final).reduce((sum, s) => sum + s.current, 0);
  if (stalled > 0 && worst && open > 0) {
    out.push(`${stalled} de ${open} leads abertos estão parados há mais de 7 dias, ${worst.stalled} deles em "${worst.name}".`);
  }

  const lostStage = intel.stages.filter((s) => s.lost_here > 0).sort((a, b) => b.lost_here - a.lost_here)[0];
  if (lostStage && intel.totals.lost > 0) {
    out.push(`A etapa que mais perde leads é "${lostStage.name}": ${lostStage.lost_here} de ${intel.totals.lost} perdas saíram dela.`);
  }

  if (intel.totals.avg_days_to_win !== null && intel.totals.won > 0) {
    out.push(`Quem fecha leva em média ${String(intel.totals.avg_days_to_win).replace(".", ",")} dias entre entrar e ganhar.`);
  }
  return out;
}
