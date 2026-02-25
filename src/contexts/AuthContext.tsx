import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface SubscriptionData {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  max_collaborators: number;
  extra_collaborators: number;
  total_collaborators: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscriptionData: SubscriptionData | null;
  sectionAccess: Record<string, boolean> | null;
  sectionAccessLoading: boolean;
  refreshSubscription: (organizationId?: string) => Promise<void>;
  refreshSectionAccess: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache keys
const SUBSCRIPTION_CACHE_KEY = "kairoz_subscription_cache";
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SECTION_ACCESS_CACHE_KEY = "kairoz_section_access_cache";

interface CachedSubscription {
  data: SubscriptionData;
  timestamp: number;
  userId: string;
  organizationId: string; // Agora inclui a organização
}

// Helper functions for cache - agora considera organizationId
const getSubscriptionCache = (userId: string, organizationId?: string): SubscriptionData | null => {
  try {
    const cacheKey = organizationId
      ? `${SUBSCRIPTION_CACHE_KEY}_${organizationId}`
      : SUBSCRIPTION_CACHE_KEY;
    const cached = sessionStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed: CachedSubscription = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > SUBSCRIPTION_CACHE_TTL;
    const isCorrectUser = parsed.userId === userId;
    const isCorrectOrg = !organizationId || parsed.organizationId === organizationId;

    if (isExpired || !isCorrectUser || !isCorrectOrg) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
};

const setSubscriptionCache = (data: SubscriptionData, userId: string, organizationId?: string) => {
  try {
    const cacheKey = organizationId
      ? `${SUBSCRIPTION_CACHE_KEY}_${organizationId}`
      : SUBSCRIPTION_CACHE_KEY;
    const cacheData: CachedSubscription = {
      data,
      timestamp: Date.now(),
      userId,
      organizationId: organizationId || '',
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch {
    // Ignore storage errors
  }
};

const clearSubscriptionCache = () => {
  try {
    sessionStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
};

const getSectionAccessCache = (userId: string): Record<string, boolean> | null => {
  try {
    const cached = sessionStorage.getItem(SECTION_ACCESS_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed.userId !== userId) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const setSectionAccessCache = (data: Record<string, boolean>, userId: string) => {
  try {
    sessionStorage.setItem(SECTION_ACCESS_CACHE_KEY, JSON.stringify({ data, userId }));
  } catch { }
};

const clearSectionAccessCache = () => {
  try {
    sessionStorage.removeItem(SECTION_ACCESS_CACHE_KEY);
  } catch { }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [sectionAccess, setSectionAccess] = useState<Record<string, boolean> | null>(null);
  const [sectionAccessLoading, setSectionAccessLoading] = useState(true);
  const navigate = useNavigate();
  const currentSessionIdRef = useRef<string | null>(null);
  const subscriptionFetchedRef = useRef(false);
  const sectionAccessFetchedRef = useRef(false);

  // Nova assinatura: aceita organizationId (opcional) para verificar pelo owner da org
  const refreshSubscription = async (organizationId?: string) => {
    console.log('[AUTH] refreshSubscription called, user:', user?.email, 'orgId:', organizationId);

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token || !user) {
      console.log('[AUTH] No active session or user, skipping subscription check');
      return;
    }

    // Check cache first (se tiver organizationId)
    if (organizationId) {
      const cachedData = getSubscriptionCache(user.id, organizationId);
      if (cachedData) {
        console.log('[AUTH] Using cached subscription data for org:', organizationId);
        setSubscriptionData(cachedData);
        return;
      }
    }

    try {
      console.log('[AUTH] Invoking check-subscription function...', { organizationId });
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: organizationId ? { organization_id: organizationId } : {}
      });

      if (error) {
        console.error('[AUTH] Erro ao verificar assinatura:', error);
        return;
      }

      console.log('[AUTH] Subscription data received:', data);
      setSubscriptionData(data);
      setSubscriptionCache(data, user.id, organizationId);
    } catch (error) {
      console.error('[AUTH] Erro ao verificar assinatura:', error);
    }
  };

  const refreshSectionAccess = async () => {
    if (!user?.id) return;

    setSectionAccessLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_section_access')
        .select('section_key, is_enabled')
        .eq('user_id', user.id);

      if (error) {
        console.error('[AUTH] Erro ao carregar acesso a seções:', error);
        return;
      }

      if (data) {
        const map: Record<string, boolean> = {};
        data.forEach((r: any) => {
          map[r.section_key] = r.is_enabled;
        });
        setSectionAccess(map);
        setSectionAccessCache(map, user.id);
        sectionAccessFetchedRef.current = true;
      }
    } finally {
      setSectionAccessLoading(false);
    }
  };

  const logUserSession = async (userId: string, isLogin: boolean) => {
    try {
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!memberData?.organization_id) return;

      if (isLogin) {
        // Verificar se já existe sessão ativa para este usuário
        const { data: existingSession } = await supabase
          .from('user_sessions')
          .select('id')
          .eq('user_id', userId)
          .is('logout_at', null)
          .order('login_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSession) {
          // Reutilizar sessão existente
          currentSessionIdRef.current = existingSession.id;
          return;
        }

        // Criar nova sessão apenas se não existir ativa
        const { data, error } = await supabase
          .from('user_sessions')
          .insert({
            user_id: userId,
            organization_id: memberData.organization_id,
            login_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (!error && data) {
          currentSessionIdRef.current = data.id;
        }
      } else {
        if (currentSessionIdRef.current) {
          const { data: sessionData } = await supabase
            .from('user_sessions')
            .select('login_at')
            .eq('id', currentSessionIdRef.current)
            .single();

          if (sessionData) {
            const loginTime = new Date(sessionData.login_at);
            const logoutTime = new Date();
            const durationMinutes = Math.round((logoutTime.getTime() - loginTime.getTime()) / 60000);

            await supabase
              .from('user_sessions')
              .update({
                logout_at: logoutTime.toISOString(),
                duration_minutes: durationMinutes
              })
              .eq('id', currentSessionIdRef.current);
          }

          currentSessionIdRef.current = null;
        }
      }
    } catch (error) {
      console.error('Erro ao registrar sessão:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AUTH] Auth state change:', event, 'user:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN' && session?.user && session?.access_token) {
          setTimeout(() => logUserSession(session.user.id, true), 0);

          // Check cache first for faster loading
          const cachedData = getSubscriptionCache(session.user.id);
          if (cachedData) {
            console.log('[AUTH] Using cached subscription data on SIGNED_IN');
            setSubscriptionData(cachedData);
          }

          const cachedAccess = getSectionAccessCache(session.user.id);
          if (cachedAccess) {
            console.log('[AUTH] Using cached section access on SIGNED_IN');
            setSectionAccess(cachedAccess);
            setSectionAccessLoading(false);
          }

          // Refresh in background
          setTimeout(async () => {
            if (!mounted) return;
            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (!currentSession?.access_token) return;

              const { data, error } = await supabase.functions.invoke('check-subscription');
              if (!error && data && mounted) {
                setSubscriptionData(data);
                setSubscriptionCache(data, session.user.id);
              }

              // Refresh section access as well
              const { data: accessData } = await supabase
                .from('user_section_access')
                .select('section_key, is_enabled')
                .eq('user_id', session.user.id);

              if (accessData && mounted) {
                const map: Record<string, boolean> = {};
                accessData.forEach((r: any) => { map[r.section_key] = r.is_enabled; });
                setSectionAccess(map);
                setSectionAccessCache(map, session.user.id);
                setSectionAccessLoading(false);
              }
            } catch (error) {
              console.error('[AUTH] Erro ao verificar dados após login:', error);
            }
          }, 500);
        } else if (event === 'SIGNED_OUT') {
          const currentUserId = session?.user?.id;
          setSubscriptionData(null);
          setSectionAccess(null);
          setSectionAccessLoading(false);
          clearSubscriptionCache();
          clearSectionAccessCache();
          subscriptionFetchedRef.current = false;
          sectionAccessFetchedRef.current = false;
          setTimeout(() => {
            if (currentUserId) {
              logUserSession(currentUserId, false);
            }
          }, 0);
        }
      }
    );

    // Initial session check - OPTIMIZED: Non-blocking
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;

        console.log('[AUTH] Initial session check, user:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        // LIBERAR LOADING IMEDIATAMENTE - não bloquear UI
        setLoading(false);

        if (session?.user && session?.access_token) {
          // NÃO logar sessão aqui - já é feito no SIGNED_IN

          // Check cache first para UI rápida
          const cachedData = getSubscriptionCache(session.user.id);
          if (cachedData) {
            console.log('[AUTH] Using cached subscription data on initial load');
            setSubscriptionData(cachedData);
            subscriptionFetchedRef.current = true;
          }

          const cachedAccess = getSectionAccessCache(session.user.id);
          if (cachedAccess) {
            console.log('[AUTH] Using cached section access on initial load');
            setSectionAccess(cachedAccess);
            setSectionAccessLoading(false);
            sectionAccessFetchedRef.current = true;
          }

          // Atualizar dados em BACKGROUND (não bloquear)
          setTimeout(async () => {
            if (!mounted) return;
            try {
              // 1. Subscription
              const { data: subData, error: subError } = await supabase.functions.invoke('check-subscription');
              if (!subError && subData && mounted) {
                setSubscriptionData(subData);
                setSubscriptionCache(subData, session.user.id);
                subscriptionFetchedRef.current = true;
              }

              // 2. Section Access
              const { data: accData, error: accError } = await supabase
                .from('user_section_access')
                .select('section_key, is_enabled')
                .eq('user_id', session.user.id);

              if (!accError && accData && mounted) {
                const map: Record<string, boolean> = {};
                accData.forEach((r: any) => { map[r.section_key] = r.is_enabled; });
                setSectionAccess(map);
                setSectionAccessCache(map, session.user.id);
                setSectionAccessLoading(false);
                sectionAccessFetchedRef.current = true;
              }
            } catch (error) {
              console.error('[AUTH] Erro ao verificar dados iniciais:', error);
            }
          }, 100);
        }
      })
      .catch((error) => {
        console.error('[AUTH] Erro ao obter sessão:', error);
        if (mounted) {
          setLoading(false);
          setSectionAccessLoading(false);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name: name,
        }
      }
    });

    // Não redirecionar aqui - deixar a página de Auth verificar múltiplas orgs
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Limpar cache de organização para garantir verificação limpa
    try {
      localStorage.removeItem('kairoz_org_cache');
    } catch { }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Não redirecionar aqui - deixar a página de Auth verificar múltiplas orgs
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      }
    });

    return { error };
  };

  const signOut = async () => {
    if (user?.id) {
      await logUserSession(user.id, false);
    }
    clearSubscriptionCache();
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      subscriptionData,
      sectionAccess,
      sectionAccessLoading,
      refreshSubscription,
      refreshSectionAccess,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
