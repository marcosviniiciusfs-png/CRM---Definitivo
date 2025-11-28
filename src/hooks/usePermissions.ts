import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Permissions {
  // Gerenciamento de colaboradores
  canManageCollaborators: boolean;
  canDeleteCollaborators: boolean;
  canChangeRoles: boolean;
  
  // Roleta de leads
  canCreateRoulettes: boolean;
  canDeleteRoulettes: boolean;
  canManualDistribute: boolean;
  
  // Leads
  canViewAllLeads: boolean;
  canAssignLeads: boolean;
  canDeleteLeads: boolean;
  
  // Automação
  canManageAutomation: boolean;
  
  // Integrações
  canManageIntegrations: boolean;
  
  // Tags
  canManageTags: boolean;
  
  // Pipeline
  canManagePipeline: boolean;
  
  // Métricas
  canViewTeamMetrics: boolean;
  
  // Produção/Equipes/Atividades
  canAccessAdminSection: boolean;
  
  // Role atual
  role: 'owner' | 'admin' | 'member' | null;
  loading: boolean;
}

export function usePermissions(): Permissions {
  const [permissions, setPermissions] = useState<Permissions>({
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
    role: null,
    loading: true,
  });

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions(prev => ({ ...prev, loading: false }));
        return;
      }

      // Get organization role
      const { data: orgRole } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      const role = orgRole?.role as 'owner' | 'admin' | 'member' | null;

      // Define permissions based on role
      const isOwner = role === 'owner';
      const isAdmin = role === 'admin';
      const isMember = role === 'member';

      setPermissions({
        // Owner: tudo
        // Admin: pode adicionar colaboradores mas não excluir nem mudar cargos
        // Member: não pode gerenciar colaboradores
        canManageCollaborators: isOwner || isAdmin,
        canDeleteCollaborators: isOwner,
        canChangeRoles: isOwner,
        
        // Owner e Admin: criar/editar roletas
        // Owner: pode excluir
        // Admin: não pode excluir
        canCreateRoulettes: isOwner || isAdmin,
        canDeleteRoulettes: isOwner,
        canManualDistribute: isOwner || isAdmin,
        
        // Leads
        canViewAllLeads: isOwner || isAdmin,
        canAssignLeads: isOwner || isAdmin,
        canDeleteLeads: isOwner || isAdmin,
        
        // Automação
        canManageAutomation: isOwner || isAdmin,
        
        // Integrações
        canManageIntegrations: isOwner || isAdmin,
        
        // Tags
        canManageTags: isOwner || isAdmin,
        
        // Pipeline
        canManagePipeline: isOwner || isAdmin,
        
        // Métricas
        canViewTeamMetrics: isOwner || isAdmin,
        
        // Seção administrativa
        canAccessAdminSection: isOwner || isAdmin,
        
        role,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions(prev => ({ ...prev, loading: false }));
    }
  };

  return permissions;
}
