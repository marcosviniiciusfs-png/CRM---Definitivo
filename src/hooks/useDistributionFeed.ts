import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DistributionFeedItem {
  id: string;
  leadName: string;
  agentName: string;
  source: string;
  leadScore: number;
  assignedAt: string;
  noAgent: boolean;
}

export function useDistributionFeed(organizationId: string | undefined) {
  const [items, setItems] = useState<DistributionFeedItem[]>([]);

  const fetchInitial = useCallback(async () => {
    if (!organizationId) return;

    const { data } = await supabase
      .from('lead_distribution_history')
      .select('id, lead_id, to_user_id, source_type, created_at, config_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data) return;

    const leadIds = data.map(d => d.lead_id).filter(Boolean);
    const agentIds = data.map(d => d.to_user_id).filter(Boolean);

    const [leadsRes, agentsRes] = await Promise.all([
      leadIds.length > 0
        ? supabase.from('leads').select('id, nome_lead, lead_score, source').in('id', leadIds)
        : { data: [] },
      agentIds.length > 0
        ? supabase.from('profiles').select('user_id, full_name').in('user_id', agentIds)
        : { data: [] },
    ]);

    const leadMap = new Map((leadsRes.data || []).map((l: any) => [l.id, l]));
    const agentMap = new Map((agentsRes.data || []).map((a: any) => [a.user_id, a]));

    const feedItems: DistributionFeedItem[] = data.map(row => {
      const lead = leadMap.get(row.lead_id);
      const agent = agentMap.get(row.to_user_id);
      return {
        id: row.id,
        leadName: lead?.nome_lead || 'Lead desconhecido',
        agentName: agent?.full_name || 'Sem agente',
        source: row.source_type || lead?.source || '',
        leadScore: lead?.lead_score || 0,
        assignedAt: row.created_at,
        noAgent: !row.to_user_id,
      };
    });

    setItems(feedItems);
  }, [organizationId]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel('live-distribution-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_distribution_history',
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;

          const [leadRes, agentRes] = await Promise.all([
            newRow.lead_id
              ? supabase.from('leads').select('nome_lead, lead_score, source').eq('id', newRow.lead_id).single()
              : { data: null },
            newRow.to_user_id
              ? supabase.from('profiles').select('full_name').eq('user_id', newRow.to_user_id).single()
              : { data: null },
          ]);

          const item: DistributionFeedItem = {
            id: newRow.id,
            leadName: (leadRes.data as any)?.nome_lead || 'Lead desconhecido',
            agentName: (agentRes.data as any)?.full_name || 'Sem agente',
            source: newRow.source_type || (leadRes.data as any)?.source || '',
            leadScore: (leadRes.data as any)?.lead_score || 0,
            assignedAt: newRow.created_at,
            noAgent: !newRow.to_user_id,
          };

          setItems(prev => [item, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return { items, refetch: fetchInitial };
}
