import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { PlanDraft } from "@/lib/consortiumPlanImport";
import type { ProposalPayload } from "@/lib/consortiumProposal";

export type ConsortiumPlan = Tables<"consortium_plans">;
export type ConsortiumProposal = Tables<"consortium_proposals">;

const plansKey = (organizationId: string | null) => ["consortium-plans", organizationId] as const;
const proposalsKey = (leadId: string | null) => ["lead-consortium-proposals", leadId] as const;

// ------------------------------------------------------------
// Planos
// ------------------------------------------------------------
export function useConsortiumPlans(enabled = true) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: plansKey(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("consortium_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((plan) => ({ ...plan, terms: plan.terms ?? [] }));
    },
    enabled: enabled && !!organizationId,
    staleTime: 1000 * 60 * 5,
  });
}

export type PlanValues = Omit<TablesInsert<"consortium_plans">, "organization_id" | "id">;

export function useSaveConsortiumPlan() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: PlanValues | TablesUpdate<"consortium_plans"> }) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      if (input.id) {
        const { error } = await supabase.from("consortium_plans").update(input.values).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("consortium_plans")
        .insert({ ...(input.values as PlanValues), organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plansKey(organizationId) }),
  });
}

export function useDeleteConsortiumPlan() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consortium_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plansKey(organizationId) }),
  });
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Importa planos da planilha. Administradora que ainda não existe é criada. Plano com a mesma
 * administradora, tipo de bem e nome é atualizado; o resto é criado.
 */
export function useImportConsortiumPlans() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: PlanDraft[]) => {
      if (!organizationId) throw new Error("Organização não encontrada.");

      const { data: admins, error: adminsError } = await supabase
        .from("consortium_administrators")
        .select("id, name")
        .eq("organization_id", organizationId);
      if (adminsError) throw adminsError;
      const administrators = [...(admins ?? [])];

      const missing = [...new Set(drafts.map((draft) => draft.administrator.trim()))].filter(
        (name) => !administrators.some((admin) => sameName(admin.name, name)),
      );
      if (missing.length > 0) {
        const { data: created, error } = await supabase
          .from("consortium_administrators")
          .insert(missing.map((name) => ({ organization_id: organizationId, name })))
          .select("id, name");
        if (error) throw error;
        administrators.push(...(created ?? []));
      }

      const { data: existing, error: plansError } = await supabase
        .from("consortium_plans")
        .select("id, administrator_id, asset_type, name")
        .eq("organization_id", organizationId);
      if (plansError) throw plansError;

      let created = 0;
      let updated = 0;
      for (const draft of drafts) {
        const administrator = administrators.find((admin) => sameName(admin.name, draft.administrator));
        if (!administrator) throw new Error(`Administradora ${draft.administrator} não encontrada.`);
        const { administrator: _ignored, ...rest } = draft;
        const values = { ...rest, administrator_id: administrator.id, is_active: true };
        const match = (existing ?? []).find(
          (plan) => plan.administrator_id === administrator.id && plan.asset_type === draft.asset_type && sameName(plan.name, draft.name),
        );
        if (match) {
          const { error } = await supabase.from("consortium_plans").update(values).eq("id", match.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("consortium_plans").insert({ ...values, organization_id: organizationId });
          if (error) throw error;
          created++;
        }
      }
      return { created, updated, administratorsCreated: missing.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansKey(organizationId) });
      queryClient.invalidateQueries({ queryKey: ["consortium-administrators", organizationId] });
    },
  });
}

// ------------------------------------------------------------
// Propostas
// ------------------------------------------------------------
export function useLeadConsortiumProposals(leadId: string | null, enabled = true) {
  return useQuery({
    queryKey: proposalsKey(leadId),
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("consortium_proposals")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!leadId,
  });
}

export interface CreatedProposal {
  id: string;
  token: string;
  payload: Json;
  /** O lead foi para a etapa "Proposta enviada". */
  leadAdvanced: boolean;
}

export function useCreateConsortiumProposal() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, payload }: { leadId: string; payload: ProposalPayload }): Promise<CreatedProposal> => {
      if (!organizationId) throw new Error("Organização não encontrada.");

      const { data: before } = await supabase.from("leads").select("funnel_stage_id").eq("id", leadId).maybeSingle();

      const { data, error } = await supabase
        .from("consortium_proposals")
        .insert({ organization_id: organizationId, lead_id: leadId, payload: payload as unknown as Json })
        .select("id, token, payload")
        .single();
      if (error) throw error;

      const { data: after } = await supabase.from("leads").select("funnel_stage_id").eq("id", leadId).maybeSingle();
      const leadAdvanced = !!after?.funnel_stage_id && after.funnel_stage_id !== before?.funnel_stage_id;
      return { ...data, leadAdvanced };
    },
    onSuccess: (_data, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: proposalsKey(leadId) });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
