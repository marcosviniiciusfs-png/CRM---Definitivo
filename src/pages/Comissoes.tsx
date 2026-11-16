import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useConsortiumAdministrators } from "@/hooks/useConsortium";
import { CommissionForecast } from "@/components/commissions/CommissionForecast";
import { CommissionInstallments } from "@/components/commissions/CommissionInstallments";
import { CommissionRules } from "@/components/commissions/CommissionRules";
import { CommissionStatementImport } from "@/components/commissions/CommissionStatementImport";
import { EmptyState } from "@/components/commissions/shared";

const ADMIN_TABS = [
  { value: "previsao", label: "Previsão" },
  { value: "parcelas", label: "Parcelas" },
  { value: "regras", label: "Regras" },
  { value: "extrato", label: "Importar extrato" },
] as const;
type AdminTab = (typeof ADMIN_TABS)[number]["value"];

/** Comissões de consórcio (Fase 4). Owner/admin: previsão, conciliação e regras. Vendedor: as próprias comissões. */
export default function Comissoes() {
  const { organizationId, permissions } = useOrganization();
  const { isConsorcio, loading } = useOrganizationSegment();
  const isAdmin = permissions.role === "owner" || permissions.role === "admin";
  const { data: members = [] } = useOrganizationMembers(organizationId);
  const { data: administrators = [] } = useConsortiumAdministrators(isConsorcio);
  const [tab, setTab] = useState<AdminTab>("previsao");

  const sellerName = useCallback(
    (userId: string | null) => {
      if (!userId) return "Sem vendedor";
      const member = members.find((m) => m.user_id === userId);
      return member?.full_name || member?.email || "Colaborador";
    },
    [members],
  );

  if (loading || permissions.loading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (!isConsorcio) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-1 pt-2 sm:px-2 sm:pt-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Comissões</h1>
        <div className="mt-4">
          <EmptyState>As comissões de consórcio aparecem no modo consórcio. Ligue o modo em Configurações, na aba da organização.</EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-6 pt-2 sm:px-2 sm:pt-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
          {isAdmin ? "Comissões" : "Minhas comissões"}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {isAdmin
            ? "O que as administradoras pagam à corretora, o que vai para os vendedores e os estornos."
            : "Sua parte nas comissões das cotas que você vendeu."}
        </p>
      </div>

      {isAdmin ? (
        <>
          <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Seções de comissões">
            {ADMIN_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors",
                  tab === t.value ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            {tab === "previsao" && <CommissionForecast mode="admin" administrators={administrators} />}
            {tab === "parcelas" && <CommissionInstallments mode="admin" administrators={administrators} sellerName={sellerName} />}
            {tab === "regras" && <CommissionRules administrators={administrators} />}
            {tab === "extrato" && <CommissionStatementImport />}
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <CommissionForecast mode="seller" administrators={administrators} />
          <CommissionInstallments mode="seller" administrators={administrators} sellerName={sellerName} />
        </div>
      )}
    </div>
  );
}
