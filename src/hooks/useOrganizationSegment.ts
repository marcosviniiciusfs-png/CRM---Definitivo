import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isDemoRoute } from "@/lib/demoMode";
import { getSegmentTerms, isOrganizationSegment, type OrganizationSegment } from "@/lib/segmentTerms";
import type { SaleCountsOn } from "@/lib/consortium";

interface OrganizationSettings {
  segment: OrganizationSegment;
  saleRule: SaleCountsOn;
  rankingShowValues: boolean;
}

const DEFAULT_SETTINGS: OrganizationSettings = { segment: "generico", saleRule: "adesao", rankingShowValues: true };
const DEMO_SETTINGS: OrganizationSettings = { segment: "consorcio", saleRule: "adesao", rankingShowValues: true };

export const organizationSettingsKey = (organizationId: string | null) => ["organization-settings", organizationId] as const;

/**
 * Configurações de produto da organização: segmento (genérico ou consórcio) e, no consórcio,
 * quando a venda conta. Sem linha em organization_settings, ou se a tabela ainda não existir
 * no banco, vale o padrão (genérico, na adesão). As telas de demonstração usam consórcio.
 */
export function useOrganizationSegment() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();

  const query = useQuery({
    queryKey: organizationSettingsKey(organizationId),
    queryFn: async (): Promise<OrganizationSettings> => {
      if (!organizationId) return DEFAULT_SETTINGS;
      const { data, error } = await supabase
        .from("organization_settings")
        .select("segment, consortium_sale_counts_on, ranking_show_values")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        console.warn("[segment] configuração da organização indisponível:", error.message);
        return DEFAULT_SETTINGS;
      }
      return {
        segment: isOrganizationSegment(data?.segment) ? data.segment : "generico",
        saleRule: data?.consortium_sale_counts_on === "primeira_parcela" ? "primeira_parcela" : "adesao",
        rankingShowValues: data?.ranking_show_values ?? true,
      };
    },
    enabled: !demo && !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  const settings = demo ? DEMO_SETTINGS : query.data ?? DEFAULT_SETTINGS;
  return {
    segment: settings.segment,
    saleRule: settings.saleRule,
    rankingShowValues: settings.rankingShowValues,
    isConsorcio: settings.segment === "consorcio",
    terms: getSegmentTerms(settings.segment),
    loading: !demo && query.isLoading,
  };
}

/** Atalho para quem só precisa dos rótulos. */
export const useSegmentTerms = () => useOrganizationSegment().terms;

function useUpdateSettingsCache() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return (patch: Partial<OrganizationSettings>) =>
    queryClient.setQueryData<OrganizationSettings>(organizationSettingsKey(organizationId), (current) => ({
      ...(current ?? DEFAULT_SETTINGS),
      ...patch,
    }));
}

export function useSetOrganizationSegment() {
  const { organizationId } = useOrganization();
  const updateCache = useUpdateSettingsCache();

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
    onSuccess: (segment) => updateCache({ segment }),
  });
}

export function useSetConsortiumSaleRule() {
  const { organizationId } = useOrganization();
  const updateCache = useUpdateSettingsCache();

  return useMutation({
    mutationFn: async (rule: SaleCountsOn) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { error } = await supabase.rpc("set_consortium_sale_rule", {
        p_organization_id: organizationId,
        p_rule: rule,
      });
      if (error) throw error;
      return rule;
    },
    onSuccess: (saleRule) => updateCache({ saleRule }),
  });
}

export function useSetRankingShowValues() {
  const { organizationId } = useOrganization();
  const updateCache = useUpdateSettingsCache();

  return useMutation({
    mutationFn: async (show: boolean) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { error } = await supabase.rpc("set_ranking_show_values", {
        p_organization_id: organizationId,
        p_show: show,
      });
      if (error) throw error;
      return show;
    },
    onSuccess: (rankingShowValues) => updateCache({ rankingShowValues }),
  });
}
