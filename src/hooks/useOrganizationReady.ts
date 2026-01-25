import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface OrganizationReadyState {
  isReady: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>["user"];
  organizationId: string | null;
}

/**
 * Hook that combines auth and organization states to provide a unified "ready" flag.
 * Use this in pages that need to wait for both auth and organization to be initialized.
 */
export function useOrganizationReady(): OrganizationReadyState {
  const { user, loading: authLoading } = useAuth();
  const { organizationId, isInitialized } = useOrganization();
  
  const isLoading = authLoading || !isInitialized;
  const isReady = !isLoading && !!user && !!organizationId;
  
  return {
    isReady,
    isLoading,
    user,
    organizationId,
  };
}
