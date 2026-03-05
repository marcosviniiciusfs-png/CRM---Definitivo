import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, User, Building2, Shield, Users, Mail, Calendar, Clock, KeyRound, Send, Trash2, CreditCard, Unlock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface UserDetails {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  organization_id: string | null;
  organization_name: string | null;
  user_role: string | null;
}

interface OrganizationMember {
  member_id: string;
  user_id: string | null;
  email: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

const PLAN_OPTIONS = [
  { value: 'none', label: 'Sem plano', amount: 0 },
  { value: 'star', label: 'Star', amount: 0 },
  { value: 'pro', label: 'Pro', amount: 0 },
  { value: 'elite', label: 'Elite', amount: 0 },
];

export default function AdminUserDetails() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [tempPasswordData, setTempPasswordData] = useState<{ password: string; email: string } | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Plan management states
  const [currentPlan, setCurrentPlan] = useState<string>('none');
  const [selectedPlan, setSelectedPlan] = useState<string>('none');
  const [savingPlan, setSavingPlan] = useState(false);
  const [planUpdateSuccess, setPlanUpdateSuccess] = useState(false);

  // Section access control states
  const SECTION_KEYS = [
    { key: 'dashboard', label: 'Início', locked: false },
    { key: 'pipeline', label: 'Pipeline', locked: false },
    { key: 'leads', label: 'Leads', locked: false },
    { key: 'lead-metrics', label: 'Métricas', locked: false },
    { key: 'lead-distribution', label: 'Roleta de Leads', locked: false },
    { key: 'chat', label: 'Chat', locked: false },
    { key: 'ranking', label: 'Ranking', locked: false },
    { key: 'colaboradores', label: 'Colaboradores', locked: false },
    { key: 'producao', label: 'Produção', locked: false },
    { key: 'equipes', label: 'Equipes', locked: false },
    { key: 'atividades', label: 'Atividades', locked: false },
    { key: 'tasks', label: 'Tarefas', locked: false },
    { key: 'integrations', label: 'Integrações', locked: false },
    { key: 'settings', label: 'Configurações', locked: false },
  ];
  const [sectionAccess, setSectionAccess] = useState<Record<string, boolean>>({});
  const [savingSections, setSavingSections] = useState(false);

  // Estados para confirmação
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showTempPassConfirm, setShowTempPassConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [targetUser, setTargetUser] = useState<{ id: string; email: string } | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

  const adminRpc = async (operation: string, params?: Record<string, unknown>) => {
    const token = getAdminToken();
    // No novo sistema SQL-only, mapeamos as 'operations' para as novas RPCs 'safe_*'
    // ou usamos a rpc() do Supabase diretamente se o nome bater.
    const rpcMap: Record<string, string> = {
      'get_user_details': 'safe_get_user_details', // Precisamos criar esta no SQL ainda
      'get_organization_members': 'safe_get_organization_members',
      'admin_get_user_subscription': 'safe_get_user_subscription',
      'get_section_access': 'safe_get_section_access',
      'admin_manage_user_subscription': 'safe_manage_user_subscription',
      'upsert_section_access': 'safe_upsert_section_access',
    };

    const rpcName = rpcMap[operation] || operation;
    const { data, error } = await (supabase as any).rpc(rpcName, { ...params, p_token: token });

    if (error) throw error;
    return { data };
  };

