import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Permissions {
  canManageCollaborators: boolean;
  canDeleteCollaborators: boolean;
  canChangeRoles: boolean;
  canCreateRoulettes: boolean;
  canDeleteRoulettes: boolean;
  canManualDistribute: boolean;
  canViewAllLeads: boolean;
  canAssignLeads: boolean;
  canDeleteLeads: boolean;
  canManageAutomation: boolean;
  canManageIntegrations: boolean;
  canManageTags: boolean;
  canManagePipeline: boolean;
  canViewTeamMetrics: boolean;
  canAccessAdminSection: boolean;
  canManageAgentSettings: boolean;
  role: 'owner' | 'admin' | 'member' | null;
  loading: boolean;
}

interface OrganizationContextType {
  organizationId: string | null;
  permissions: Permissions;
  refresh: () => Promise<void>;
}

const defaultPermissions: Permissions = {
  canManageCollaborators: false,
  canDeleteCollaborators: false,
  canChangeRoles: false,
  canCreateRoulettes: false,
  canDeleteRoulettes: false,
  canManualDistribute: false,
  canViewAllLeads: false,
  canAssignLeads: false,
  canDeleteLeads: false,
  canManageAutomation: false,
  canManageIntegrations: false,
  canManageTags: false,
  canManagePipeline: false,
  canViewTeamMetrics: false,
  canAccessAdminSection: false,
  canManageAgentSettings: false,
  role: null,
  loading: true,
};

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  permissions: defaultPermissions,
  refresh: async () => {},
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);

  const loadOrganizationData = useCallback(async () => {
    if (!user) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      return;
    }

    try {
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (orgMember) {
        setOrganizationId(orgMember.organization_id);
        
        const role = orgMember.role as 'owner' | 'admin' | 'member' | null;
        const isOwner = role === 'owner';
        const isAdmin = role === 'admin';

        setPermissions({
          canManageCollaborators: isOwner || isAdmin,
          canDeleteCollaborators: isOwner,
          canChangeRoles: isOwner,
          canCreateRoulettes: isOwner || isAdmin,
          canDeleteRoulettes: isOwner,
          canManualDistribute: isOwner || isAdmin,
          canViewAllLeads: isOwner || isAdmin,
          canAssignLeads: isOwner || isAdmin,
          canDeleteLeads: isOwner || isAdmin,
          canManageAutomation: isOwner || isAdmin,
          canManageIntegrations: isOwner || isAdmin,
          canManageTags: isOwner || isAdmin,
          canManagePipeline: isOwner || isAdmin,
          canViewTeamMetrics: isOwner || isAdmin,
          canAccessAdminSection: isOwner || isAdmin,
          canManageAgentSettings: isOwner || isAdmin,
          role,
          loading: false,
        });
      } else {
        setPermissions(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
      setPermissions(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  useEffect(() => {
    loadOrganizationData();
  }, [loadOrganizationData]);

  return (
    <OrganizationContext.Provider value={{ 
      organizationId, 
      permissions, 
      refresh: loadOrganizationData 
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}

// Hook de compatibilidade para código existente
export function useOrganizationPermissions() {
  const { permissions } = useOrganization();
  return permissions;
}
