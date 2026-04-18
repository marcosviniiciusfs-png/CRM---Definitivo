import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useRouletteConversion(configId: string) {
  return useQuery({
    queryKey: ['roulette-conversion', configId],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('lead_distribution_history')
        .select('created_at, lead_id')
        .eq('config_id', configId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by day (last 7 days)
      const days: Record<string, { total: number; converted: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days[key] = { total: 0, converted: 0 };
      }

      for (const row of data || []) {
        const day = row.created_at.split('T')[0];
        if (days[day]) {
          days[day].total++;
        }
      }

      // Get converted leads count (status = 'ganho')
      const leadIds = (data || []).map(r => r.lead_id).filter(Boolean);
      if (leadIds.length > 0) {
        const { data: convertedLeads } = await supabase
          .from('leads')
          .select('id, funnel_stage_id, created_at')
          .in('id', leadIds);

        // Count leads per day as "converted" (distributed = engagement)
        for (const lead of convertedLeads || []) {
          const day = (lead as any).created_at?.split('T')[0];
          if (day && days[day]) {
            days[day].converted++;
          }
        }
      }

      // Return array of 7 percentages
      return Object.values(days).map(d =>
        d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0
      );
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!configId,
  });
}
