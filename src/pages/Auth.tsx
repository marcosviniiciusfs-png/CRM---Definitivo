import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { StarsBackground } from "@/components/ui/stars-background";
import kairozLogo from "@/assets/kairoz-logo-full.png";
import "./Auth.css";

const Auth = () => {
  const { signIn, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Redirect if already logged in
  if (user && !authLoading) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginEmail || !loginPassword) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
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


  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <StarsBackground className="min-h-screen" speed={30} factor={0.08}>
      <div className="auth-wrapper">
        <div className="auth-header">
          <img src={kairozLogo} alt="KairoZ" className="w-64 h-auto mx-auto" />
          <p className="text-muted-foreground text-sm mt-4">
            Para criar uma conta, entre em contato com o administrador da sua organização
          </p>
        </div>
        
        <div className="flip-card-container">
          <div className="flip-card__inner">
            <div className="flip-card__front">
              <form onSubmit={handleLogin} className="flip-card__form">
                <h2 className="title">Login</h2>
                <input
                  type="email"
                  placeholder="Email"
                  className="flip-card__input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  disabled={loading}
                  required
                />
                <input
                  type="password"
                  placeholder="Senha"
                  className="flip-card__input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="submit" 
                  className="flip-card__btn"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Entrar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </StarsBackground>
  );
};

export default Auth;
