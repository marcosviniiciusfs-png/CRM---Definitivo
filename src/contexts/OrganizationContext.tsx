import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

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

// Kept for backward compatibility - but will always have 0 or 1 org
export interface OrganizationMembership {
  organization_id: string;
  role: 'owner' | 'admin' | 'member';
  organizations?: {
    id: string;
    name: string;
  };
}

interface OrganizationContextType {
  organizationId: string | null;
  permissions: Permissions;
  // Kept for compatibility but will always be 0 or 1 item
  availableOrganizations: OrganizationMembership[];
  // No-op: org switching is disabled
  switchOrganization: (orgId: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Always false: org selection modal is disabled
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
  switchOrganization: async () => { },
  refresh: async () => { },
  needsOrgSelection: false,
  isInitialized: false,
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, refreshSubscription } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions);
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationMembership[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const retryCountRef = useRef(0);
  const dataLoadedRef = useRef(false);
  const backgroundRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1500;

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

  const loadOrganizationData = useCallback(async (forceRefresh = false) => {
    if (!user) {
      console.log('[ORG] No user, skipping organization load');
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
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
        // Always expose only 1 org in cached data (enforce isolation)
        const singleOrg = cachedData.availableOrganizations.slice(0, 1);
        setAvailableOrganizations(singleOrg);
        setPermissions({ ...cachedData.permissions, loading: false });
        setIsInitialized(true);
        dataLoadedRef.current = true;
        return;
      }
    }

    try {
      console.log('[ORG] Loading organization data for user:', user.email);

      // Load memberships via RPC
      let { data: memberships, error: rpcError } = await supabase.rpc('get_my_organization_memberships');

      // If RPC not found, fallback to direct query
      const isMissingRpc = rpcError && (
        rpcError.code === 'PGRST202' ||
        rpcError.message?.includes('not found') ||
        (rpcError as any).status === 404
      );

      if (isMissingRpc) {
        console.warn('[ORG] RPC get_my_organization_memberships not found, using direct table fallback...');
        const { data: directData, error: directError } = await supabase
          .from('organization_members')
          .from('organization_members')
          .select('organization_id, role, organizations(id, name)')
          .eq('user_id', user.id);

        if (!directError && directData) {
          memberships = directData.map((m: any) => ({
            organization_id: m.organization_id,
            organization_name: m.organizations?.name || 'Workspace',
            role: m.role,
            is_owner: m.role === 'owner'
          }));
          rpcError = null;
        } else if (directError) {
          console.error('[ORG] Direct table fallback also failed:', directError);
          rpcError = directError;
        }
      }

      if (rpcError) {
        console.error('[ORG] All membership load attempts failed:', rpcError);

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          setTimeout(() => loadOrganizationData(true), RETRY_DELAY);
          return;
        }

        setIsInitialized(true);
        setPermissions(prev => ({ ...prev, loading: false }));
        return;
      }

      if (memberships && memberships.length > 0) {
        retryCountRef.current = 0;

        // ============================================================
        // CRITICAL SECURITY: Always use ONLY the FIRST membership.
        // A user must have exactly 1 organization.
        // If there are somehow multiple, use only the first one (owner preferred).
        // ============================================================
        const sortedMemberships = [...memberships].sort((a: any, b: any) => {
          // Prefer owner role
          if (a.role === 'owner' && b.role !== 'owner') return -1;
          if (b.role === 'owner' && a.role !== 'owner') return 1;
          // Then admin
          if (a.role === 'admin' && b.role === 'member') return -1;
          if (b.role === 'admin' && a.role === 'member') return 1;
          return 0;
        });

        // Take ONLY the single best membership
        const primaryMembership = sortedMemberships[0];

        if (memberships.length > 1) {
          console.warn(`[ORG] SECURITY: User ${user.email} has ${memberships.length} memberships. Enforcing single-org isolation - using only primary org.`);
        }

        const formattedMemberships: OrganizationMembership[] = [{
          organization_id: primaryMembership.organization_id,
          role: primaryMembership.role as 'owner' | 'admin' | 'member',
          organizations: {
            id: primaryMembership.organization_id,
            name: primaryMembership.organization_name
          }
        }];

        setAvailableOrganizations(formattedMemberships);

        const targetOrgId = primaryMembership.organization_id;

        // Sync active org to backend for RLS
        await supabase.rpc('set_user_active_organization', { _org_id: targetOrgId });
        setOrganizationId(targetOrgId);

        const role = primaryMembership.role as 'owner' | 'admin' | 'member';
        const customPerms = role === 'member' ? await fetchCustomRolePermissions(targetOrgId) : null;

        const perms = calculatePermissions(role, customPerms);
        setPermissions(perms);
        setOrgCache(targetOrgId, formattedMemberships, perms, user.id);
        setIsInitialized(true);
        dataLoadedRef.current = true;
        refreshSubscription(targetOrgId);
      } else {
        // No org found. Try to create one automatically.
        console.log('[ORG] No memberships found. Potential orphan user.');

        try {
          const { data: ensureData, error: ensureErr } = await (supabase.rpc as any)('ensure_user_organization');

          if (!ensureErr && ensureData?.success) {
            console.log('[ORG] New organization created for orphan user, refreshing...');
            await loadOrganizationData(true);
            return;
          } else {
            console.error('[ORG] Automatic workspace creation failed:', ensureErr || ensureData?.error);

            if (retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current += 1;
              setTimeout(() => loadOrganizationData(true), RETRY_DELAY);
              return;
            }
          }
        } catch (e) {
          console.error('[ORG] Exception during automatic creation:', e);
        }

        console.warn('[ORG] Cleanup: User definitively has no organizations after retries.');
        setIsInitialized(true);
        setPermissions(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('[ORG] Critical catch in organization loading:', error);
      setIsInitialized(true);
      setPermissions(prev => ({ ...prev, loading: false }));
    }
  }, [user, refreshSubscription]);

  // DISABLED: Organization switching is not allowed.
  // Each account has exactly one organization - no switching permitted.
  const switchOrganization = useCallback(async (_orgId: string) => {
    console.warn('[ORG] SECURITY: switchOrganization is disabled. Each account has exactly one organization.');
  }, []);

  // Safety timeout to prevent user from being stuck on loading screen
  useEffect(() => {
    if (user?.id && !isInitialized) {
      const timer = setTimeout(() => {
        if (!isInitialized) {
          console.warn('[ORG] Safety timeout! Forcing initialization to avoid locked screen.');
          setIsInitialized(true);
          setPermissions(prev => ({ ...prev, loading: false }));
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, isInitialized]);

  // Initial load with cache
  useEffect(() => {
    if (!user?.id) {
      setPermissions(prev => ({ ...prev, loading: false }));
      setOrganizationId(null);
      setAvailableOrganizations([]);
      setIsInitialized(true);
      return;
    }

    // Try to load from cache FIRST (instant load)
    const cachedData = getOrgCache(user.id);
    if (cachedData) {
      console.log('[ORG] Restoring from cache on mount - instant load');
      setOrganizationId(cachedData.selectedOrganizationId);
      // Enforce single org even from cache
      setAvailableOrganizations(cachedData.availableOrganizations.slice(0, 1));
      setPermissions({ ...cachedData.permissions, loading: false });
      setIsInitialized(true);
      dataLoadedRef.current = true;

      // Refresh in background silently
      backgroundRefreshTimerRef.current = setTimeout(() => loadOrganizationData(true), 100);
    } else {
      // No cache: keep isInitialized=false until data arrives
      console.log('[ORG] No cache - loading data from API');
      setIsInitialized(false);
      loadOrganizationData();
    }

    return () => {
      if (backgroundRefreshTimerRef.current) {
        clearTimeout(backgroundRefreshTimerRef.current);
        backgroundRefreshTimerRef.current = null;
      }
    };
  }, [user?.id]);

  const refresh = useCallback(async () => {
    clearOrgCache();
    await loadOrganizationData(true);
  }, [loadOrganizationData]);

  // Realtime: detectar mudança de cargo (custom_role_id) no membership do usuário atual
  // Assim que o dono atribui/remove/altera um cargo, o membro vê as permissões atualizadas
  // sem precisar dar F5 ou navegar.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`org-member-role-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organization_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const oldRoleId = (payload.old as any)?.custom_role_id ?? null;
          const newRoleId = (payload.new as any)?.custom_role_id ?? null;
          const oldRoleBase = (payload.old as any)?.role ?? null;
          const newRoleBase = (payload.new as any)?.role ?? null;
          const oldActive = (payload.old as any)?.is_active;
          const newActive = (payload.new as any)?.is_active;

          // Recarregar se mudou cargo, role base ou status ativo
          if (
            oldRoleId !== newRoleId ||
            oldRoleBase !== newRoleBase ||
            oldActive !== newActive
          ) {
            console.log('[ORG] Cargo/role do membro alterado via Realtime — recarregando permissões');
            clearOrgCache();
            loadOrganizationData(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadOrganizationData]);

  return (
    <OrganizationContext.Provider value={{
      organizationId,
      permissions,
      availableOrganizations,
      switchOrganization,
      refresh,
      needsOrgSelection: false, // ALWAYS FALSE: org selection is disabled
      isInitialized
    }}>
      {/* NO ORGANIZATION SELECTOR MODAL: Each account has exactly one organization */}
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}

// Backward compatibility hook for existing code
export function useOrganizationPermissions() {
  const { permissions } = useOrganization();
  return permissions;
}
