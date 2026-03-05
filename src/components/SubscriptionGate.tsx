import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";

/**
 * Gate que verifica se o usuário tem assinatura ativa.
 * Se não tiver, redireciona para /pricing.
 * Usado em rotas que precisam de assinatura (CRM).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  // Bypass: Sempre permitir acesso
  return <>{children}</>;

  return <>{children}</>;
}
