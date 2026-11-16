import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";

export type ConsortiumAdministrator = Tables<"consortium_administrators">;
export type ConsortiumSale = Tables<"consortium_sales">;
export type LeadConsortiumProfile = Tables<"lead_consortium_profiles">;

const adminsKey = (organizationId: string | null) => ["consortium-administrators", organizationId] as const;
const profileKey = (leadId: string | null) => ["lead-consortium-profile", leadId] as const;
const salesKey = (leadId: string | null) => ["lead-consortium-sales", leadId] as const;

// ------------------------------------------------------------
// Administradoras
// ------------------------------------------------------------
export function useConsortiumAdministrators(enabled = true) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: adminsKey(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("consortium_administrators")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!organizationId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useSaveConsortiumAdministrator() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name?: string; color?: string | null; is_active?: boolean }) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      if (input.id) {
        const patch: TablesUpdate<"consortium_administrators"> = {};
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.color !== undefined) patch.color = input.color;
        if (input.is_active !== undefined) patch.is_active = input.is_active;
        const { error } = await supabase.from("consortium_administrators").update(patch).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const row: TablesInsert<"consortium_administrators"> = {
        organization_id: organizationId,
        name: (input.name ?? "").trim(),
        color: input.color ?? null,
      };
      const { error } = await supabase.from("consortium_administrators").insert(row);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminsKey(organizationId) }),
  });
}

// ------------------------------------------------------------
// Qualificação do lead
// ------------------------------------------------------------
export function useLeadConsortiumProfile(leadId: string | null, enabled = true) {
  return useQuery({
    queryKey: profileKey(leadId),
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from("lead_consortium_profiles")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!leadId,
  });
}

export function useSaveLeadConsortiumProfile(leadId: string | null) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<TablesInsert<"lead_consortium_profiles">, "lead_id" | "organization_id">) => {
      if (!leadId || !organizationId) throw new Error("Lead ou organização não encontrados.");
      const { error } = await supabase
        .from("lead_consortium_profiles")
        .upsert({ ...values, lead_id: leadId, organization_id: organizationId }, { onConflict: "lead_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(leadId) }),
  });
}

// ------------------------------------------------------------
// Cotas vendidas
// ------------------------------------------------------------
export function useLeadConsortiumSales(leadId: string | null, enabled = true) {
  return useQuery({
    queryKey: salesKey(leadId),
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("consortium_sales")
        .select("*")
        .eq("lead_id", leadId)
        .order("adhesion_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!leadId,
  });
}

export type NewConsortiumSale = Omit<TablesInsert<"consortium_sales">, "organization_id" | "lead_id">;

export function useCreateConsortiumSale(leadId: string | null) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sale: NewConsortiumSale) => {
      if (!leadId || !organizationId) throw new Error("Lead ou organização não encontrados.");
      const { error } = await supabase
        .from("consortium_sales")
        .insert({ ...sale, lead_id: leadId, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesKey(leadId) });
      queryClient.invalidateQueries({ queryKey: ["consortium-summary"] });
    },
  });
}

export function useUpdateConsortiumSale(leadId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"consortium_sales"> }) => {
      const { error } = await supabase.from("consortium_sales").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesKey(leadId) });
      queryClient.invalidateQueries({ queryKey: ["consortium-summary"] });
    },
  });
}