  const loadUserDetails = async () => {
    setLoading(true);
    try {
      const userData = (await adminRpc('get_user_details', { user_id: userId })).data;

      if (userData && userData.length > 0) {
        setUserDetails(userData[0]);

        if (userData[0].organization_id) {
          const membersData = (await adminRpc('get_organization_members', {
            organization_id: userData[0].organization_id
          })).data;
          setMembers(membersData || []);
        }

        // Load subscription viaadmin-panel-rpc (service_role, bypass RLS)
        const subData = (await adminRpc('admin_get_user_subscription', { user_id: userId })).data as { status: string; plan_id: string | null } | null;

        if (subData && subData.status === 'authorized' && subData.plan_id) {
          setCurrentPlan(subData.plan_id);
          setSelectedPlan(subData.plan_id);
        } else {
          setCurrentPlan('none');
          setSelectedPlan('none');
        }

        // Load section access via admin-panel-rpc
        const accessData = (await adminRpc('get_section_access', { user_id: userId })).data;

        const accessMap: Record<string, boolean> = {};
        // Initialize defaults
        SECTION_KEYS.forEach(s => {
          accessMap[s.key] = !s.locked; // default: enabled for normal, disabled for locked
        });
        // Override with DB values
        (accessData || []).forEach((row: { section_key: string; is_enabled: boolean }) => {
          accessMap[row.section_key] = row.is_enabled;
        });
        setSectionAccess(accessMap);
      } else {
        toast.error("Usuário não encontrado");
        navigate("/admin");
      }
    } catch (error: unknown) {
      console.error('Erro ao carregar detalhes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao carregar detalhes';
      toast.error(`Erro ao carregar detalhes: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    if (!userId) return;
    if (selectedPlan === currentPlan) {
      toast.info('Selecione um plano diferente do atual');
      return;
    }

    setSavingPlan(true);
    try {
      console.log(`[Admin] Salvando plano "${selectedPlan}" para o usuário: ${userId}`);

      // Chamada via admin-panel-rpc (service_role, bypass de RLS)
      const result = await adminRpc('admin_manage_user_subscription', {
        user_id: userId,
        plan_id: selectedPlan,
        organization_id: userDetails?.organization_id || null,
      });

      const response = result.data as any;
      if (response && response.status === 'error') {
        throw new Error(response.message);
      }

      console.log('[Admin] Sucesso RPC:', response);

      setCurrentPlan(selectedPlan);
      setPlanUpdateSuccess(true);
      toast.success('Plano atualizado com sucesso!');

      setTimeout(() => {
        setPlanUpdateSuccess(false);
      }, 5000);

      setTimeout(() => {
        loadUserDetails();
      }, 500);

    } catch (error: any) {
      console.error('Erro detalhado ao salvar plano:', error);
      const errorMessage = error.message || (error.error_description) || 'Erro desconhecido ao salvar plano';
      toast.error(`Erro ao salvar plano: ${errorMessage}`);
    } finally {
      setSavingPlan(false);
    }
  };

  // Abrir diálogo de confirmação para reset
  const openResetConfirm = (targetUserId: string, targetEmail: string) => {
    setTargetUser({ id: targetUserId, email: targetEmail });
    setCustomMessage("");
    setShowResetConfirm(true);
  };

  const handleSaveSectionAccess = async () => {
    if (!userId) return;
    setSavingSections(true);
    try {
      const rows = Object.entries(sectionAccess).map(([key, enabled]) => ({
        user_id: userId,
        section_key: key,
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      }));

      await adminRpc('upsert_section_access', { rows });
      toast.success('Acessos atualizados com sucesso!');
    } catch (error: unknown) {
      console.error('Erro ao salvar acessos:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao salvar acessos';
      toast.error(`Erro ao salvar acessos: ${errorMessage}`);
    } finally {
      setSavingSections(false);
    }
  };

  // Abrir diálogo de confirmação para senha temporária
  const openTempPassConfirm = (targetUserId: string, targetEmail: string) => {
    setTargetUser({ id: targetUserId, email: targetEmail });
    setCustomMessage("");
    setShowTempPassConfirm(true);
  };

  // Executar reset após confirmação
  const handleSendResetEmail = async () => {
    if (!targetUser) return;

    setResettingPassword(true);
    setShowResetConfirm(false);

    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          userId: targetUser.id,
          userEmail: targetUser.email,
          customMessage: customMessage.trim() || undefined
        }
      });

      if (error) throw error;

      toast.success(`Email de redefinição enviado para ${targetUser.email}`);
    } catch (error: unknown) {
      console.error('Erro ao resetar senha:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao resetar senha';
      toast.error(errorMessage);
    } finally {
      setResettingPassword(false);
      setTargetUser(null);
      setCustomMessage("");
    }
  };

  // Executar geração de senha temporária após confirmação
  const handleGenerateTempPassword = async () => {
    if (!targetUser) return;

    setResettingPassword(true);
    setShowTempPassConfirm(false);

    try {
      const { data, error } = await supabase.functions.invoke('admin-generate-temp-password', {
        body: {
          userId: targetUser.id,
          userEmail: targetUser.email,
          customMessage: customMessage.trim() || undefined
        }
      });

      if (error) throw error;

      if (data?.tempPassword) {
        setTempPasswordData({ password: data.tempPassword, email: targetUser.email });
        setShowTempPasswordDialog(true);

        if (data.emailError) {
          toast.warning('Senha gerada, mas falha ao enviar email. Copie a senha do diálogo.');
        } else {
          toast.success(`Senha temporária gerada e enviada para ${targetUser.email}`);
        }
      }
    } catch (error: unknown) {
      console.error('Erro ao gerar senha:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar senha temporária';
      toast.error(errorMessage);
    } finally {
      setResettingPassword(false);
      setTargetUser(null);
      setCustomMessage("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Senha copiada para a área de transferência!');
  };

  // Abrir diálogo de confirmação para exclusão
  const openDeleteConfirm = () => {
    setAdminPassword("");
    setShowDeleteConfirm(true);
  };

  // Executar exclusão após confirmação
  const handleDeleteUser = async () => {
    if (!adminPassword || !userDetails) return;

    setDeleting(true);
    setShowDeleteConfirm(false);

    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: {
          target_user_id: userDetails.user_id,
          admin_password: adminPassword
        }
      });

      if (error) throw error;

      toast.success(`Usuário e organização excluídos com sucesso. ${data?.deleted_users || 0} usuário(s) removido(s).`);

      // Redirecionar para o dashboard admin após 2 segundos
      setTimeout(() => {
        navigate("/admin");
      }, 2000);
    } catch (error: unknown) {
      console.error('Erro ao excluir usuário:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao excluir usuário';
      toast.error(errorMessage);
      setShowDeleteConfirm(true); // Reabrir o diálogo em caso de erro
    } finally {
      setDeleting(false);
      setAdminPassword("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userDetails) {
    return null;
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      owner: "bg-purple-100 text-purple-700 border-purple-200",
      admin: "bg-blue-100 text-blue-700 border-blue-200",
      member: "bg-gray-100 text-gray-700 border-gray-200"
    };
    return roleColors[role] || roleColors.member;
  };

  const getPlanBadge = (plan: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      star: { label: 'Star', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      pro: { label: 'Pro', className: 'bg-blue-100 text-blue-800 border-blue-300' },
      elite: { label: 'Elite', className: 'bg-purple-100 text-purple-800 border-purple-300' },
      none: { label: 'Sem plano', className: 'bg-gray-100 text-gray-600 border-gray-300' },
    };
    return badges[plan] || badges.none;
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/admin")}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Detalhes do Usuário</h1>
            <p className="text-gray-500">Informações completas da conta e colaboradores</p>
          </div>
        </div>

        {/* Success Notification Card */}
        {planUpdateSuccess && (
          <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
            <Card className="w-80 border-blue-200 bg-blue-50 shadow-2xl overflow-hidden">
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-200">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-blue-900">Sincronização Concluída</p>
                  <p className="text-xs text-blue-700 truncate">
                    Plano atualizado para <span className="font-semibold uppercase">{currentPlan}</span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-blue-400 hover:text-blue-600 hover:bg-transparent"
                  onClick={() => setPlanUpdateSuccess(false)}
                >
                  <ArrowLeft className="w-4 h-4 rotate-90" />
                </Button>
              </div>
              <div className="h-1 w-full bg-blue-100">
                <div
                  className="h-full bg-blue-500 animate-shrink-width"
                  style={{
                    animation: 'shrink-width 5s linear forwards'
                  }}
                />
              </div>
            </Card>
          </div>
        )}

        {/* Informações do Usuário */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <User className="w-5 h-5" />
              Informações da Conta
            </CardTitle>
            <CardDescription className="text-gray-500">
              Dados cadastrados e status da conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={userDetails.avatar_url || undefined} />
                <AvatarFallback className="bg-gray-100 text-gray-600 text-lg">
                  {getInitials(userDetails.full_name, userDetails.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <h3 className="text-xl font-semibold text-gray-900">
                  {userDetails.full_name || userDetails.email}
                </h3>
                {userDetails.job_title && (
                  <p className="text-gray-500">{userDetails.job_title}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="w-4 h-4" />
                  {userDetails.email}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4" />
                  Data de Cadastro
                </div>
                <p className="text-sm text-gray-500">
                  {format(new Date(userDetails.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Clock className="w-4 h-4" />
                  Último Login
                </div>
                <p className="text-sm text-gray-500">
                  {userDetails.last_sign_in_at
                    ? format(new Date(userDetails.last_sign_in_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                    : "Nunca fez login"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Shield className="w-4 h-4" />
                  Status do E-mail
                </div>
                <div>
                  {userDetails.email_confirmed_at ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                      Confirmado em {format(new Date(userDetails.email_confirmed_at), "dd/MM/yyyy", { locale: ptBR })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
                      Pendente de confirmação
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Building2 className="w-4 h-4" />
                  Organização
                </div>
                <div>
                  {userDetails.organization_name ? (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600">{userDetails.organization_name}</p>
                      {userDetails.user_role && (
                        <Badge variant="outline" className={getRoleBadge(userDetails.user_role)}>
                          {userDetails.user_role}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Sem organização</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 space-y-3">
              <p className="text-sm text-gray-500">
                <strong className="text-gray-700">Nota de Segurança:</strong> As senhas são criptografadas e não podem ser visualizadas por questões de segurança.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openResetConfirm(userDetails.user_id, userDetails.email)}
                  disabled={resettingPassword || deleting}
                  className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Send className="w-4 h-4" />
                  Enviar Link de Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openTempPassConfirm(userDetails.user_id, userDetails.email)}
                  disabled={resettingPassword || deleting}
                  className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <KeyRound className="w-4 h-4" />
                  Gerar Senha Temporária
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDeleteConfirm}
                  disabled={resettingPassword || deleting}
                  className="gap-2 ml-auto text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir Conta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plano e Assinatura */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <CreditCard className="w-5 h-5" />
              Plano e Assinatura
            </CardTitle>
            <CardDescription className="text-gray-500">
              Gerencie o plano de assinatura deste usuário
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Plano atual:</span>
              <Badge variant="outline" className={getPlanBadge(currentPlan).className}>
                {getPlanBadge(currentPlan).label}
              </Badge>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Alterar plano</Label>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-gray-900">
                    {PLAN_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSavePlan}
                disabled={savingPlan || selectedPlan === currentPlan}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingPlan ? 'Salvando...' : 'Salvar Plano'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Controle de Acesso por Seção */}
        <Card className="bg-white border-gray-200 text-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Shield className="w-5 h-5" />
              Controle de Acesso por Seção
            </CardTitle>
            <CardDescription className="text-gray-500">
              Defina quais seções este usuário pode visualizar e acessar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SECTION_KEYS.map(section => (
                <div key={section.key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{section.label}</span>
                    </div>
                  </div>
                  <Switch
                    checked={sectionAccess[section.key] ?? true}
                    onCheckedChange={(checked) => setSectionAccess(prev => ({ ...prev, [section.key]: checked }))}
                  />
                </div>
              ))}
            </div>
            <Button
              onClick={handleSaveSectionAccess}
              disabled={savingSections}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {savingSections ? 'Salvando...' : 'Salvar Acessos'}
            </Button>
          </CardContent>
        </Card>

        {/* Colaboradores da Organização */}
        {userDetails.organization_id && (
          <Card className="bg-white border-gray-200 text-gray-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <Users className="w-5 h-5" />
                Colaboradores Associados
              </CardTitle>
              <CardDescription className="text-gray-500">
                Todos os membros da organização "{userDetails.organization_name}"
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-700">Colaborador</TableHead>
                      <TableHead className="text-gray-700">E-mail</TableHead>
                      <TableHead className="text-gray-700">Função</TableHead>
                      <TableHead className="text-gray-700">Status</TableHead>
                      <TableHead className="text-gray-700">Membro desde</TableHead>
                      <TableHead className="text-gray-700">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.member_id} className="border-gray-200">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="bg-gray-100 text-gray-600 text-xs">
                                {getInitials(member.full_name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-gray-900">
                              {member.full_name || member.email.split('@')[0]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">{member.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadge(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.user_id ? (
                            member.last_sign_in_at ? (
                              <Badge className="bg-green-100 text-green-700 border border-green-200">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-gray-100 text-gray-600">Registrado</Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
                              Convite Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.created_at ? (
                            <span className="text-sm text-gray-500">
                              {format(new Date(member.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.user_id ? (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 border-gray-300 text-gray-700 hover:bg-gray-50"
                                onClick={() => openResetConfirm(member.user_id!, member.email)}
                                disabled={resettingPassword}
                                title="Enviar link de reset"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 border-gray-300 text-gray-700 hover:bg-gray-50"
                                onClick={() => openTempPassConfirm(member.user_id!, member.email)}
                                disabled={resettingPassword}
                                title="Gerar senha temporária"
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Convite pendente</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum colaborador encontrado nesta organização</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog de Confirmação - Enviar Link de Reset */}
        <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <AlertDialogContent className="max-w-2xl bg-white text-gray-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
                <Send className="w-5 h-5 text-orange-500" />
                Confirmar Envio de Link de Reset
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Você está prestes a enviar um link de redefinição de senha para:
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium text-gray-900">{targetUser?.email}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-800">
                      <strong>⚠️ Atenção:</strong> O usuário receberá um email com um link válido por 1 hora para criar uma nova senha.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reset-message" className="text-sm font-medium text-gray-700">
                      Mensagem Personalizada (Opcional)
                    </Label>
                    <Textarea
                      id="reset-message"
                      placeholder="Digite uma mensagem opcional para incluir no email..."
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="min-h-[100px] bg-white border-gray-300 text-gray-900"
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-400">
                      {customMessage.length}/500 caracteres
                    </p>
                  </div>

                  <p className="text-sm text-gray-500">
                    Deseja continuar?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setTargetUser(null); setCustomMessage(""); }} className="border-gray-300 text-gray-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSendResetEmail}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Confirmar e Enviar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de Confirmação - Gerar Senha Temporária */}
        <AlertDialog open={showTempPassConfirm} onOpenChange={setShowTempPassConfirm}>
          <AlertDialogContent className="max-w-2xl bg-white text-gray-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
                <KeyRound className="w-5 h-5 text-red-500" />
                Confirmar Geração de Senha Temporária
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Você está prestes a gerar uma senha temporária para:
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium text-gray-900">{targetUser?.email}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">
                      <strong>🔒 Ação Sensível:</strong> Esta ação irá:
                    </p>
                    <ul className="text-sm text-red-800 mt-2 ml-4 list-disc space-y-1">
                      <li>Substituir a senha atual do usuário imediatamente</li>
                      <li>Gerar uma senha temporária aleatória</li>
                      <li>Enviar a senha por email</li>
                      <li>Exigir que o usuário troque a senha no próximo login</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="temp-message" className="text-sm font-medium text-gray-700">
                      Mensagem Personalizada (Opcional)
                    </Label>
                    <Textarea
                      id="temp-message"
                      placeholder="Digite uma mensagem opcional para incluir no email..."
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="min-h-[100px] bg-white border-gray-300 text-gray-900"
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-400">
                      {customMessage.length}/500 caracteres
                    </p>
                  </div>

                  <p className="text-sm text-gray-500 font-medium">
                    Tem certeza que deseja continuar?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setTargetUser(null); setCustomMessage(""); }} className="border-gray-300 text-gray-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleGenerateTempPassword}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Sim, Gerar Senha
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de Senha Temporária Gerada */}
        <AlertDialog open={showTempPasswordDialog} onOpenChange={setShowTempPasswordDialog}>
          <AlertDialogContent className="bg-white text-gray-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
                <KeyRound className="w-5 h-5 text-blue-500" />
                Senha Temporária Gerada
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p className="text-gray-600">
                    A senha temporária foi gerada para <strong className="text-gray-900">{tempPasswordData?.email}</strong>
                  </p>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">Senha Temporária:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-lg font-mono bg-white px-3 py-2 rounded border border-gray-300 text-gray-900">
                        {tempPasswordData?.password}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(tempPasswordData?.password || '')}
                        className="border-gray-300 text-gray-700"
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>⚠️ Importante:</strong> O usuário deve trocar esta senha no primeiro login.
                      Um email foi enviado com as instruções.
                    </p>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => { setShowTempPasswordDialog(false); setTempPasswordData(null); }} className="bg-blue-600 hover:bg-blue-700 text-white">
                Entendi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de Confirmação - Excluir Usuário */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="max-w-2xl bg-white text-gray-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
                <Trash2 className="w-5 h-5 text-red-500" />
                Confirmar Exclusão de Conta
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Você está prestes a <strong className="text-red-600">EXCLUIR PERMANENTEMENTE</strong> a conta:
                  </p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium text-gray-900">{userDetails?.full_name || userDetails?.email}</p>
                    <p className="text-sm text-gray-500">{userDetails?.email}</p>
                    {userDetails?.organization_name && (
                      <p className="text-sm text-gray-500 mt-1">
                        Organização: {userDetails.organization_name}
                      </p>
                    )}
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-800 font-semibold mb-2">
                      ⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!
                    </p>
                    <p className="text-sm text-red-700 mb-2">
                      Esta ação irá:
                    </p>
                    <ul className="text-sm text-red-700 ml-4 list-disc space-y-1">
                      <li>Excluir permanentemente a conta do usuário</li>
                      <li>Deletar a organização associada</li>
                      <li>Remover TODOS os colaboradores da organização</li>
                      <li>Apagar todos os leads, mensagens e dados relacionados</li>
                      <li>Excluir todas as configurações e históricos</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-password" className="text-sm font-medium text-gray-700">
                      Digite sua senha de Super Admin para confirmar
                    </Label>
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="Sua senha de super admin"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="border-red-300 focus-visible:ring-red-500 bg-white text-gray-900"
                      autoComplete="current-password"
                    />
                    <p className="text-xs text-gray-400">
                      Por segurança, precisamos confirmar sua identidade antes de prosseguir.
                    </p>
                  </div>

                  <p className="text-sm font-medium text-red-600">
                    Tem ABSOLUTA certeza que deseja continuar?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setAdminPassword(""); }} className="border-gray-300 text-gray-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={!adminPassword || deleting}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir Permanentemente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
