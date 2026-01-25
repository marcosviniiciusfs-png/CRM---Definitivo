import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isInitialized, organizationId, needsOrgSelection } = useOrganization();

  // Aguardar autenticação
  if (authLoading) {
    return <LoadingAnimation text="Verificando autenticação..." />;
  }

  // Redirecionar se não autenticado
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Aguardar organização inicializar (CRÍTICO: evita tela branca)
  if (!isInitialized) {
    return <LoadingAnimation text="Carregando workspace..." />;
  }

  // Se precisa selecionar org, o modal já aparece via OrganizationContext
  // Podemos permitir renderizar children normalmente após inicialização
  
  return <>{children}</>;
}
