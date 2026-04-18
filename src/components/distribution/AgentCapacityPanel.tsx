import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface AgentCapacity {
  userId: string;
  name: string;
  maxCapacity: number;
  currentLoad: number;
  capacityEnabled: boolean;
  percentage: number;
}

function getBarColor(percentage: number, enabled: boolean): string {
  if (!enabled) return 'bg-muted';
  if (percentage > 85) return 'bg-orange-500';
  if (percentage > 60) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AgentCapacityPanel({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ['agent-capacity', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: settings } = await supabase
        .from('agent_distribution_settings')
        .select('user_id, max_capacity, capacity_enabled, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (!settings?.length) return [];

      const userIds = settings.map(s => s.user_id);

      const [profilesRes, leadsRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
        supabase
          .from('leads')
          .select('responsavel_user_id')
          .in('responsavel_user_id', userIds)
          .not('stage', 'in', '(ganho,perdido)'),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.full_name]));
      const loadCounts = new Map<string, number>();
      for (const lead of leadsRes.data || []) {
        const uid = (lead as any).responsavel_user_id;
        loadCounts.set(uid, (loadCounts.get(uid) || 0) + 1);
      }

      return settings.map(s => {
        const currentLoad = loadCounts.get(s.user_id) || 0;
        const enabled = s.capacity_enabled ?? false;
        const max = s.max_capacity || 50;
        return {
          userId: s.user_id,
          name: profileMap.get(s.user_id) || 'Agente',
          maxCapacity: max,
          currentLoad,
          capacityEnabled: enabled,
          percentage: enabled ? Math.min(100, Math.round((currentLoad / max) * 100)) : 0,
        } as AgentCapacity;
      }).sort((a, b) => b.percentage - a.percentage);
    },
    staleTime: 30 * 1000,
    enabled: !!organizationId,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['agent-capacity'] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Capacidade dos Agentes
      </h3>
      <div className="space-y-3 max-h-[250px] overflow-y-auto scrollbar-subtle">
        {agents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum agente ativo
          </p>
        ) : (
          agents.map(agent => (
            <div key={agent.userId} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                {getInitials(agent.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate">{agent.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                    {agent.capacityEnabled ? `${agent.currentLoad}/${agent.maxCapacity}` : `${agent.currentLoad}`}
                  </span>
                </div>
                {agent.capacityEnabled ? (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getBarColor(agent.percentage, true)}`}
                      style={{ width: `${agent.percentage}%` }}
                    />
                  </div>
                ) : (
                  <div className="h-1.5 bg-muted/50 rounded-full" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
