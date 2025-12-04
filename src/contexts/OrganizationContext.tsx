import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
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

// Cache keys and TTL
const ORG_CACHE_KEY = "kairoz_org_cache";
const ORG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedOrgData {
  organizationId: string;
  permissions: Permissions;
  timestamp: number;
  userId: string;
}

// Helper functions for cache
const getOrgCache = (userId: string): CachedOrgData | null => {
  try {
    const cached = localStorage.getItem(ORG_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedOrgData = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > ORG_CACHE_TTL;
    const isCorrectUser = parsed.userId === userId;
    
    if (isExpired || !isCorrectUser) {
      localStorage.removeItem(ORG_CACHE_KEY);
      return null;
    }
    
    return parsed;
  } catch {
    localStorage.removeItem(ORG_CACHE_KEY);
    return null;
  }
};

const setOrgCache = (organizationId: string, permissions: Permissions, userId: string) => {
  try {
    const cacheData: CachedOrgData = {
      organizationId,
      permissions,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(ORG_CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    // Ignore storage errors
  }
};

const clearOrgCache = () => {
  try {
    localStorage.removeItem(ORG_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
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
  const dataLoadedRef = useRef(false);

  const loadOrganizationData = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      clearOrgCache();
      dataLoadedRef.current = false;
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = getOrgCache(user.id);
      if (cachedData) {
        console.log('[ORG] Using cached organization data');
        setOrganizationId(cachedData.organizationId);
        setPermissions({ ...cachedData.permissions, loading: false });
        dataLoadedRef.current = true;
        return;
      }
    }

    try {
      console.log('[ORG] Fetching organization data from API');
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

        const newPermissions: Permissions = {
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
        };

        setPermissions(newPermissions);
        setOrgCache(orgMember.organization_id, newPermissions, user.id);
        dataLoadedRef.current = true;
      } else {
        setPermissions(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
      setPermissions(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Initial load with cache
  useEffect(() => {
    if (!user) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      return;
    }

    // Try to load from cache immediately for faster UI
    const cachedData = getOrgCache(user.id);
    if (cachedData) {
      console.log('[ORG] Restoring from cache on mount');
      setOrganizationId(cachedData.organizationId);
      setPermissions({ ...cachedData.permissions, loading: false });
      dataLoadedRef.current = true;
      
      // Refresh in background to ensure data is fresh
      loadOrganizationData(true);
    } else {
      loadOrganizationData();
    }
  }, [user?.id]); // Only depend on user.id to avoid re-running on every user object change

  const refresh = useCallback(async () => {
    await loadOrganizationData(true);
  }, [loadOrganizationData]);

  return (
    <OrganizationContext.Provider value={{ 
      organizationId, 
      permissions, 
      refresh 
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
