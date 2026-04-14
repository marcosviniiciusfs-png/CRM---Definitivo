import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
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
  signUp: (email: string, password: string, name: string) => Promise<{ error: unknown }>;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signInWithGoogle: () => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: unknown }>;
  isSuperAdmin: boolean;
  roleLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache keys
const SUBSCRIPTION_CACHE_KEY = "kairoz_subscription_cache";
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SECTION_ACCESS_CACHE_KEY = "kairoz_section_access_cache";
const FAST_ACCESS_CACHE_KEY = "kairoz_fast_access_cache";

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
  } catch (error) {
    logger.error('Error setting section access cache:', error);
  }
};

const clearSectionAccessCache = () => {
  try {
    sessionStorage.removeItem(SECTION_ACCESS_CACHE_KEY);
    sessionStorage.removeItem(FAST_ACCESS_CACHE_KEY);
  } catch (error) {
    logger.error('Error clearing section access cache:', error);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [sectionAccess, setSectionAccess] = useState<Record<string, boolean> | null>(() => {
    try {
      const cached = sessionStorage.getItem(FAST_ACCESS_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Error parsing fast access cache:', error);
      return null;
    }
  });
  const [sectionAccessLoading, setSectionAccessLoading] = useState(() => {
    try {
      return sessionStorage.getItem(FAST_ACCESS_CACHE_KEY) === null;
    } catch (error) {
      logger.error('Error checking fast access cache:', error);
      return true;
    }
  });
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const currentSessionIdRef = useRef<string | null>(null);
  const subscriptionFetchedRef = useRef(false);
  const sectionAccessFetchedRef = useRef(false);

  const checkSuperAdmin = async (userId: string) => {
    setRoleLoading(true);
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'super_admin'
      });
      if (!error && data) {
        setIsSuperAdmin(true);
      } else {
        setIsSuperAdmin(false);
      }
    } catch {
      setIsSuperAdmin(false);
    } finally {
      setRoleLoading(false);
    }
  };

  const refreshSubscription = async (organizationId?: string) => {
    if (!user?.id) return;

    try {
      // Check cache first
      const cached = getSubscriptionCache(user.id, organizationId);
      if (cached) {
        setSubscriptionData(cached);
        return;
      }

      logger.log('[AUTH] refreshing subscription for:', organizationId || 'personal');

      // Tentar buscar assinatura ativa do banco
      const query = supabase
        .from('subscriptions')
        .select('*')
        .eq('status', 'active');

      if (organizationId) {
        query.eq('organization_id', organizationId);
      } else {
        query.eq('user_id', user.id);
      }

      const { data: sub, error } = await query.limit(1).maybeSingle();

      if (error) {
        logger.error('[AUTH] Subscription fetch error:', error);
      }

      let subData: SubscriptionData;

      if (sub) {
        subData = {
          subscribed: true,
          product_id: sub.plan_id || 'pro',
          subscription_end: sub.end_date,
          max_collaborators: 5 + (sub.extra_collaborators || 0),
          extra_collaborators: sub.extra_collaborators || 0,
          total_collaborators: 5 + (sub.extra_collaborators || 0)
        };
      } else {
        // Fallback inteligente: novas contas = 5 colaboradores, contas existentes = 20 ou mais
        logger.log('[AUTH] Using fallback plan - checking existing members');

        let maxCollaborators = 5; // Default para novas contas

        if (organizationId) {
          // Contar membros existentes na organização
          const { count } = await supabase
            .from('organization_members')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId);

          if (count && count > 0) {
            // Conta existente: mínimo 20, ou mais se já tiver mais membros
            maxCollaborators = Math.max(20, count);
            logger.log('[AUTH] Existing organization with', count, 'members, setting limit to', maxCollaborators);
          }
        }

        subData = {
          subscribed: false,
          product_id: 'free',
          subscription_end: null,
          max_collaborators: maxCollaborators,
          extra_collaborators: 0,
          total_collaborators: maxCollaborators
        };
      }

      setSubscriptionData(subData);
      setSubscriptionCache(subData, user.id, organizationId);
    } catch (err) {
      logger.error('[AUTH] Refresh subscription failed:', err);
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
        logger.error('[AUTH] Erro ao carregar acesso a seções:', error);
        return;
      }

      if (data) {
        const map: Record<string, boolean> = {};
        data.forEach((r) => {
          map[r.section_key] = r.is_enabled;
        });
        setSectionAccess(map);
        setSectionAccessCache(map, user.id);
        sessionStorage.setItem(FAST_ACCESS_CACHE_KEY, JSON.stringify(map));
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
        .limit(1)
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
          .limit(1)
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
            .limit(1)
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
      logger.error('Erro ao registrar sessão:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        logger.log('[AUTH] Auth state change:', event, 'user:', session?.user?.email);

        // TOKEN_REFRESHED: keep existing data, don't reset anything
        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
          return;
        }

        // INITIAL_SESSION: fires on tab open/focus. Skip if same user already loaded.
        if (event === 'INITIAL_SESSION') {
          if (session?.user && user?.id === session.user.id && subscriptionFetchedRef.current) {
            // Same session already loaded - just update tokens, no data reload
            setSession(session);
            setUser(session.user);
            return;
          }
          // First load or different user - proceed normally
          setSession(session);
          setUser(session?.user ?? null);
          if (!session?.user) {
            setLoading(false);
          }
          // Fall through to SIGNED_IN handling below
        } else {
          setSession(session);
          setUser(session?.user ?? null);
        }

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && session?.access_token) {
          checkSuperAdmin(session.user.id);
          setTimeout(() => logUserSession(session.user.id, true), 0);

          // Check cache first for faster loading
          const cachedData = getSubscriptionCache(session.user.id);
          if (cachedData) {
            logger.log('[AUTH] Using cached subscription data on SIGNED_IN');
            setSubscriptionData(cachedData);
          }

          const cachedAccess = getSectionAccessCache(session.user.id);
          if (cachedAccess) {
            logger.log('[AUTH] Using cached section access on SIGNED_IN');
            setSectionAccess(cachedAccess);
            // Mantemos o loading como true se vamos atualizar em background
          }

          // ATIVAR LOADING IMEDIATAMENTE antes do timeout para evitar flicker na UI
          setSectionAccessLoading(true);

          // Refresh in background
          setTimeout(async () => {
            if (!mounted) return;

            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (!currentSession?.access_token) return;

              // Fallback inteligente: buscar organização e contar membros
              let maxCollaborators = 5; // Default para novas contas

              const { data: memberData } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', session.user.id)
                .limit(1)
                .maybeSingle();

              if (memberData?.organization_id) {
                const { count } = await supabase
                  .from('organization_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('organization_id', memberData.organization_id);

                if (count && count > 0) {
                  maxCollaborators = Math.max(20, count);
                }
              }

              setSubscriptionData({
                subscribed: false,
                product_id: 'free',
                subscription_end: null,
                max_collaborators: maxCollaborators,
                extra_collaborators: 0,
                total_collaborators: maxCollaborators
              });

              // Refresh section access as well
              const { data: accessData } = await supabase
                .from('user_section_access')
                .select('section_key, is_enabled')
                .eq('user_id', session.user.id);

              if (accessData && mounted) {
                const map: Record<string, boolean> = {};
                accessData.forEach((r) => { map[r.section_key] = r.is_enabled; });
                setSectionAccess(map);
                setSectionAccessCache(map, session.user.id);
                sessionStorage.setItem(FAST_ACCESS_CACHE_KEY, JSON.stringify(map));
                sectionAccessFetchedRef.current = true;
              } else if (mounted) {
                setSectionAccess({});
              }
            } catch (error) {
              logger.error('[AUTH] Erro ao verificar dados após login:', error);
              if (mounted) setSectionAccess({});
            } finally {
              setSectionAccessLoading(false);
            }
          }, 500);
        } else if (event === 'SIGNED_OUT') {
          // Only clear state on actual sign out (no active session)
          if (!session?.user) {
            const currentUserId = user?.id;
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
      }
    );

    // Initial session check - OPTIMIZED: Non-blocking
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;

        logger.log('[AUTH] Initial session check, user:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        // LIBERAR LOADING IMEDIATAMENTE - não bloquear UI
        setLoading(false);

        if (session?.user && session?.access_token) {
          checkSuperAdmin(session.user.id);
          // NÃO logar sessão aqui - já é feito no SIGNED_IN

          // Check cache first para UI rápida
          const cachedData = getSubscriptionCache(session.user.id);
          if (cachedData) {
            logger.log('[AUTH] Using cached subscription data on initial load');
            setSubscriptionData(cachedData);
            subscriptionFetchedRef.current = true;
          }

          const cachedAccess = getSectionAccessCache(session.user.id);
          if (cachedAccess) {
            logger.log('[AUTH] Using cached section access on initial load');
            setSectionAccess(cachedAccess);
            // Mantemos o loading como true se vamos atualizar em background
            sectionAccessFetchedRef.current = true;
          }

          // ATIVAR LOADING IMEDIATAMENTE (síncrono) para evitar flicker
          setSectionAccessLoading(true);

          // Atualizar dados em BACKGROUND (não bloquear)
          setTimeout(async () => {
            if (!mounted) return;

            try {
              // Fallback inteligente: buscar organização e contar membros
              let maxCollaborators = 5; // Default para novas contas

              const { data: memberData } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', session.user.id)
                .limit(1)
                .maybeSingle();

              if (memberData?.organization_id) {
                const { count } = await supabase
                  .from('organization_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('organization_id', memberData.organization_id);

                if (count && count > 0) {
                  maxCollaborators = Math.max(20, count);
                }
              }

              setSubscriptionData({
                subscribed: false,
                product_id: 'free',
                subscription_end: null,
                max_collaborators: maxCollaborators,
                extra_collaborators: 0,
                total_collaborators: maxCollaborators
              });
              subscriptionFetchedRef.current = true;

              // 2. Section Access
              const { data: accData, error: accError } = await supabase
                .from('user_section_access')
                .select('section_key, is_enabled')
                .eq('user_id', session.user.id);

              if (!accError && accData && mounted) {
                const map: Record<string, boolean> = {};
                accData.forEach((r) => { map[r.section_key] = r.is_enabled; });
                setSectionAccess(map);
                setSectionAccessCache(map, session.user.id);
                sessionStorage.setItem(FAST_ACCESS_CACHE_KEY, JSON.stringify(map));
                sectionAccessFetchedRef.current = true;
              } else if (mounted) {
                // Se não há dados, garantimos que não fique null para liberar a UI
                setSectionAccess({});
              }
            } catch (error) {
              logger.error('[AUTH] Erro ao verificar dados iniciais:', error);
              if (mounted) setSectionAccess({});
            } finally {
              setSectionAccessLoading(false);
            }
          }, 100);
        }
      })
      .catch((error) => {
        logger.error('[AUTH] Erro ao obter sessão:', error);
        if (mounted) {
          setLoading(false);
        }
        setSectionAccessLoading(false);
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
    } catch (error) {
      logger.error('Error removing org cache:', error);
    }

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
      resetPassword,
      isSuperAdmin,
      roleLoading
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
