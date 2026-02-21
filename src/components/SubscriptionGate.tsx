import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";

/**
 * Gate que verifica se o usuário tem assinatura ativa.
 * Se não tiver, redireciona para /pricing.
 * Usado em rotas que precisam de assinatura (CRM).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { subscriptionData } = useAuth();

  // subscriptionData ainda não carregou
  if (subscriptionData === null) {
    return <LoadingAnimation text="Verificando assinatura..." />;
  }

  // Sem assinatura ativa -> redirecionar para pricing
  if (!subscriptionData.subscribed) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
}
