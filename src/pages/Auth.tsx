import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { StarsBackground } from "@/components/ui/stars-background";
import { Login1 } from "@/components/ui/login-1";
import { OrganizationSelectorModal, OrganizationMembership } from "@/components/OrganizationSelectorModal";
import { supabase } from "@/integrations/supabase/client";
import kairozLogo from "@/assets/kairoz-logo-full.png";

const Auth = () => {
  const { signUp, signIn, signInWithGoogle, resetPassword, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showOrgSelector, setShowOrgSelector] = useState(false);
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationMembership[]>([]);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // Verificar se o usuário tem múltiplas organizações após login
  useEffect(() => {
    const checkMultipleOrganizations = async () => {
      if (!user || pendingRedirect) return;

      try {
        const { data: memberships, error } = await supabase
          .from('organization_members')
          .select(`
            organization_id, 
            role,
            organizations (
              id,
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (error) {
          console.error('Error checking organizations:', error);
          navigate("/dashboard");
          return;
        }

        if (memberships && memberships.length > 1) {
          // Formatar dados e mostrar modal
          const formattedMemberships: OrganizationMembership[] = memberships.map(m => ({
            organization_id: m.organization_id,
            role: m.role as 'owner' | 'admin' | 'member',
            organizations: m.organizations as { id: string; name: string }
          }));
          
          setAvailableOrganizations(formattedMemberships);
          setShowOrgSelector(true);
        } else {
          // Apenas uma organização, redirecionar direto
          navigate("/dashboard");
        }
      } catch (error) {
        console.error('Error checking organizations:', error);
        navigate("/dashboard");
      }
    };

    checkMultipleOrganizations();
  }, [user, navigate, pendingRedirect]);

  const handleOrganizationSelect = (organizationId: string) => {
    // Salvar seleção no cache antes de redirecionar
    const selectedOrg = availableOrganizations.find(
      org => org.organization_id === organizationId
    );
    
    if (selectedOrg && user) {
      // Calcular permissões básicas para o cache
      const isOwner = selectedOrg.role === 'owner';
      const isAdmin = selectedOrg.role === 'admin';
      
      const cacheData = {
        selectedOrganizationId: organizationId,
        availableOrganizations,
        permissions: {
          canManageCollaborators: isOwner || isAdmin,
          canDeleteCollaborators: isOwner,
          canChangeRoles: isOwner,
          canCreateRoulettes: isOwner || isAdmin,
          canDeleteRoulettes: isOwner,
          canManualDistribute: isOwner || isAdmin,
          canViewAllLeads: isOwner || isAdmin,
          canAssignLeads: isOwner || isAdmin,
          canDeleteLeads: isOwner || isAdmin,
          canManageAutomation: isOwner || isAdmin,
          canManageIntegrations: isOwner || isAdmin,
          canManageTags: isOwner || isAdmin,
          canManagePipeline: isOwner || isAdmin,
          canViewTeamMetrics: isOwner || isAdmin,
          canAccessAdminSection: isOwner || isAdmin,
          canManageAgentSettings: isOwner || isAdmin,
          role: selectedOrg.role,
          loading: false,
        },
        timestamp: Date.now(),
        userId: user.id,
      };
      
      localStorage.setItem('kairoz_org_cache', JSON.stringify(cacheData));
    }
    
    setPendingRedirect(true);
    setShowOrgSelector(false);
    navigate("/dashboard");
  };

  // Se já logado e não está mostrando seletor, redirecionar
  if (user && !authLoading && !showOrgSelector && pendingRedirect) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (email: string, password: string) => {
    if (!email || !password) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao fazer login",
        description: error.message === "Invalid login credentials" 
          ? "Email ou senha incorretos" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao CRM",
      });
      // A verificação de múltiplas orgs será feita no useEffect
    }
  };

  const handleSignup = async (email: string, password: string, name: string) => {
    if (!email || !password || !name) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password, name);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.message === "User already registered" 
          ? "Email já cadastrado" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Conta criada com sucesso!",
        description: "Bem-vindo ao CRM",
      });
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao fazer login com Google",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async (email: string) => {
    if (!email) {
      toast({
        title: "Erro",
        description: "Por favor, digite seu email",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir a senha",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <StarsBackground className="min-h-screen" speed={30} factor={0.08}>
        <Login1
          logo={{
            src: kairozLogo,
            alt: "KairoZ",
          }}
          onLogin={handleLogin}
          onSignup={handleSignup}
          onGoogleLogin={handleGoogleLogin}
          onForgotPassword={handleForgotPassword}
          loading={loading}
        />
      </StarsBackground>

      {/* Modal de seleção de organização */}
      <OrganizationSelectorModal
        open={showOrgSelector}
        organizations={availableOrganizations}
        onSelect={handleOrganizationSelect}
      />
    </>
  );
};

export default Auth;
