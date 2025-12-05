import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrganizationMember {
  id: string;
  user_id: string | null;
  organization_id: string;
  role: string;
  created_at: string;
  email: string | null; // Mascarado para não-admins
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Hook seguro para buscar membros da organização
 * Usa a função RPC get_organization_members_masked para proteger emails
 */
export function useOrganizationMembers(organizationId?: string | null) {
  return useQuery({
    queryKey: ["organization-members-safe", organizationId],
    queryFn: async (): Promise<OrganizationMember[]> => {
      // Buscar membros usando função mascarada
      const { data: members, error } = await supabase.rpc('get_organization_members_masked');
      
      if (error) throw error;
      if (!members) return [];

      // Buscar profiles em paralelo
      const userIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
      
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
            return acc;
          }, {} as Record<string, { full_name: string | null; avatar_url: string | null }>);
        }
      }

      // Combinar dados
      return members.map((member: any) => ({
        ...member,
        full_name: member.user_id && profilesMap[member.user_id]?.full_name || null,
        avatar_url: member.user_id && profilesMap[member.user_id]?.avatar_url || null,
      }));
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

/**
 * Função utilitária para buscar membros sem usar hook
 * Para componentes que não podem usar hooks diretamente
 */
export async function fetchOrganizationMembersSafe(): Promise<OrganizationMember[]> {
  const { data: members, error } = await supabase.rpc('get_organization_members_masked');
  
  if (error) throw error;
  if (!members) return [];

  const userIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
  
  let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', userIds);
    
    if (profiles) {
      profilesMap = profiles.reduce((acc, p) => {
        acc[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        return acc;
      }, {} as Record<string, { full_name: string | null; avatar_url: string | null }>);
    }
  }

  return members.map((member: any) => ({
    ...member,
    full_name: member.user_id && profilesMap[member.user_id]?.full_name || null,
    avatar_url: member.user_id && profilesMap[member.user_id]?.avatar_url || null,
  }));
}
