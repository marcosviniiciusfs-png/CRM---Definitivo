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
