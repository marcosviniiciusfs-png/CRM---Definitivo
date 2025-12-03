import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { StarsBackground } from "@/components/ui/stars-background";
import { Login1 } from "@/components/ui/login-1";
import kairozLogo from "@/assets/kairoz-logo-full.png";

const Auth = () => {
  const { signUp, signIn, signInWithGoogle, resetPassword, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (user && !authLoading) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (email: string, password: string) => {
    if (!email || !password) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao fazer login",
        description: error.message === "Invalid login credentials" 
          ? "Email ou senha incorretos" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao CRM",
      });
    }
  };

  const handleSignup = async (email: string, password: string, name: string) => {
    if (!email || !password || !name) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password, name);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.message === "User already registered" 
          ? "Email já cadastrado" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Conta criada com sucesso!",
        description: "Bem-vindo ao CRM",
      });
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao fazer login com Google",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async (email: string) => {
    if (!email) {
      toast({
        title: "Erro",
        description: "Por favor, digite seu email",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir a senha",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <StarsBackground className="min-h-screen" speed={30} factor={0.08}>
      <Login1
        logo={{
          src: kairozLogo,
          alt: "KairoZ",
        }}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onGoogleLogin={handleGoogleLogin}
        onForgotPassword={handleForgotPassword}
        loading={loading}
      />
    </StarsBackground>
  );
};

export default Auth;
