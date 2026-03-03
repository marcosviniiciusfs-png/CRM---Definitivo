import { Navigate, useLocation } from "react-router-dom";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";

/**
 * Rota protegida que usa o hook unificado useOrganizationReady.
 * CRÍTICO: Isso previne tela branca garantindo que TANTO auth QUANTO organization
 * estejam completamente inicializados antes de renderizar os children.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isReady } = useOrganizationReady();
  const location = useLocation();

  // 1. Redirecionar se não autenticado (Prioridade Máxima)
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 2. Permitir fluxos públicos (Pricing/Success) mesmo que ORG ainda esteja carregando.
  // CRÍTICO: Isso evita que o usuário fique preso no "Carregando..." ao tentar pagar.
  const isPublicFlow = location.pathname === '/pricing' || location.pathname === '/success';
  if (isPublicFlow) {
    return <>{children}</>;
  }

  // 3. Aguardar TUDO estar pronto apenas para rotas que dependem de Workspace (Dashboard, etc)
  if (isLoading) {
    return <LoadingAnimation text="Carregando workspace..." />;
  }

  // 4. Se já carregou tudo e não está "ready" (sem org), redireciona para pricing
  if (!isReady) {
    console.log('[ProtectedRoute] User not ready and not on public flow, redirecting to pricing');
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
}
