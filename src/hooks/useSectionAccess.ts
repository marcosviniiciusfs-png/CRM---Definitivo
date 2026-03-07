import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

const URL_TO_SECTION: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/pipeline': 'pipeline',
  '/leads': 'leads',
  '/lead-metrics': 'lead-metrics',
  '/lead-distribution': 'lead-distribution',
  '/chat': 'chat',
  '/ranking': 'ranking',
  '/administrativo/colaboradores': 'colaboradores',
  '/administrativo/producao': 'producao',
  '/administrativo/equipes': 'equipes',
  '/administrativo/atividades': 'atividades',
  '/tasks': 'tasks',
  '/integrations': 'integrations',
  '/settings': 'settings',
};

const LOCKED_FEATURES: string[] = [];

export function useSectionAccess() {
  const { sectionAccess, sectionAccessLoading, user, isSuperAdmin } = useAuth();
  const { role } = usePermissions();

  const loading = sectionAccessLoading || (!!user && sectionAccess === null);

  const isSectionUnlocked = useCallback((path: string): boolean => {
    const sectionKey = URL_TO_SECTION[path];
    if (!sectionKey) return true;

    // Owners, admins e superadmins sempre têm acesso total — nunca bloqueie
    if (isSuperAdmin || role === 'owner' || role === 'admin') return true;

    if (sectionAccess) {
      if (sectionAccess[sectionKey] === true) return true;
      if (sectionAccess[sectionKey] === false) return false;
    }

    return !LOCKED_FEATURES.includes(sectionKey);
  }, [sectionAccess, isSuperAdmin, role]);

  return { isSectionUnlocked, loading, sectionAccess };
}
