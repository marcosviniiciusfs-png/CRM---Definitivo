import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { OrganizationSelectorModal, OrganizationMembership } from "@/components/OrganizationSelectorModal";

// Custom role permissions from organization_custom_roles table
interface CustomRolePermissions {
  can_view_kanban: boolean;
  can_create_tasks: boolean;
  can_edit_own_tasks: boolean;
  can_edit_all_tasks: boolean;
  can_delete_tasks: boolean;
  can_view_all_leads: boolean;
  can_view_assigned_leads: boolean;
  can_create_leads: boolean;
  can_edit_leads: boolean;
  can_delete_leads: boolean;
  can_assign_leads: boolean;
  can_view_pipeline: boolean;
  can_move_leads_pipeline: boolean;
  can_view_chat: boolean;
  can_send_messages: boolean;
  can_view_all_conversations: boolean;
  can_manage_collaborators: boolean;
  can_manage_integrations: boolean;
  can_manage_tags: boolean;
  can_manage_automations: boolean;
  can_view_reports: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  custom_role_color: string | null;
}

interface Permissions {
  // Base role permissions (owner/admin/member)
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
  
  // Granular custom role permissions
  canViewKanban: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAllTasks: boolean;
  canDeleteTasks: boolean;
  canViewAssignedLeads: boolean;
  canCreateLeads: boolean;
  canEditLeads: boolean;
  canViewPipeline: boolean;
  canMoveLeadsPipeline: boolean;
  canViewChat: boolean;
  canSendMessages: boolean;
  canViewAllConversations: boolean;
  canViewReports: boolean;
  
  // Custom role info
  customRoleId: string | null;
  customRoleName: string | null;
  customRoleColor: string | null;
  
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
  isInitialized: boolean;
}

