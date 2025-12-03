import { useOrganization } from "@/contexts/OrganizationContext";

// Hook de compatibilidade que usa o contexto centralizado
export function usePermissions() {
  const { permissions } = useOrganization();
  return permissions;
}
