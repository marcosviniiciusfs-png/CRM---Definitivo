import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Features that are locked by default (can be unlocked via user_section_access)
const LOCKED_FEATURES = ['lead-metrics', 'lead-distribution', 'chat', 'integrations'];

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
  const { sectionAccess, sectionAccessLoading, user } = useAuth();

  // If user exists but sectionAccess hasn't loaded yet, treat as loading
  const loading = sectionAccessLoading || (!!user && sectionAccess === null);

  const isSectionUnlocked = useCallback((path: string) => {
    const sectionKey = URL_TO_SECTION[path];
    if (!sectionKey) return true; // unknown paths are accessible

    // Check explicit access override
    if (sectionAccess) {
      if (sectionAccess[sectionKey] === true) return true;
      if (sectionAccess[sectionKey] === false) return false;
    }

    // Default: locked features are locked, others are open
    return !LOCKED_FEATURES.includes(sectionKey);
  }, [sectionAccess]);

  return { isSectionUnlocked, loading, sectionAccess };
}
