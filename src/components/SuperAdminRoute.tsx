import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Loader2 } from "lucide-react";

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * AdminRoute
 *
 * Guard de rota para o painel admin.
 * Verifica o token JWT admin armazenado em sessionStorage (via AdminAuthContext).
 * Este sistema é COMPLETAMENTE INDEPENDENTE do Supabase Auth do CRM:
 * - Credenciais admin são armazenadas na tabela admin_credentials
 * - O token admin é emitido pela Edge Function admin-auth
 * - Usuários do CRM com o mesmo email NÃO têm acesso sem a senha admin
 */
export function SuperAdminRoute({ children }: AdminRouteProps) {
  const { isAdminAuthenticated, adminLoading } = useAdminAuth();

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
          <p className="text-gray-500 text-sm">Verificando acesso admin...</p>
        </div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
}
