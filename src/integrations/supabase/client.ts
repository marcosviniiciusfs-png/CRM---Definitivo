import { createClient } from '@supabase/supabase-js';
import { validateSupabaseFrontendConfig } from './config';
import type { Database } from './types';

const {
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
} = validateSupabaseFrontendConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

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

/**
 * Cadeado da sessão entre abas. A biblioteca usa o Navigator LockManager e, quando outra aba segura o
 * cadeado, a nova espera e falha com "lock:sb-api-auth-token timed out". Aqui a espera é limitada a
 * poucos segundos; se o cadeado não for liberado, a operação segue sem ele em vez de travar o login.
 */
const MAX_LOCK_WAIT_MS = 4000;

const tolerantLock = async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  if (typeof navigator === "undefined" || !navigator.locks) return fn();

  const waitMs = acquireTimeout < 0 ? MAX_LOCK_WAIT_MS : Math.min(acquireTimeout, MAX_LOCK_WAIT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);
  let started = false;

  try {
    return await navigator.locks.request(name, { signal: controller.signal }, async () => {
      started = true;
      clearTimeout(timer);
      return fn();
    });
  } catch (error) {
    clearTimeout(timer);
    // Só recorre ao modo sem cadeado se a espera acabou antes de a operação começar.
    if (!started && (error as { name?: string })?.name === "AbortError") return fn();
    throw error;
  }
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: createSafeStorage(),
    persistSession: true,
    autoRefreshToken: true,
    lock: tolerantLock,
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
