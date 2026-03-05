import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";

/**
 * Rota protegida que usa o hook unificado useOrganizationReady.
 * CRÍTICO: Isso previne tela branca garantindo que TANTO auth QUANTO organization
 * estejam completamente inicializados antes de renderizar os children.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isReady, isSuperAdmin, organizationId } = useOrganizationReady();
  const location = useLocation();

  // Especial: Se estivermos na página de integrações ou voltando do Facebook (OAuth redirect ou redirect interno)
  // mostramos logo o loader para evitar qualquer Navigate acidental para /auth ou /pricing.
  const isIntegrationsFlow =
    location.pathname.includes('/integrations') ||
    location.search.includes('facebook=') ||
    (location.search.includes('code=') && location.search.includes('state='));

  if (isLoading || (isIntegrationsFlow && !isReady)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Finalizando conexão..." />
      </div>
    );
  }

  // 2. Redirecionar se não autenticado
  if (!user) {
    // Preservar search params na redireção para auth
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 3. Se não estiver "Pronto" (isReady = false), significa que não temos Org e não somos Super Admin
  // Mas se for flow de integração, já esperamos acima. Aqui é o gate final.
  if (!isReady && !isIntegrationsFlow) {
    const fromAuth = (location.state as any)?.fromAuth;
    const from = (location.state as any)?.from || location; // Preservar destino original

    console.warn('[ProtectedRoute] Access denied: No organization and not Super Admin. Redirecting to pricing.');
    return <Navigate to="/pricing" state={{ fromAuth, from }} replace />;
  }

  return <>{children}</>;
}
