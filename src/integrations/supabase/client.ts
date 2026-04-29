import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';

// Storage seguro com fallback: tenta localStorage, se falhar usa memória
const createSafeStorage = () => {
  const memoryStore: Record<string, string> = {};

  return {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return memoryStore[key] ?? null;
      }
    },
    setItem: (key: string, value: string) => {
      memoryStore[key] = value;
      try {
        localStorage.setItem(key, value);
      } catch {
        // localStorage cheio ou bloqueado (iOS privado, etc.)
      }
    },
    removeItem: (key: string) => {
      delete memoryStore[key];
      try {
        localStorage.removeItem(key);
      } catch {
        // silencioso
      }
    },
  };
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: createSafeStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});

// CRITICAL: keep Realtime WebSocket auth in sync with the user session.
// Without this, when autoRefreshToken renews the JWT, the WebSocket keeps
// using the OLD token. Once that old token expires, RLS-enforced events
// (postgres_changes on tables with RLS) stop being delivered silently —
// the channel stays "SUBSCRIBED" but no payloads arrive. Symptom in this
// app: messages and leads only appear after a full page refresh.
supabase.auth.onAuthStateChange((_event, session) => {
  // Realtime accepts undefined to fall back to anon key.
  supabase.realtime.setAuth(session?.access_token ?? undefined as any);
});

// Apply current session token immediately on module load (covers cases
// where the session restored from storage but onAuthStateChange has not
// fired yet by the time the first channel subscribes).
supabase.auth.getSession().then(({ data }) => {
  if (data.session?.access_token) {
    supabase.realtime.setAuth(data.session.access_token);
  }
});
