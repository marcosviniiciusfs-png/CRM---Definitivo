import React from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Button } from "@/components/ui/button";
import { PlusCircle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

export default function Pricing() {
  const { isReady, organizationId } = useOrganizationReady();
  const location = useLocation();
  const { signOut } = useAuth();
  const [isCreating, setIsCreating] = React.useState(false);

  // Polling/Sync check: Se o usuário estiver pronto, o contexto já inicializou e encontrou uma org.
  // Mandamos ele para o dashboard ou o destino original.
  React.useEffect(() => {
    // Para simplificar, verificamos se temos organizationId ou se isReady é true
    if ((isReady && organizationId) || organizationId) {
      console.log("[Pricing] Organization detected! Redirecting...");
      const stateFrom = (location.state as any)?.from;

      const fromPath = stateFrom?.pathname || (typeof stateFrom === 'string' ? stateFrom : "/dashboard");
      const fromSearch = stateFrom?.search || "";

      // Pequeno delay para garantir que o cache local/RLS está sincronizado
      setTimeout(() => {
        window.location.href = fromPath + fromSearch;
      }, 500);
      return;
    }
  }, [isReady, organizationId, location.state]);

  const handleCreateOrg = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      console.log("[Pricing] Manually triggering ensure_user_organization");
      const { data, error } = await (supabase.rpc as any)('ensure_user_organization');

      if (error) {
        console.error("[Pricing] RPC Error:", error);
        alert("Erro no servidor: " + error.message);
        setIsCreating(false);
        return;
      }

      if (data?.success) {
        console.log("[Pricing] Org created successfully, triggering final redirect...");
        // Em vez de window.location.href manual, deixamos o useEffect acima agir 
        // ou forçamos se necessário após um tempo
        setTimeout(() => {
          const fromPath = (location.state as any)?.from?.pathname || "/dashboard";
          const fromSearch = (location.state as any)?.from?.search || "";
          window.location.href = fromPath + fromSearch;
        }, 1000);
      } else {
        console.error("[Pricing] App Error:", data?.error);
        alert("Não foi possível criar seu workspace: " + (data?.error || "Erro desconhecido"));
        setIsCreating(false);
      }
    } catch (err) {
      console.error("[Pricing] Catch Error:", err);
      alert("Falha na comunicação com o servidor.");
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8 p-8 border rounded-2xl bg-card shadow-lg">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Quase lá!</h1>
          <p className="text-muted-foreground text-balance">
            Não encontramos um Workspace vinculado à sua conta.
            Clique no botão abaixo para criar seu acesso gratuito agora mesmo.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleCreateOrg}
            disabled={isCreating}
            size="lg"
            className="w-full h-16 text-lg gap-3 bg-primary hover:bg-primary/90 transition-all font-semibold shadow-md active:scale-[0.98]"
          >
            {isCreating ? (
              <LoadingAnimation text="Configurando tudo..." />
            ) : (
              <>
                <PlusCircle className="w-6 h-6" />
                Criar meu Workspace Grátis
              </>
            )}
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
