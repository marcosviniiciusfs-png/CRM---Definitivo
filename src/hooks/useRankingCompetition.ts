import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";

interface RankingCompetition {
  id: string;
  organization_id: string;
  title: string;
  is_active: boolean;
  reveal_at: string | null;
  revealed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface UseRankingCompetitionReturn {
  competition: RankingCompetition | null;
  isHiddenMode: boolean;
  isActive: boolean;
  isRevealed: boolean;
  isLoading: boolean;
  revealCompetition: () => Promise<void>;
  isAdmin: boolean;
  shouldFilterByTeam: boolean;
}

export function useRankingCompetition(organizationId: string | null): UseRankingCompetitionReturn {
  const queryClient = useQueryClient();
  const { permissions } = useOrganization();
  const isAdmin = permissions.role === 'owner' || permissions.role === 'admin';

  const queryKey = ['ranking-competition', organizationId];

  const { data: competition, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<RankingCompetition | null> => {
      if (!organizationId) return null;

      const { data, error } = await supabase
        .from('ranking_competitions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[RankingCompetition] Error fetching:', error);
        return null;
      }
      return data;
    },
    enabled: !!organizationId,
    staleTime: 0,
  });

  const isActive = competition?.is_active === true;
  const isRevealed = !!competition?.revealed_at;

  // Auto-reveal: check if reveal_at has passed
  useEffect(() => {
    if (!competition || !isActive || isRevealed || !organizationId) return;
    if (!competition.reveal_at) return;

    const now = new Date();
    const revealAt = new Date(competition.reveal_at);

    if (revealAt <= now) {
      supabase.rpc('reveal_ranking_competition', { p_org_id: organizationId }).then(({ data }) => {
        if (data) {
          queryClient.invalidateQueries({ queryKey });
        }
      });
    }
  }, [competition, isActive, isRevealed, organizationId, queryKey, queryClient]);

  // Periodic check for auto-reveal (every 30 seconds)
  useEffect(() => {
    if (!competition || !isActive || isRevealed || !organizationId || !competition.reveal_at) return;

    const interval = setInterval(() => {
      const now = new Date();
      const revealAt = new Date(competition.reveal_at!);
      if (revealAt <= now) {
        supabase.rpc('reveal_ranking_competition', { p_org_id: organizationId }).then(({ data }) => {
          if (data) {
            queryClient.invalidateQueries({ queryKey });
          }
        });
        clearInterval(interval);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [competition, isActive, isRevealed, organizationId, queryKey, queryClient]);

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`ranking-competition-${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ranking_competitions',
        filter: `organization_id=eq.${organizationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryKey, queryClient]);

  // Manual reveal
  const revealCompetition = useCallback(async () => {
    if (!organizationId || !competition) return;

    const { error } = await supabase
      .from('ranking_competitions')
      .update({ revealed_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq('id', competition.id);

    if (error) {
      console.error('[RankingCompetition] Error revealing:', error);
    } else {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [organizationId, competition, queryKey, queryClient]);

  // isHiddenMode: active + not revealed + NOT admin
  const isHiddenMode = isActive && !isRevealed && !isAdmin;

  // shouldFilterByTeam: if admin → false (admins see everything)
  //                   if no competition exists → true (filter by team by default)
  //                   if competition exists but not revealed → true (filter by team)
  //                   if competition exists and IS revealed → false (everyone sees everything)
  const shouldFilterByTeam = !isAdmin && (!competition || !isRevealed);

  return {
    competition,
    isHiddenMode,
    isActive,
    isRevealed,
    isLoading,
    revealCompetition,
    isAdmin,
    shouldFilterByTeam,
  };
}
