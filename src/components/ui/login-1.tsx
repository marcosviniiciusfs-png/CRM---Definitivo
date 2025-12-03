import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Login1Props {
  logo: {
    src: string;
    alt: string;
  };
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<void>;
  loading?: boolean;
}

const Login1 = ({
  logo,
  onLogin,
  onSignup,
  loading = false,
}: Login1Props) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await onLogin(email, password);
    } else {
      await onSignup(email, password, name);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setEmail("");
    setPassword("");
    setName("");
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="border-border bg-card/95 backdrop-blur-sm flex w-full max-w-sm flex-col items-center gap-y-6 rounded-xl border px-6 py-10 shadow-xl">
        {/* Logo */}
        <div className="flex flex-col items-center gap-y-2">
          <img
            src={logo.src}
            alt={logo.alt}
            className="h-16 w-auto"
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground">
          {isLogin ? "Login" : "Criar Conta"}
        </h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
          <div className={cn(
            "flex flex-col gap-4 transition-all duration-300",
            !isLogin ? "animate-fade-in" : ""
          )}>
            {/* Name field - only for signup */}
            {!isLogin && (
              <Input
                type="text"
                placeholder="Nome Completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required={!isLogin}
                className="h-11"
              />
            )}
            
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="h-11"
            />
            
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="h-11"
            />
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              type="submit" 
              className="h-11 w-full"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                isLogin ? "Entrar" : "Cadastrar"
              )}
            </Button>
            
            <Button 
              type="button"
              variant="outline" 
              className="h-11 w-full"
              disabled={loading}
            >
              <FcGoogle className="mr-2 size-5" />
              {isLogin ? "Entrar com Google" : "Cadastrar com Google"}
            </Button>
          </div>
        </form>

        {/* Switch mode */}
        <div className="text-muted-foreground flex justify-center gap-1 text-sm">
          <p>{isLogin ? "Não tem conta?" : "Já tem conta?"}</p>
          <button
            type="button"
            onClick={switchMode}
            disabled={loading}
            className="text-primary font-medium hover:underline disabled:opacity-50"
          >
            {isLogin ? "Criar conta" : "Fazer login"}
          </button>
        </div>
      </div>
    </div>
  );
};

export { Login1 };
