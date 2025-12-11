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
  refreshSubscription: () => Promise<void>;
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

interface CachedSubscription {
  data: SubscriptionData;
  timestamp: number;
  userId: string;
}

// Helper functions for cache
const getSubscriptionCache = (userId: string): SubscriptionData | null => {
  try {
    const cached = sessionStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedSubscription = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > SUBSCRIPTION_CACHE_TTL;
    const isCorrectUser = parsed.userId === userId;
    
    if (isExpired || !isCorrectUser) {
      sessionStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
      return null;
    }
    
    return parsed.data;
  } catch {
    sessionStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
    return null;
  }
};

const setSubscriptionCache = (data: SubscriptionData, userId: string) => {
  try {
    const cacheData: CachedSubscription = {
      data,
      timestamp: Date.now(),
      userId,
    };
    sessionStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cacheData));
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const navigate = useNavigate();
  const currentSessionIdRef = useRef<string | null>(null);
  const subscriptionFetchedRef = useRef(false);

  const refreshSubscription = async (forceRefresh = false) => {
    console.log('[AUTH] refreshSubscription called, user:', user?.email, 'force:', forceRefresh);
    
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token || !user) {
      console.log('[AUTH] No active session or user, skipping subscription check');
      return;
    }
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = getSubscriptionCache(user.id);
      if (cachedData) {
        console.log('[AUTH] Using cached subscription data');
        setSubscriptionData(cachedData);
        return;
      }
    }
    
    try {
      console.log('[AUTH] Invoking check-subscription function...');
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('[AUTH] Erro ao verificar assinatura:', error);
        return;
      }
      
      console.log('[AUTH] Subscription data received:', data);
      setSubscriptionData(data);
      setSubscriptionCache(data, user.id);
    } catch (error) {
      console.error('[AUTH] Erro ao verificar assinatura:', error);
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
            } catch (error) {
              console.error('[AUTH] Erro ao verificar assinatura após login:', error);
            }
          }, 500);
        } else if (event === 'SIGNED_OUT') {
          const currentUserId = session?.user?.id;
          setSubscriptionData(null);
          clearSubscriptionCache();
          subscriptionFetchedRef.current = false;
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
          // Log session em background
          setTimeout(() => logUserSession(session.user.id, true), 0);
          
          // Check cache first para UI rápida
          const cachedData = getSubscriptionCache(session.user.id);
          if (cachedData) {
            console.log('[AUTH] Using cached subscription data on initial load');
            setSubscriptionData(cachedData);
            subscriptionFetchedRef.current = true;
          }
          
          // Atualizar subscription em BACKGROUND (não bloquear)
          setTimeout(async () => {
            if (!mounted) return;
            try {
              const { data, error } = await supabase.functions.invoke('check-subscription');
              if (!error && data && mounted) {
                setSubscriptionData(data);
                setSubscriptionCache(data, session.user.id);
                subscriptionFetchedRef.current = true;
              }
            } catch (error) {
              console.error('[AUTH] Erro ao verificar assinatura inicial:', error);
            }
          }, 100);
        }
      })
      .catch((error) => {
        console.error('[AUTH] Erro ao obter sessão:', error);
        if (mounted) {
          setLoading(false);
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
    
    if (!error) {
      navigate("/dashboard");
    }
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error) {
      navigate("/dashboard");
    }
    
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
    <AuthContext.Provider value={{ user, session, loading, subscriptionData, refreshSubscription, signUp, signIn, signInWithGoogle, signOut, resetPassword }}>
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
