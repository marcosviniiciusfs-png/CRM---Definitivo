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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const navigate = useNavigate();
  const currentSessionIdRef = useRef<string | null>(null);

  const refreshSubscription = async () => {
    console.log('[AUTH] refreshSubscription called, user:', user?.email);
    
    // Verificar se há sessão ativa
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      console.log('[AUTH] No active session, skipping subscription check');
      return;
    }
    
    if (!user) {
      console.log('[AUTH] No user, skipping subscription check');
      return;
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
    } catch (error) {
      console.error('[AUTH] Erro ao verificar assinatura:', error);
    }
  };

  const logUserSession = async (userId: string, isLogin: boolean) => {
    try {
      // Buscar organização do usuário
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!memberData?.organization_id) return;

      if (isLogin) {
        // Criar nova sessão
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
        // Atualizar sessão com logout
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

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('[AUTH] Auth state change:', event, 'user:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        // Registrar login/logout de forma assíncrona
        if (event === 'SIGNED_IN' && session?.user && session?.access_token) {
          setTimeout(() => logUserSession(session.user.id, true), 0);
          // Verificar assinatura após login
          setTimeout(async () => {
            console.log('[AUTH] Calling refreshSubscription after SIGNED_IN');
            try {
              // Verificar se a sessão ainda está ativa antes de chamar
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (!currentSession?.access_token) {
                console.log('[AUTH] No active session, skipping subscription check');
                return;
              }
              
              const { data, error } = await supabase.functions.invoke('check-subscription');
              if (error) {
                console.error('[AUTH] Erro ao verificar assinatura após login:', error);
                return;
              }
              console.log('[AUTH] Subscription data após login:', data);
              setSubscriptionData(data);
            } catch (error) {
              console.error('[AUTH] Erro ao verificar assinatura após login:', error);
            }
          }, 500);
        } else if (event === 'SIGNED_OUT') {
          const currentUserId = session?.user?.id;
          setSubscriptionData(null);
          setTimeout(() => {
            if (currentUserId) {
              logUserSession(currentUserId, false);
            }
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        
        console.log('[AUTH] Initial session check, user:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        // Se já tem sessão, registrar login e verificar assinatura
        if (session?.user && session?.access_token) {
          setTimeout(() => logUserSession(session.user.id, true), 0);
          // Verificar assinatura apenas se temos token de acesso
          try {
            const { data, error } = await supabase.functions.invoke('check-subscription');
            if (error) {
              console.error('[AUTH] Erro ao verificar assinatura inicial:', error);
            } else {
              console.log('[AUTH] Subscription data inicial:', data);
              setSubscriptionData(data);
            }
          } catch (error) {
            console.error('[AUTH] Erro ao verificar assinatura inicial:', error);
          }
        }
      })
      .finally(() => {
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
