import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface OrganizationReadyState {
  isReady: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>["user"];
  organizationId: string | null;
  /** @deprecated Always false. Org selection modal is permanently disabled. */
  needsOrgSelection: boolean;
  isSuperAdmin: boolean;
}

/**
 * Hook unificado que combina auth e organization states para fornecer um flag "ready" único.
 * Use este hook em páginas que precisam esperar AMBOS auth e organization serem inicializados.
 *
 * NOTA DE SEGURANÇA: needsOrgSelection é sempre false. Cada usuário tem
 * exatamente 1 organização. Não há modal de seleção.
 */
export function useOrganizationReady(): OrganizationReadyState {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const { organizationId, isInitialized } = useOrganization();

  // Loading se AUTH ainda está carregando OU ORG não inicializou
  const isLoading = authLoading || !isInitialized;

  // Pronto quando:
  // 1. Não está em loading
  // 2. User existe
  // 3. Organization ID existe OU é Super Admin (acesso irrestrito)
  const isReady = !isLoading && !!user && (!!organizationId || isSuperAdmin);

  return {
    isReady,
    isLoading,
    user,
    organizationId,
    needsOrgSelection: false, // Always false: org selection is permanently disabled
    isSuperAdmin,
  };
}
