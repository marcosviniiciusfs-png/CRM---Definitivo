export type RedistributionReason = 'inactivity' | 'lost' | 'manual';

/**
 * Mapeia o trigger_source gravado em lead_distribution_history para
 * a categoria visual usada nos cards do Pipeline.
 *
 * - 'lost_redistribution' (vindo de redistribute-lost-leads) -> 'lost'
 * - 'manual' (redistribuir colaborador via UI) -> 'manual'
 * - tudo o mais (incluindo 'auto_redistribution', undefined, ou
 *   trigger_sources antigos sem categoria) -> 'inactivity'
 *
 * O default 'inactivity' preserva a aparencia atual (badge azul) para
 * dados historicos sem categoria conhecida.
 */
export function mapTriggerSourceToReason(triggerSource?: string | null): RedistributionReason {
  if (triggerSource === 'lost_redistribution') return 'lost';
  if (triggerSource === 'manual') return 'manual';
  return 'inactivity';
}
