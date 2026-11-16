import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isDemoRoute } from "@/lib/demoMode";
import { getSegmentTerms, isOrganizationSegment, type OrganizationSegment } from "@/lib/segmentTerms";

const queryKey = (organizationId: string | null) => ["organization-segment", organizationId] as const;

/**
 * Segmento da organização (genérico ou consórcio). Sem linha em organization_settings,
 * ou se a tabela ainda não existir no banco, vale "generico". As telas de demonstração
 * usam consórcio, que é o segmento de todos os clientes hoje.
 */
export function useOrganizationSegment() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();

  const query = useQuery({
    queryKey: queryKey(organizationId),
    queryFn: async (): Promise<OrganizationSegment> => {
      if (!organizationId) return "generico";
      const { data, error } = await supabase
        .from("organization_settings")
        .select("segment")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        console.warn("[segment] configuração da organização indisponível:", error.message);
        return "generico";
      }
      return isOrganizationSegment(data?.segment) ? data.segment : "generico";
    },
    enabled: !demo && !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  const segment: OrganizationSegment = demo ? "consorcio" : query.data ?? "generico";
  return {
    segment,
    isConsorcio: segment === "consorcio",
    terms: getSegmentTerms(segment),
    loading: !demo && query.isLoading,
  };
}

/** Atalho para quem só precisa dos rótulos. */
export const useSegmentTerms = () => useOrganizationSegment().terms;

export function useSetOrganizationSegment() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (segment: OrganizationSegment) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { error } = await supabase.rpc("set_organization_segment", {
        p_organization_id: organizationId,
        p_segment: segment,
      });
      if (error) throw error;
      return segment;
    },
    onSuccess: (segment) => {
      queryClient.setQueryData(queryKey(organizationId), segment);
    },
  });
}
