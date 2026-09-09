import { useState } from "react";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Login1Props {
  logo: {
    src: string;
    alt: string;
  };
  onLogin: (email: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  loading?: boolean;
}

const Login1 = ({
  logo,
  onLogin,
  onForgotPassword,
  loading = false,
}: Login1Props) => {
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onForgotPassword(email);
  };

  
  const goToForgotPassword = () => {
    setIsForgotPassword(true);
    setPassword("");
    setShowPassword(false);
  };

  const backToLogin = () => {
    setIsForgotPassword(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-sm rounded-xl border border-red-950/80 bg-zinc-950/95 px-6 py-8 text-white shadow-2xl shadow-red-950/30 backdrop-blur sm:px-8 sm:py-10">
        {/* Logo dentro do card - otimizada para carregamento rápido */}
        <div className="flex justify-center mb-6 h-12">
          <img
            src={logo.src}
            alt={logo.alt}
            className="h-12 w-auto"
            loading="eager"
            decoding="async"
          />
        </div>

        {!isForgotPassword && (
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Acesse sua conta</h1>
            <p className="mt-2 text-sm leading-5 text-zinc-400">
              Acesso exclusivo para usuários cadastrados por um administrador.
            </p>
          </div>
        )}

        {isForgotPassword ? (
          /* Formulário de recuperação de senha */
          <form onSubmit={handleForgotPasswordSubmit} className="flex w-full flex-col gap-6">
            <div className="text-center">
              <h1 className="mb-2 text-lg font-semibold text-white">Recuperar senha</h1>
              <p className="text-sm text-zinc-400">
                Digite seu email para receber um link de recuperação
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-email" className="text-sm font-medium text-zinc-200">Email</label>
              <Input
                id="recovery-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="h-11 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus-visible:ring-red-500"
              />
            </div>

            <Button 
              type="submit" 
              className="h-11 w-full rounded-lg bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-400"
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
              className="flex min-h-11 items-center justify-center gap-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </button>
          </form>
        ) : (
          /* Formulário de login */
          <>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label htmlFor="login-email" className="text-sm font-medium text-zinc-200">Email</label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus-visible:ring-red-500"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-password" className="text-sm font-medium text-zinc-200">Senha</label>
                  <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="h-11 rounded-lg border-zinc-700 bg-zinc-900 pr-10 text-white placeholder:text-zinc-500 focus-visible:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goToForgotPassword}
                  disabled={loading}
                  className="min-h-11 self-end text-sm text-zinc-400 hover:text-white hover:underline disabled:opacity-50"
                >
                  Esqueceu a senha?
                </button>
              </div>

              <div>
                <Button 
                  type="submit" 
                  className="h-11 w-full rounded-lg bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-400"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </div>
            </form>

            <a href="/" className="mt-6 block min-h-11 text-center text-sm leading-[44px] text-zinc-400 hover:text-white hover:underline">
              Voltar ao site
            </a>

            </>
        )}
      </div>
    </div>
  );
};

export { Login1 };
