import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { StarsBackground } from "@/components/ui/stars-background";
import "./Auth.css";

const Auth = () => {
  const { signUp, signIn, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // Redirect if already logged in
  if (user && !authLoading) {
    return <Navigate to="/" replace />;
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

    if (!signupName || !signupEmail || !signupPassword || !signupConfirmPassword) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (signupPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        toast({
          title: "Erro ao criar conta",
          description: "Este email já está cadastrado. Tente fazer login.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao criar conta",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Conta criada com sucesso!",
        description: "Você já pode acessar o CRM",
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
          <h1>CRM</h1>
        </div>
        
        <div className="flip-card-container">
          <div className="switch">
            <input 
              type="checkbox" 
              id="toggle" 
              className="toggle"
              checked={isSignUp}
              onChange={(e) => setIsSignUp(e.target.checked)}
            />
            <label htmlFor="toggle" className="slider"></label>
            <label htmlFor="toggle" className="card-side"></label>
          </div>
          
          <div className={`flip-card__inner ${isSignUp ? 'flipped' : ''}`}>
            {/* Login Card (Front) */}
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
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Log In"}
                </button>
              </form>
            </div>

            {/* Sign Up Card (Back) */}
            <div className="flip-card__back">
              <form onSubmit={handleSignup} className="flip-card__form">
                <h2 className="title">Cadastro</h2>
                <input
                  type="text"
                  placeholder="Nome"
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
                <input
                  type="password"
                  placeholder="Confirmar Senha"
                  className="flip-card__input"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="submit" 
                  className="flip-card__btn"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Sign Up"}
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