const defaultPermissions: Permissions = {
  // Base permissions
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
  // Granular permissions
  canViewKanban: false,
  canCreateTasks: false,
  canEditOwnTasks: false,
  canEditAllTasks: false,
  canDeleteTasks: false,
  canViewAssignedLeads: false,
  canCreateLeads: false,
  canEditLeads: false,
  canViewPipeline: false,
  canMoveLeadsPipeline: false,
  canViewChat: false,
  canSendMessages: false,
  canViewAllConversations: false,
  canViewReports: false,
  // Custom role info
  customRoleId: null,
  customRoleName: null,
  customRoleColor: null,
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

// Calculate base permissions from role
const calculateBasePermissions = (role: 'owner' | 'admin' | 'member' | null): Partial<Permissions> => {
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isOwnerOrAdmin = isOwner || isAdmin;

  return {
    canManageCollaborators: isOwnerOrAdmin,
    canDeleteCollaborators: isOwner,
    canChangeRoles: isOwner,
    canCreateRoulettes: isOwnerOrAdmin,
    canDeleteRoulettes: isOwner,
    canManualDistribute: isOwnerOrAdmin,
    canViewAllLeads: isOwnerOrAdmin,
    canAssignLeads: isOwnerOrAdmin,
    canDeleteLeads: isOwnerOrAdmin,
    canManageAutomation: isOwnerOrAdmin,
    canManageIntegrations: isOwnerOrAdmin,
    canManageTags: isOwnerOrAdmin,
    canManagePipeline: isOwnerOrAdmin,
    canViewTeamMetrics: isOwnerOrAdmin,
    canAccessAdminSection: isOwnerOrAdmin,
    canManageAgentSettings: isOwnerOrAdmin,
    role,
    loading: false,
  };
};

// Calculate full permissions merging base role and custom role
const calculatePermissions = (
  role: 'owner' | 'admin' | 'member' | null,
  customRolePerms: CustomRolePermissions | null
): Permissions => {
  const basePerms = calculateBasePermissions(role);
  const isOwnerOrAdmin = role === 'owner' || role === 'admin';

  // Owners and Admins always have all granular permissions
  if (isOwnerOrAdmin) {
    return {
      ...defaultPermissions,
      ...basePerms,
      canViewKanban: true,
      canCreateTasks: true,
      canEditOwnTasks: true,
      canEditAllTasks: true,
      canDeleteTasks: true,
      canViewAssignedLeads: true,
      canCreateLeads: true,
      canEditLeads: true,
      canViewPipeline: true,
      canMoveLeadsPipeline: true,
      canViewChat: true,
      canSendMessages: true,
      canViewAllConversations: true,
      canViewReports: true,
      customRoleId: null,
      customRoleName: null,
      customRoleColor: null,
    };
  }

  // For members, use custom role permissions if available
  if (customRolePerms) {
    return {
      ...defaultPermissions,
      ...basePerms,
      canViewKanban: customRolePerms.can_view_kanban,
      canCreateTasks: customRolePerms.can_create_tasks,
      canEditOwnTasks: customRolePerms.can_edit_own_tasks,
      canEditAllTasks: customRolePerms.can_edit_all_tasks,
      canDeleteTasks: customRolePerms.can_delete_tasks,
      canViewAllLeads: customRolePerms.can_view_all_leads,
      canViewAssignedLeads: customRolePerms.can_view_assigned_leads,
      canCreateLeads: customRolePerms.can_create_leads,
      canEditLeads: customRolePerms.can_edit_leads,
      canDeleteLeads: customRolePerms.can_delete_leads,
      canAssignLeads: customRolePerms.can_assign_leads,
      canViewPipeline: customRolePerms.can_view_pipeline,
      canMoveLeadsPipeline: customRolePerms.can_move_leads_pipeline,
      canViewChat: customRolePerms.can_view_chat,
      canSendMessages: customRolePerms.can_send_messages,
      canViewAllConversations: customRolePerms.can_view_all_conversations,
      canManageCollaborators: customRolePerms.can_manage_collaborators,
      canManageIntegrations: customRolePerms.can_manage_integrations,
      canManageTags: customRolePerms.can_manage_tags,
      canManageAutomation: customRolePerms.can_manage_automations,
      canViewReports: customRolePerms.can_view_reports,
      customRoleId: customRolePerms.custom_role_id,
      customRoleName: customRolePerms.custom_role_name,
      customRoleColor: customRolePerms.custom_role_color,
    };
  }

  // Member without custom role: minimal permissions
  return {
    ...defaultPermissions,
    ...basePerms,
    canViewKanban: false,
    canCreateTasks: false,
    canEditOwnTasks: false,
    canEditAllTasks: false,
    canDeleteTasks: false,
    canViewAssignedLeads: true, // Members can at least see their assigned leads
    canCreateLeads: false,
    canEditLeads: false,
    canViewPipeline: false,
    canMoveLeadsPipeline: false,
    canViewChat: false,
    canSendMessages: false,
    canViewAllConversations: false,
    canViewReports: false,
    customRoleId: null,
    customRoleName: null,
    customRoleColor: null,
  };
};

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  permissions: defaultPermissions,
  availableOrganizations: [],
  switchOrganization: async () => {},
  refresh: async () => {},
  needsOrgSelection: false,
  isInitialized: false,
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, refreshSubscription } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationMembership[]>([]);
  const [needsOrgSelection, setNeedsOrgSelection] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const dataLoadedRef = useRef(false);

  // Fetch custom role permissions for a specific organization
  const fetchCustomRolePermissions = async (orgId: string): Promise<CustomRolePermissions | null> => {
    try {
      const { data, error } = await supabase.rpc('get_member_custom_role_permissions', {
        org_id: orgId
      });

      if (error) {
        console.log('[ORG] No custom role permissions found:', error.message);
        return null;
      }

      if (data && data.length > 0) {
        const perms = data[0];
        return {
          can_view_kanban: perms.can_view_kanban ?? false,
          can_create_tasks: perms.can_create_tasks ?? false,
          can_edit_own_tasks: perms.can_edit_own_tasks ?? false,
          can_edit_all_tasks: perms.can_edit_all_tasks ?? false,
          can_delete_tasks: perms.can_delete_tasks ?? false,
          can_view_all_leads: perms.can_view_all_leads ?? false,
          can_view_assigned_leads: perms.can_view_assigned_leads ?? false,
          can_create_leads: perms.can_create_leads ?? false,
          can_edit_leads: perms.can_edit_leads ?? false,
          can_delete_leads: perms.can_delete_leads ?? false,
          can_assign_leads: perms.can_assign_leads ?? false,
          can_view_pipeline: perms.can_view_pipeline ?? false,
          can_move_leads_pipeline: perms.can_move_leads_pipeline ?? false,
          can_view_chat: perms.can_view_chat ?? false,
          can_send_messages: perms.can_send_messages ?? false,
          can_view_all_conversations: perms.can_view_all_conversations ?? false,
          can_manage_collaborators: perms.can_manage_collaborators ?? false,
          can_manage_integrations: perms.can_manage_integrations ?? false,
          can_manage_tags: perms.can_manage_tags ?? false,
          can_manage_automations: perms.can_manage_automations ?? false,
          can_view_reports: perms.can_view_reports ?? false,
          custom_role_id: perms.custom_role_id ?? null,
          custom_role_name: perms.custom_role_name ?? null,
          custom_role_color: perms.custom_role_color ?? null,
        };
      }

      return null;
    } catch (error) {
      console.error('[ORG] Error fetching custom role permissions:', error);
      return null;
    }
  };

  const loadOrganizationData = useCallback(async (forceRefresh = false, selectedOrgId?: string) => {
    if (!user) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
      setNeedsOrgSelection(false);
      setIsInitialized(true);
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
        setIsInitialized(true);
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

        // CRITICAL: Sync to backend for RLS policies BEFORE setting state
        // This ensures all subsequent queries will use the correct organization
        console.log('[ORG] Syncing active org to backend:', targetOrgId);
        try {
          const { error: syncError } = await supabase.rpc('set_user_active_organization', {
            _org_id: targetOrgId
          });
          if (syncError) {
            console.warn('[ORG] Failed to sync active org:', syncError);
          } else {
            console.log('[ORG] Active org synced successfully');
          }
        } catch (syncErr) {
          console.warn('[ORG] Error syncing active org:', syncErr);
        }

        setOrganizationId(targetOrgId);
        setNeedsOrgSelection(false);

        // Get base role from membership
        const selectedMembership = formattedMemberships.find(
          m => m.organization_id === targetOrgId
        );
        const role = selectedMembership?.role || null;

        // Fetch custom role permissions for members
        let customRolePerms: CustomRolePermissions | null = null;
        if (role === 'member') {
          customRolePerms = await fetchCustomRolePermissions(targetOrgId);
          console.log('[ORG] Custom role permissions loaded:', customRolePerms);
        }

        // Calculate full permissions
        const newPermissions = calculatePermissions(role, customRolePerms);

        setPermissions(newPermissions);
        setOrgCache(targetOrgId, formattedMemberships, newPermissions, user.id);
        setIsInitialized(true);
        dataLoadedRef.current = true;

        // Atualizar subscription com a organização correta
        console.log('[ORG] Refreshing subscription for organization:', targetOrgId);
        refreshSubscription(targetOrgId);
      } else {
        console.log('[ORG] No memberships found');
        setPermissions(prev => ({ ...prev, loading: false }));
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
      setPermissions(prev => ({ ...prev, loading: false }));
      setIsInitialized(true);
    }
  }, [user, refreshSubscription]);

  // Ref para prevenir cliques duplos durante seleção
  const isProcessingSelection = useRef(false);

  // Sync active organization to backend for RLS
  const syncActiveOrgToBackend = useCallback(async (orgId: string): Promise<boolean> => {
    try {
      console.log('[ORG] Syncing active organization to backend:', orgId);
      const { data, error } = await supabase.rpc('set_user_active_organization', {
        _org_id: orgId
      });
      
      if (error) {
        console.error('[ORG] Failed to sync active org to backend:', error);
        return false;
      }
      
      console.log('[ORG] Active organization synced successfully:', data);
      return data === true;
    } catch (error) {
      console.error('[ORG] Error syncing active org:', error);
      return false;
    }
  }, []);

  const handleOrgSelect = useCallback(async (orgId: string) => {
    // Prevenir cliques duplos
    if (!user || isProcessingSelection.current) {
      console.log('[ORG] Ignoring selection - already processing or no user');
      return;
    }
    
    isProcessingSelection.current = true;
    console.log('[ORG] Processing organization selection:', orgId);
    
    const targetMembership = availableOrganizations.find(
      m => m.organization_id === orgId
    );
    
    if (!targetMembership) {
      console.error('[ORG] Organization not found in available organizations');
      isProcessingSelection.current = false;
      return;
    }

    try {
      // CRITICAL: Sync to backend FIRST before any data loads
      // This ensures RLS policies will use the correct organization
      const syncSuccess = await syncActiveOrgToBackend(orgId);
      if (!syncSuccess) {
        console.error('[ORG] Backend sync FAILED for organization:', orgId);
        // Se o sync falhou e o usuário tem múltiplas orgs, NÃO continuar
        // porque as queries subsequentes vão falhar com 403
        if (availableOrganizations.length > 1) {
          console.warn('[ORG] Multi-org user sync failed - keeping selection modal open');
          isProcessingSelection.current = false;
          // Não fechar o modal, deixar usuário tentar novamente
          return;
        }
        // Para usuário de org única, continuar mesmo com falha (fallback)
        console.warn('[ORG] Single-org user - continuing despite sync failure');
      }

      const role = targetMembership.role;
      
      // Fetch custom role permissions for members
      let customRolePerms: CustomRolePermissions | null = null;
      if (role === 'member') {
        customRolePerms = await fetchCustomRolePermissions(orgId);
      }

      // Calculate full permissions
      const newPermissions = calculatePermissions(role, customRolePerms);
      
      // Salvar no cache ANTES de atualizar estados (crítico para evitar race conditions)
      setOrgCache(orgId, availableOrganizations, newPermissions, user.id);
      
      // Atualizar todos os estados de forma síncrona
      setOrganizationId(orgId);
      setPermissions(newPermissions);
      setNeedsOrgSelection(false);
      setIsInitialized(true);
      dataLoadedRef.current = true;
      
      console.log('[ORG] Organization selected successfully:', orgId);
      
      // Atualizar subscription em background
      refreshSubscription(orgId);
    } catch (error) {
      console.error('[ORG] Error during organization selection:', error);
    } finally {
      // Delay para garantir que estados propagaram antes de permitir nova seleção
      setTimeout(() => {
        isProcessingSelection.current = false;
      }, 500);
    }
  }, [user, availableOrganizations, refreshSubscription, syncActiveOrgToBackend]);

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

    // CRITICAL: Sync to backend FIRST before any data loads
    // This ensures RLS policies will use the correct organization
    const syncSuccess = await syncActiveOrgToBackend(orgId);
    if (!syncSuccess) {
      console.warn('[ORG] Backend sync failed during switch, but continuing');
    }

    setOrganizationId(orgId);
    
    const role = targetMembership.role;
    
    // Fetch custom role permissions for members
    let customRolePerms: CustomRolePermissions | null = null;
    if (role === 'member') {
      customRolePerms = await fetchCustomRolePermissions(orgId);
    }

    const newPermissions = calculatePermissions(role, customRolePerms);
    setPermissions(newPermissions);
    
    // Atualizar cache com a nova seleção
    setOrgCache(orgId, availableOrganizations, newPermissions, user.id);
    
    // IMPORTANTE: Atualizar subscription com a nova organização
    console.log('[ORG] Refreshing subscription after org switch:', orgId);
    await refreshSubscription(orgId);
  }, [user, availableOrganizations, refreshSubscription, syncActiveOrgToBackend]);

  // Initial load with cache - OPTIMIZED: Wait for initialization before rendering
  useEffect(() => {
    if (!user?.id) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
      setNeedsOrgSelection(false);
      setIsInitialized(true);
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
      setIsInitialized(true);
      dataLoadedRef.current = true;
      
      // Refresh in background silently
      setTimeout(() => loadOrganizationData(true), 100);
    } else {
      // SEM CACHE: Manter isInitialized=false até dados chegarem
      console.log('[ORG] No cache - loading data from API');
      setIsInitialized(false);
      
      // Carregar dados reais - isInitialized será setado quando completar
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
      needsOrgSelection,
      isInitialized
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
