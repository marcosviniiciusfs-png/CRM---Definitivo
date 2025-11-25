import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { StarsBackground } from "@/components/ui/stars-background";
import kairozLogo from "@/assets/kairoz-logo-full.png";
import "./Auth.css";

const Auth = () => {
  const { signUp, signIn, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signupEmail || !signupPassword || !signupName) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
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
        </div>
        
        <div className="flip-card-container">
          <div className={`flip-card__inner ${!isLogin ? 'flip-card--flipped' : ''}`}>
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
                <button
                  type="button"
                  className="flip-card__btn--secondary"
                  onClick={() => setIsLogin(false)}
                  disabled={loading}
                >
                  Criar Conta
                </button>
              </form>
            </div>
            <div className="flip-card__back">
              <form onSubmit={handleSignup} className="flip-card__form">
                <h2 className="title">Cadastro</h2>
                <input
                  type="text"
                  placeholder="Nome Completo"
                  className="flip-card__input"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  disabled={loading}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="flip-card__input"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={loading}
                  required
                />
                <input
                  type="password"
                  placeholder="Senha"
                  className="flip-card__input"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="submit" 
                  className="flip-card__btn"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Cadastrar"}
                </button>
                <button
                  type="button"
                  className="flip-card__btn--secondary"
                  onClick={() => setIsLogin(true)}
                  disabled={loading}
                >
                  Voltar ao Login
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
