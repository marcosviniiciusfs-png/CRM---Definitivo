import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QueryResult<T> {
  data: T | null;
  error: Error | null;
}

// Generic parallel query executor
export async function executeParallelQueries<T extends Record<string, any>>(
  queries: Record<keyof T, () => Promise<any>>
): Promise<{ [K in keyof T]: QueryResult<T[K]> }> {
  const keys = Object.keys(queries) as (keyof T)[];
  const promises = keys.map(key => 
    queries[key]()
      .then(result => ({ key, data: result.data, error: result.error }))
      .catch(error => ({ key, data: null, error }))
  );
  
  const results = await Promise.all(promises);
  
  return results.reduce((acc, { key, data, error }) => {
    acc[key as keyof T] = { data, error };
    return acc;
  }, {} as { [K in keyof T]: QueryResult<T[K]> });
}

// Hook for chat data loading with parallel queries
export function useChatParallelQueries() {
  const [loading, setLoading] = useState(false);

  const loadChatData = useCallback(async (userId: string, organizationId: string, canViewAllLeads: boolean) => {
    setLoading(true);
    
    try {
      // Build leads query based on permissions
      const leadsQuery = () => {
        let query = supabase
          .from("leads")
          .select("id, nome_lead, telefone_lead, email, stage, avatar_url, is_online, last_seen, last_message_at, source, responsavel, responsavel_user_id, created_at, updated_at, organization_id")
          .eq("organization_id", organizationId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(300);
        
        if (!canViewAllLeads) {
          query = query.eq("responsavel_user_id", userId);
        }
        
        return query;
      };

      // Execute all queries in parallel
      const [leadsResult, tagsResult, profileResult] = await Promise.all([
        leadsQuery(),
        supabase
          .from("lead_tags")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("profiles")
          .select("full_name, notification_sound_enabled")
          .eq("user_id", userId)
          .single()
      ]);

      const leads = leadsResult.data || [];
      
      // Load tag assignments in parallel if we have leads
      let tagAssignments: Array<{ lead_id: string; tag_id: string }> = [];
      if (leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        const { data } = await supabase
          .from("lead_tag_assignments")
          .select("lead_id, tag_id")
          .in("lead_id", leadIds);
        tagAssignments = data || [];
      }

      return {
        leads,
        tags: tagsResult.data || [],
        profile: profileResult.data,
        tagAssignments,
        errors: {
          leads: leadsResult.error,
          tags: tagsResult.error,
          profile: profileResult.error
        }
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loadChatData, loading };
}

// Hook for leads page data loading with parallel queries
export function useLeadsParallelQueries() {
  const [loading, setLoading] = useState(false);

  const loadFilterData = useCallback(async (organizationId?: string) => {
    setLoading(true);
    
    try {
      // Execute all filter data queries in parallel (usando RPC segura)
      const [membersResult, funnelsResult, tagsResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase
          .from('sales_funnels')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('lead_tags')
          .select('id, name, color')
          .order('name')
      ]);

      // Load profiles for members in parallel
      let colaboradores: any[] = [];
      if (membersResult.data) {
        const userIds = membersResult.data.filter(m => m.user_id).map(m => m.user_id);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          
          const profilesMap = profiles?.reduce((acc, p) => {
            if (p.user_id) acc[p.user_id] = p.full_name;
            return acc;
          }, {} as Record<string, string>) || {};
          
          colaboradores = membersResult.data.map(m => ({
            user_id: m.user_id,
            email: m.email,
            full_name: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id] : null,
          }));
        }
      }

      return {
        colaboradores,
        funnels: funnelsResult.data || [],
        tags: tagsResult.data || [],
        errors: {
          members: membersResult.error,
          funnels: funnelsResult.error,
          tags: tagsResult.error
        }
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loadFilterData, loading };
}

// Hook for dashboard data loading with parallel queries
export function useDashboardParallelQueries() {
  const loadDashboardData = useCallback(async (organizationId: string, userId: string) => {
    // Execute all dashboard queries in parallel
    const [leadsResult, goalsResult, teamsResult, activitiesResult] = await Promise.all([
      supabase
        .from('leads')
        .select('id, valor, funnel_stage_id, created_at, updated_at, responsavel_user_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('goals')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('teams')
        .select('id, name')
        .eq('organization_id', organizationId),
      supabase
        .from('system_activities')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20)
    ]);

    return {
      leads: leadsResult.data || [],
      goal: goalsResult.data,
      teams: teamsResult.data || [],
      activities: activitiesResult.data || [],
      errors: {
        leads: leadsResult.error,
        goals: goalsResult.error,
        teams: teamsResult.error,
        activities: activitiesResult.error
      }
    };
  }, []);

  return { loadDashboardData };
}

// Hook for pipeline data loading with parallel queries
export function usePipelineParallelQueries() {
  const loadPipelineData = useCallback(async (organizationId: string, funnelId: string, canViewAllLeads: boolean, userId?: string) => {
    // Execute funnel stages and leads queries in parallel
    const [stagesResult, leadsResult] = await Promise.all([
      supabase
        .from('funnel_stages')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('position'),
      (() => {
        let query = supabase
          .from('leads')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('funnel_id', funnelId);
        
        if (!canViewAllLeads && userId) {
          query = query.eq('responsavel_user_id', userId);
        }
        
        return query.order('position');
      })()
    ]);

    const leads = leadsResult.data || [];
    
    // Load lead items and tags in parallel if we have leads
    let leadItems: any[] = [];
    let tagAssignments: any[] = [];
    
    if (leads.length > 0) {
      const leadIds = leads.map(l => l.id);
      
      const [itemsResult, tagsResult] = await Promise.all([
        supabase
          .from('lead_items')
          .select('*, items(*)')
          .in('lead_id', leadIds),
        supabase
          .from('lead_tag_assignments')
          .select('lead_id, tag_id, lead_tags(*)')
          .in('lead_id', leadIds)
      ]);
      
      leadItems = itemsResult.data || [];
      tagAssignments = tagsResult.data || [];
    }

    return {
      stages: stagesResult.data || [],
      leads,
      leadItems,
      tagAssignments,
      errors: {
        stages: stagesResult.error,
        leads: leadsResult.error
      }
    };
  }, []);

  return { loadPipelineData };
}
