import { useOrganization } from "@/contexts/OrganizationContext";

interface KanbanPermissions {
  isOwnerOrAdmin: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAllTasks: boolean;
  canDeleteTasks: boolean;
}

/**
 * Hook to compute granular Kanban permissions based on organization role.
 * Owner and Admin roles bypass all permission checks.
 */
export function useKanbanPermissions(): KanbanPermissions {
  const { permissions } = useOrganization();

  const isOwnerOrAdmin = permissions.role === 'owner' || permissions.role === 'admin';
  const canCreateTasks = isOwnerOrAdmin || permissions.canCreateTasks;
  const canEditOwnTasks = isOwnerOrAdmin || permissions.canEditOwnTasks;
  const canEditAllTasks = isOwnerOrAdmin || permissions.canEditAllTasks;
  const canDeleteTasks = isOwnerOrAdmin || permissions.canDeleteTasks;

  return {
    isOwnerOrAdmin,
    canCreateTasks,
    canEditOwnTasks,
    canEditAllTasks,
    canDeleteTasks,
  };
}
