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
