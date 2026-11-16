import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { ChargebackTier, SellerTier } from "@/lib/consortiumCommission";

export type CommissionRule = Tables<"consortium_commission_rules">;
export type CommissionInstallment = Tables<"consortium_commission_installments">;

export interface CommissionInstallmentRow extends CommissionInstallment {
  sale: {
    group_code: string | null;
    quota_number: string | null;
    contract_number: string | null;
    credit_amount: number;
    lead_id: string;
    lead: { nome_lead: string | null } | null;
  } | null;
}

const rulesKey = (organizationId: string | null) => ["consortium-commission-rules", organizationId] as const;
const installmentsKey = ["consortium-commission-installments"] as const;

const PAGE = 1000;
const CHUNK = 100;

/** Busca todas as páginas (o PostgREST devolve no máximo 1000 linhas por vez). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ------------------------------------------------------------
// Regras (só owner/admin enxerga)
// ------------------------------------------------------------
export function useCommissionRules(enabled = true) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: rulesKey(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("consortium_commission_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!organizationId,
  });
}

export interface CommissionRuleInput {
  id?: string;
  administrator_id: string | null;
  asset_type: string | null;
  commission_percent: number;
  installment_percents: number[];
  chargeback: ChargebackTier[];
  seller_share_percent: number;
  seller_tiers: SellerTier[] | null;
  is_active: boolean;
}

export function useSaveCommissionRule() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CommissionRuleInput) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const values = {
        ...input,
        chargeback: input.chargeback as unknown as Json,
        seller_tiers: (input.seller_tiers && input.seller_tiers.length > 0 ? input.seller_tiers : null) as unknown as Json,
      };
      if (id) {
        const patch: TablesUpdate<"consortium_commission_rules"> = values;
        const { error } = await supabase.from("consortium_commission_rules").update(patch).eq("id", id);
        if (error) throw error;
        return;
      }
      const row: TablesInsert<"consortium_commission_rules"> = { ...values, organization_id: organizationId };
      const { error } = await supabase.from("consortium_commission_rules").insert(row);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(organizationId) }),
  });
}

export function useSetCommissionRuleActive() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("consortium_commission_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(organizationId) }),
  });
}

export function useDeleteCommissionRule() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consortium_commission_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(organizationId) }),
  });
}

/** Gera parcelas para as cotas que contam e ainda não têm comissão. Devolve quantas cotas ganharam parcelas. */
export function useGeneratePendingCommissions() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { data, error } = await supabase.rpc("consortium_commission_generate_pending", {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: installmentsKey }),
  });
}

// ------------------------------------------------------------
// Parcelas (a RLS limita o vendedor às próprias)
// ------------------------------------------------------------
export function useCommissionInstallments(range: { from: string; to: string } | null, enabled = true) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: [...installmentsKey, organizationId, range?.from ?? null, range?.to ?? null],
    queryFn: async (): Promise<CommissionInstallmentRow[]> => {
      if (!organizationId) return [];
      return fetchAll<CommissionInstallmentRow>((from, to) => {
        let query = supabase
          .from("consortium_commission_installments")
          .select(
            "*, sale:consortium_sales(group_code, quota_number, contract_number, credit_amount, lead_id, lead:leads(nome_lead))",
          )
          .eq("organization_id", organizationId);
        if (range) query = query.gte("due_month", range.from).lte("due_month", range.to);
        return query
          .order("due_month")
          .order("sale_id")
          .order("n")
          .range(from, to) as unknown as PromiseLike<{ data: CommissionInstallmentRow[] | null; error: unknown }>;
      });
    },
    enabled: enabled && !!organizationId,
    staleTime: 1000 * 60,
  });
}

export type InstallmentAction = "recebida" | "paga_vendedor" | "prevista";

export function useUpdateInstallmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status, date }: { ids: string[]; status: InstallmentAction; date?: string }) => {
      const patch: TablesUpdate<"consortium_commission_installments"> = { status };
      if (status === "recebida") patch.received_on = date ?? null;
      if (status === "paga_vendedor") patch.paid_on = date ?? null;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await supabase
          .from("consortium_commission_installments")
          .update(patch)
          .in("id", ids.slice(i, i + CHUNK));
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: installmentsKey }),
  });
}

/** Cotas e parcelas da organização, para casar o extrato. */
export function useStatementReference(enabled: boolean) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["consortium-statement-reference", organizationId],
    queryFn: async () => {
      if (!organizationId) return { sales: [], installments: [] };
      const [sales, installments] = await Promise.all([
        fetchAll<Pick<Tables<"consortium_sales">, "id" | "contract_number" | "group_code" | "quota_number">>((from, to) =>
          supabase
            .from("consortium_sales")
            .select("id, contract_number, group_code, quota_number")
            .eq("organization_id", organizationId)
            .order("id")
            .range(from, to)),
        fetchAll<Pick<CommissionInstallment, "id" | "sale_id" | "n" | "status" | "amount">>((from, to) =>
          supabase
            .from("consortium_commission_installments")
            .select("id, sale_id, n, status, amount")
            .eq("organization_id", organizationId)
            .gt("n", 0)
            .order("id")
            .range(from, to)),
      ]);
      return { sales, installments };
    },
    enabled: enabled && !!organizationId,
    staleTime: 0,
  });
}
