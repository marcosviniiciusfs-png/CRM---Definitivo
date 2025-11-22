import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const currentSessionIdRef = useRef<string | null>(null);

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
      (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);

        // Registrar login/logout de forma assíncrona
        if (event === 'SIGNED_IN' && session?.user) {
          setTimeout(() => logUserSession(session.user.id, true), 0);
        } else if (event === 'SIGNED_OUT') {
          const currentUserId = session?.user?.id;
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
      .then(({ data: { session } }) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);

        // Se já tem sessão, registrar login
        if (session?.user) {
          setTimeout(() => logUserSession(session.user.id, true), 0);
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

  const signOut = async () => {
    if (user?.id) {
      await logUserSession(user.id, false);
    }
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
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
