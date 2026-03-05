import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

// Features that are locked by default (everyone has access now)
const LOCKED_FEATURES: string[] = [];

// URL path to section key mapping
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

export function useSectionAccess() {
  const { sectionAccess, sectionAccessLoading, user, isSuperAdmin } = useAuth();

  // If user exists but sectionAccess hasn't loaded yet, treat as loading
  const loading = sectionAccessLoading || (!!user && sectionAccess === null);

  const isSectionUnlocked = useCallback((path: string) => {
    // Super Admin has access to EVERYTHING
    if (isSuperAdmin) return true;

    const sectionKey = URL_TO_SECTION[path];
    if (!sectionKey) return true; // unknown paths are accessible

    // Check explicit access override
    if (sectionAccess) {
      if (sectionAccess[sectionKey] === true) return true;
      if (sectionAccess[sectionKey] === false) return false;
    }

    // Default: locked features are locked, others are open
    return !LOCKED_FEATURES.includes(sectionKey);
  }, [sectionAccess, isSuperAdmin]);

  return { isSectionUnlocked, loading, sectionAccess };
}
