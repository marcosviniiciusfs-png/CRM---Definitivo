import { Navigate, useLocation } from "react-router-dom";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";

interface SectionGateProps {
  children: React.ReactNode;
}

/**
 * Checks user_section_access to determine if the user can access
 * the current route. If the section is explicitly unlocked, renders
 * children. Otherwise redirects to /dashboard.
 */
export function SectionGate({ children }: SectionGateProps) {
  const location = useLocation();
  const { isSectionUnlocked, loading, sectionAccess } = useSectionAccess();
  const { user } = useAuth();

  // Special case: /integrations is ALWAYS accessible
  // This is required because Facebook OAuth redirects back to /integrations?facebook=success
  // or with ?code=...&state=... (direct CRM redirect)
  // and we must never block that redirect, otherwise the connection status is lost
  const isIntegrationsFlow =
    location.pathname.startsWith('/integrations') ||
    location.search.includes('facebook=') ||
    (location.search.includes('code=') && location.search.includes('state='));

  if (isIntegrationsFlow) {
    return <>{children}</>;
  }

  // Show loading if explicitly loading OR if user exists but data hasn't arrived yet
  if (loading || (!!user && sectionAccess === null)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Verificando acesso..." />
      </div>
    );
  }

  if (!isSectionUnlocked(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
