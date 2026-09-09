import React from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { Button } from "@/components/ui/button";
import { RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

export default function Pricing() {
  const { isReady, organizationId } = useOrganizationReady();
  const location = useLocation();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Se organização foi detectada, redirecionar para dashboard (sem reload)
  React.useEffect(() => {
    if ((isReady && organizationId) || organizationId) {
      const stateFrom = (location.state as any)?.from;
      const fromPath = stateFrom?.pathname || (typeof stateFrom === 'string' ? stateFrom : "/dashboard");
      const fromSearch = stateFrom?.search || "";

      navigate(fromPath + fromSearch, { replace: true });
    }
  }, [isReady, organizationId, location.state, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8 p-8 border rounded-2xl bg-card shadow-lg">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Acesso pendente</h1>
          <p className="text-muted-foreground text-balance">
            Sua conta ainda não está vinculada a uma organização. Solicite ao administrador da sua empresa que libere o acesso.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={() => window.location.reload()}
            size="lg"
            className="w-full h-12 gap-2 bg-primary hover:bg-primary/90 transition-all font-semibold shadow-md active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Verificar acesso novamente
          </Button>

          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            Entrar com outra conta
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          Problemas? <button onClick={() => window.location.reload()} className="underline hover:text-primary">Clique aqui para atualizar</button> ou entre em contato com nosso suporte técnico.
        </p>
      </div>
    </div>
  );
}
