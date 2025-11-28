import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface RoleGuardProps {
  children: ReactNode;
  roles: Array<'owner' | 'admin' | 'member'>;
  fallback?: ReactNode;
}

export function RoleGuard({ children, roles, fallback = null }: RoleGuardProps) {
  const { role, loading } = usePermissions();

  if (loading) {
    return null;
  }

  if (!role || !roles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
