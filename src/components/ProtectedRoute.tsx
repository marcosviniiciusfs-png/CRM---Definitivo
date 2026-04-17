import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useOrganization } from "@/contexts/OrganizationContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isReady, isSuperAdmin, organizationId } = useOrganizationReady();
  const { isInitialized } = useOrganization();
  const location = useLocation();

  const isIntegrationsFlow =
    location.pathname.includes('/integrations') ||
    location.search.includes('facebook=') ||
    (location.search.includes('code=') && location.search.includes('state='));

  // Enquanto auth ou org ainda estão carregando, mostrar loader
  // Isso impede o redirect prematuro para /pricing
  if (isLoading || (isIntegrationsFlow && !isReady)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Carregando..." />
      </div>
    );
  }

  // Não autenticado → redirecionar para login
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Se não está pronto mas a org AINDA está inicializando, mostrar loader
  // ao invés de redirecionar para /pricing (causava o loop)
  if (!isReady && !isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Carregando workspace..." />
      </div>
    );
  }

  // Só redirecionar para /pricing se a org terminou de inicializar E não encontrou organização
  if (!isReady && !isIntegrationsFlow) {
    const from = (location.state as any)?.from || location;
    return <Navigate to="/pricing" state={{ from }} replace />;
  }

  return <>{children}</>;
}
