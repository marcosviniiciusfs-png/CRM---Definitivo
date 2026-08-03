export type DistributionWeights = Record<string, number>;

export function normalizeWeights(agentIds: string[], rawWeights: unknown): DistributionWeights {
  if (agentIds.length === 0) return {};
  const source = rawWeights && typeof rawWeights === "object" ? rawWeights as Record<string, unknown> : {};
  const valid = agentIds.map((id) => {
    const value = Number(source[id]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const total = valid.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const equal = 100 / agentIds.length;
    return Object.fromEntries(agentIds.map((id) => [id, equal]));
  }
  return Object.fromEntries(agentIds.map((id, index) => [id, (valid[index] / total) * 100]));
}

export function selectByPercentage<T extends { user_id: string }>(agents: T[], rawWeights: unknown, historicalCounts: Map<string, number> = new Map()): T | null {
  if (agents.length === 0) return null;
  const weights = normalizeWeights(agents.map((agent) => agent.user_id), rawWeights);
  const assignedTotal = agents.reduce((sum, agent) => sum + (historicalCounts.get(agent.user_id) || 0), 0);
  return agents.reduce((best, agent) => {
    const deficit = ((assignedTotal + 1) * weights[agent.user_id] / 100) - (historicalCounts.get(agent.user_id) || 0);
    const bestDeficit = ((assignedTotal + 1) * weights[best.user_id] / 100) - (historicalCounts.get(best.user_id) || 0);
    return deficit > bestDeficit ? agent : best;
  }, agents[0]);
}

export function buildPercentageSequence<T extends { user_id: string }>(agents: T[], rawWeights: unknown, quantity: number, initialCounts: Map<string, number> = new Map()): T[] {
  const counts = new Map(initialCounts);
  const sequence: T[] = [];
  for (let index = 0; index < quantity; index++) {
    const selected = selectByPercentage(agents, rawWeights, counts);
    if (!selected) break;
    sequence.push(selected);
    counts.set(selected.user_id, (counts.get(selected.user_id) || 0) + 1);
  }
  return sequence;
}
