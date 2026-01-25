import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface OrganizationReadyState {
  isReady: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>["user"];
  organizationId: string | null;
  needsOrgSelection: boolean;
}

/**
 * Hook unificado que combina auth e organization states para fornecer um flag "ready" único.
 * Use este hook em páginas que precisam esperar AMBOS auth e organization serem inicializados.
 * 
 * CRÍTICO: Este hook previne tela branca garantindo que:
 * 1. Auth está completamente carregado
 * 2. Organization está inicializada
 * 3. Ambos estão sincronizados antes de liberar renderização
 */
export function useOrganizationReady(): OrganizationReadyState {
  const { user, loading: authLoading } = useAuth();
  const { organizationId, isInitialized, needsOrgSelection } = useOrganization();
  
  // CRÍTICO: Considerar loading se AUTH ainda está carregando OU ORG não inicializou
  const isLoading = authLoading || !isInitialized;
  
  // CRÍTICO: Só está "ready" quando:
  // 1. Não está em loading
  // 2. User existe
  // 3. Organization existe OU precisa selecionar org (modal aparecerá)
  const isReady = !isLoading && !!user && (!!organizationId || needsOrgSelection);
  
  return {
    isReady,
    isLoading,
    user,
    organizationId,
    needsOrgSelection,
  };
}
