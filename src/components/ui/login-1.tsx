import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
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
  onGoogleLogin: () => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  loading?: boolean;
}

const Login1 = ({
  logo,
  onLogin,
  onSignup,
  onGoogleLogin,
  onForgotPassword,
  loading = false,
}: Login1Props) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await onLogin(email, password);
    } else {
      await onSignup(email, password, name);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onForgotPassword(email);
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setEmail("");
    setPassword("");
    setName("");
    setShowPassword(false);
  };

  const goToForgotPassword = () => {
    setIsForgotPassword(true);
    setPassword("");
    setShowPassword(false);
  };

  const backToLogin = () => {
    setIsForgotPassword(false);
    setEmail("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative z-10">
      {/* Card branco com logo dentro */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-md w-full max-w-sm px-8 py-10">
        {/* Logo dentro do card */}
        <div className="flex justify-center mb-6">
          <img
            src={logo.src}
            alt={logo.alt}
            className="h-12 w-auto"
          />
        </div>

        {isForgotPassword ? (
          /* Formulário de recuperação de senha */
          <form onSubmit={handleForgotPasswordSubmit} className="flex w-full flex-col gap-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Recuperar senha</h2>
              <p className="text-sm text-gray-500">
                Digite seu email para receber um link de recuperação
              </p>
            </div>

            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="h-11 bg-white border-gray-300 rounded-lg placeholder:text-gray-400 text-gray-900 focus:border-gray-400 focus:ring-gray-400"
            />

            <Button 
              type="submit" 
              className="h-11 w-full bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Enviar link de recuperação"
              )}
            </Button>

            <button
              type="button"
              onClick={backToLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </button>
          </form>
        ) : (
          /* Formulário de login/cadastro */
          <>
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
                    className="h-11 bg-white border-gray-300 rounded-lg placeholder:text-gray-400 text-gray-900 focus:border-gray-400 focus:ring-gray-400"
                  />
                )}
                
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="h-11 bg-white border-gray-300 rounded-lg placeholder:text-gray-400 text-gray-900 focus:border-gray-400 focus:ring-gray-400"
                />
                
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 bg-white border-gray-300 rounded-lg placeholder:text-gray-400 text-gray-900 focus:border-gray-400 focus:ring-gray-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* Esqueceu a senha - apenas no login */}
                {isLogin && (
                  <button
                    type="button"
                    onClick={goToForgotPassword}
                    disabled={loading}
                    className="text-sm text-gray-500 hover:text-gray-700 hover:underline self-end -mt-2 disabled:opacity-50"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  type="submit" 
                  className="h-11 w-full bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
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
                  className="h-11 w-full border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  disabled={loading}
                  onClick={onGoogleLogin}
                >
                  <FcGoogle className="mr-2 size-5" />
                  {isLogin ? "Entrar com Google" : "Cadastrar com Google"}
                </Button>
              </div>
            </form>

            {/* Switch mode */}
            <div className="text-gray-500 flex justify-center gap-1 text-sm mt-6">
              <p>{isLogin ? "Não tem conta?" : "Já tem conta?"}</p>
              <button
                type="button"
                onClick={switchMode}
                disabled={loading}
                className="text-gray-900 font-medium hover:underline disabled:opacity-50"
              >
                {isLogin ? "Criar conta" : "Fazer login"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export { Login1 };
