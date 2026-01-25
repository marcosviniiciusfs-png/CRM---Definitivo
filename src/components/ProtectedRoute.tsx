import { Navigate } from "react-router-dom";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";

/**
 * Rota protegida que usa o hook unificado useOrganizationReady.
 * CRÍTICO: Isso previne tela branca garantindo que TANTO auth QUANTO organization
 * estejam completamente inicializados antes de renderizar os children.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isReady } = useOrganizationReady();

  // CRÍTICO: Aguardar TUDO estar pronto (auth + org)
  // Isso previne race conditions e tela branca
  if (isLoading) {
    return <LoadingAnimation text="Carregando..." />;
  }

  // Redirecionar se não autenticado
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // CRÍTICO: Só renderizar quando tudo estiver pronto
  // O modal de seleção de org aparece via OrganizationContext se necessário
  if (!isReady) {
    return <LoadingAnimation text="Carregando workspace..." />;
  }
  
  return <>{children}</>;
}
