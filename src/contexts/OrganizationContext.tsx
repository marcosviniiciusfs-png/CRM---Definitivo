import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { OrganizationSelectorModal, OrganizationMembership } from "@/components/OrganizationSelectorModal";

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

export type { OrganizationMembership };

interface OrganizationContextType {
  organizationId: string | null;
  permissions: Permissions;
  availableOrganizations: OrganizationMembership[];
  switchOrganization: (orgId: string) => Promise<void>;
  refresh: () => Promise<void>;
  needsOrgSelection: boolean;
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
  selectedOrganizationId: string;
  availableOrganizations: OrganizationMembership[];
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

const setOrgCache = (
  selectedOrganizationId: string, 
  availableOrganizations: OrganizationMembership[],
  permissions: Permissions, 
  userId: string
) => {
  try {
    const cacheData: CachedOrgData = {
      selectedOrganizationId,
      availableOrganizations,
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

const calculatePermissions = (role: 'owner' | 'admin' | 'member' | null): Permissions => {
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';

  return {
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
};

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  permissions: defaultPermissions,
  availableOrganizations: [],
  switchOrganization: async () => {},
  refresh: async () => {},
  needsOrgSelection: false,
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, refreshSubscription } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationMembership[]>([]);
  const [needsOrgSelection, setNeedsOrgSelection] = useState(false);
  const dataLoadedRef = useRef(false);

  const loadOrganizationData = useCallback(async (forceRefresh = false, selectedOrgId?: string) => {
    if (!user) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
      setNeedsOrgSelection(false);
      clearOrgCache();
      dataLoadedRef.current = false;
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = getOrgCache(user.id);
      if (cachedData) {
        console.log('[ORG] Using cached organization data');
        setOrganizationId(cachedData.selectedOrganizationId);
        setAvailableOrganizations(cachedData.availableOrganizations);
        setPermissions({ ...cachedData.permissions, loading: false });
        setNeedsOrgSelection(false);
        dataLoadedRef.current = true;
        return;
      }
    }

    try {
      console.log('[ORG] Fetching organization data via RPC');
      
      // USAR A NOVA RPC SECURITY DEFINER que contorna as políticas RLS
      const { data: memberships, error } = await supabase.rpc('get_my_organization_memberships');

      if (error) {
        console.error('[ORG] Error fetching memberships via RPC:', error);
        setPermissions(prev => ({ ...prev, loading: false }));
        return;
      }

      console.log('[ORG] Memberships returned:', memberships?.length, memberships);

      if (memberships && memberships.length > 0) {
        // Formatar dados para compatibilidade com o resto do sistema
        const formattedMemberships: OrganizationMembership[] = memberships.map((m: any) => ({
          organization_id: m.organization_id,
          role: m.role as 'owner' | 'admin' | 'member',
          organizations: { 
            id: m.organization_id, 
            name: m.organization_name 
          }
        }));

        setAvailableOrganizations(formattedMemberships);

        // Determinar qual organização selecionar
        let targetOrgId = selectedOrgId;
        
        if (!targetOrgId) {
          // Verificar se há uma seleção no cache
          const cachedData = getOrgCache(user.id);
          if (cachedData?.selectedOrganizationId) {
            // Verificar se a org do cache ainda está disponível
            const stillAvailable = formattedMemberships.find(
              m => m.organization_id === cachedData.selectedOrganizationId
            );
            if (stillAvailable) {
              targetOrgId = cachedData.selectedOrganizationId;
            }
          }
        }

        // Se tem múltiplas orgs e nenhuma foi selecionada ainda (nem por cache, nem por param)
        if (!targetOrgId && formattedMemberships.length > 1) {
          console.log('[ORG] Multiple organizations detected, requires selection');
          setNeedsOrgSelection(true);
          setPermissions(prev => ({ ...prev, loading: false }));
          return; // NÃO auto-selecionar, esperar usuário escolher
        }

        if (!targetOrgId) {
          // Única organização ou seleção automática para caso com 1 org
          const sortedMemberships = [...formattedMemberships].sort((a, b) => {
            const order = { owner: 0, admin: 1, member: 2 };
            return order[a.role] - order[b.role];
          });
          targetOrgId = sortedMemberships[0].organization_id;
        }

        setOrganizationId(targetOrgId);
        setNeedsOrgSelection(false);

        // Calcular permissões baseado na org selecionada
        const selectedMembership = formattedMemberships.find(
          m => m.organization_id === targetOrgId
        );
        const role = selectedMembership?.role || null;
        const newPermissions = calculatePermissions(role);

        setPermissions(newPermissions);
        setOrgCache(targetOrgId, formattedMemberships, newPermissions, user.id);
        dataLoadedRef.current = true;

        // Atualizar subscription com a organização correta
        console.log('[ORG] Refreshing subscription for organization:', targetOrgId);
        refreshSubscription(targetOrgId);
      } else {
        console.log('[ORG] No memberships found');
        setPermissions(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
      setPermissions(prev => ({ ...prev, loading: false }));
    }
  }, [user, refreshSubscription]);

  const handleOrgSelect = useCallback(async (orgId: string) => {
    if (!user) return;
    
    const targetMembership = availableOrganizations.find(
      m => m.organization_id === orgId
    );
    
    if (!targetMembership) {
      console.error('[ORG] Organization not found in available organizations');
      return;
    }

    console.log('[ORG] User selected organization:', orgId);
    
    setOrganizationId(orgId);
    setNeedsOrgSelection(false);
    
    const newPermissions = calculatePermissions(targetMembership.role);
    setPermissions(newPermissions);
    
    // Atualizar cache com a nova seleção
    setOrgCache(orgId, availableOrganizations, newPermissions, user.id);
    
    // Atualizar subscription com a nova organização
    console.log('[ORG] Refreshing subscription after org selection:', orgId);
    refreshSubscription(orgId);
  }, [user, availableOrganizations, refreshSubscription]);

  const switchOrganization = useCallback(async (orgId: string) => {
    if (!user) return;
    
    console.log('[ORG] Switching to organization:', orgId);
    
    const targetMembership = availableOrganizations.find(
      m => m.organization_id === orgId
    );
    
    if (!targetMembership) {
      console.error('[ORG] Organization not found in available organizations');
      return;
    }

    setOrganizationId(orgId);
    
    const newPermissions = calculatePermissions(targetMembership.role);
    setPermissions(newPermissions);
    
    // Atualizar cache com a nova seleção
    setOrgCache(orgId, availableOrganizations, newPermissions, user.id);
    
    // IMPORTANTE: Atualizar subscription com a nova organização
    console.log('[ORG] Refreshing subscription after org switch:', orgId);
    await refreshSubscription(orgId);
  }, [user, availableOrganizations, refreshSubscription]);

  // Initial load with cache - OPTIMIZED: Immediate UI unlock
  useEffect(() => {
    if (!user?.id) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
      setNeedsOrgSelection(false);
      return;
    }

    // Try to load from cache FIRST (load instantâneo)
    const cachedData = getOrgCache(user.id);
    if (cachedData) {
      console.log('[ORG] Restoring from cache on mount - instant load');
      setOrganizationId(cachedData.selectedOrganizationId);
      setAvailableOrganizations(cachedData.availableOrganizations);
      setPermissions({ ...cachedData.permissions, loading: false });
      setNeedsOrgSelection(false);
      dataLoadedRef.current = true;
      
      // Refresh in background silently
      setTimeout(() => loadOrganizationData(true), 100);
    } else {
      // SEM CACHE: Setar loading=false com permissões padrão de member
      // para não bloquear a UI, depois atualizar quando dados chegarem
      console.log('[ORG] No cache - loading data from API');
      setPermissions({
        ...defaultPermissions,
        loading: false,
        role: 'member', // Assumir member por padrão para não bloquear
      });
      
      // Carregar dados reais
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
      availableOrganizations,
      switchOrganization,
      refresh,
      needsOrgSelection
    }}>
      {/* GATE GLOBAL: Modal de seleção de organização */}
      {user && needsOrgSelection && availableOrganizations.length > 1 && (
        <OrganizationSelectorModal
          open={true}
          organizations={availableOrganizations}
          onSelect={handleOrgSelect}
        />
      )}
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
