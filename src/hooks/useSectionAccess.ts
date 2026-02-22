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
  const { user } = useAuth();
  const [sectionAccess, setSectionAccess] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const loadAccess = async () => {
      try {
        const { data } = await supabase
          .from('user_section_access')
          .select('section_key, is_enabled')
          .eq('user_id', user.id);

        if (data && data.length > 0) {
          const map: Record<string, boolean> = {};
          data.forEach((r: any) => {
            map[r.section_key] = r.is_enabled;
          });
          setSectionAccess(map);
        }
      } finally {
        setLoading(false);
      }
    };

    loadAccess();
  }, [user?.id]);

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

  return { isSectionUnlocked, loading };
}
