import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { User, Bell, Moon, Sun, CreditCard, Shield, Database, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";

const PLAN_NAMES: { [key: string]: string } = {
  'prod_TVqqdFt1DYCcCI': 'Básico',
  'prod_TVqr72myTFqI39': 'Profissional',
  'prod_TVqrhrzuIdUDcS': 'Enterprise'
};

const Settings = () => {
  const { user, subscriptionData, refreshSubscription } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [buttonClickSoundEnabled, setButtonClickSoundEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [addingCollaborators, setAddingCollaborators] = useState(false);
  const [extraCollaboratorsQty, setExtraCollaboratorsQty] = useState(1);
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);

  // Handle OAuth redirect parameters
  useEffect(() => {
    const integration = searchParams.get('integration');
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (integration === 'google_calendar') {
      if (success === 'true') {
        toast.success("Google Calendar conectado com sucesso!");
      } else if (error) {
        const errorMessages: Record<string, string> = {
          'access_denied': 'Você negou o acesso ao Google Calendar',
          'callback_failed': 'Erro ao processar autorização. Tente novamente.',
        };
        toast.error(errorMessages[error] || 'Erro na conexão com Google Calendar');
      }
      
      searchParams.delete('integration');
      searchParams.delete('success');
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const getUserData = async () => {
      if (!user) return;
      
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          console.error('Erro ao buscar perfil:', profileError);
        } else if (profileData) {
          setFullName(profileData.full_name || "");
          setJobTitle(profileData.job_title || "");
          setAvatarUrl(profileData.avatar_url || null);
          setNotificationSoundEnabled(profileData.notification_sound_enabled ?? true);
          const btnSoundEnabled = (profileData as any).button_click_sound_enabled ?? true;
          setButtonClickSoundEnabled(btnSoundEnabled);
          localStorage.setItem('buttonClickSoundEnabled', String(btnSoundEnabled));
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    getUserData();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          job_title: jobTitle,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast.error("Erro ao salvar perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotificationSound = async (enabled: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_sound_enabled: enabled,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setNotificationSoundEnabled(enabled);
      toast.success(enabled ? "Som de notificação ativado" : "Som de notificação desativado");
    } catch (error) {
      console.error('Erro ao atualizar preferência:', error);
      toast.error("Erro ao atualizar preferência. Tente novamente.");
    }
  };

  const handleToggleButtonClickSound = async (enabled: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          button_click_sound_enabled: enabled,
        } as any)
        .eq('user_id', user.id);

      if (error) throw error;

      setButtonClickSoundEnabled(enabled);
      localStorage.setItem('buttonClickSoundEnabled', String(enabled));
      toast.success(enabled ? "Som de clique ativado" : "Som de clique desativado");
    } catch (error) {
      console.error('Erro ao atualizar preferência:', error);
      toast.error("Erro ao atualizar preferência. Tente novamente.");
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("A nova senha e a confirmação não coincidem");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setChangingPassword(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Senha atual incorreta");
        setChangingPassword(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      toast.success("Senha atualizada com sucesso!");
    } catch (error: any) {
      console.error('Erro ao atualizar senha:', error);
      toast.error(error.message || "Erro ao atualizar senha. Tente novamente.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAddCollaborators = async () => {
    if (!extraCollaboratorsQty || extraCollaboratorsQty < 1) {
      toast.error("Quantidade inválida");
      return;
    }

    setAddingCollaborators(true);

    try {
      toast.loading("Adicionando colaboradores...");
      const { data, error } = await supabase.functions.invoke("update-subscription", {
        body: {
          action: "add_collaborators",
          quantity: extraCollaboratorsQty,
        },
      });

      if (error) throw error;

      toast.dismiss();
      toast.success(data?.message || "Colaboradores adicionados com sucesso!");
      
      await refreshSubscription();
      
      setShowCollaboratorModal(false);
      setExtraCollaboratorsQty(1);
    } catch (error) {
      toast.dismiss();
      console.error("Erro ao adicionar colaboradores:", error);
      toast.error("Erro ao adicionar colaboradores. Tente novamente.");
    } finally {
      setAddingCollaborators(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as configurações da sua conta</p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger value="perfil" className="rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">Perfil</TabsTrigger>
          <TabsTrigger value="notificacoes" className="rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Perfil do Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <AvatarUpload 
                avatarUrl={avatarUrl}
                userId={user?.id || ""}
                userName={fullName || user?.email || ""}
                onAvatarUpdate={(url) => setAvatarUrl(url)}
              />
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input 
                    id="name" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Cargo</Label>
                <Input 
                  id="role" 
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex: Gerente de Vendas"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </CardContent>
          </Card>

          {/* Assinatura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Assinatura
              </CardTitle>
              <CardDescription>
                Informações sobre o seu plano atual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscriptionData?.subscribed && subscriptionData.product_id ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Plano Atual</p>
                      <Badge className="mt-1" variant="default">
                        {PLAN_NAMES[subscriptionData.product_id] || 'Pro'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">Colaboradores</p>
                      <p className="text-lg font-bold">{subscriptionData.total_collaborators}</p>
                    </div>
                  </div>
                  
                  {subscriptionData.subscription_end && (
                    <div className="text-sm text-muted-foreground">
                      Próxima renovação: {new Date(subscriptionData.subscription_end).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="default" 
                      onClick={() => setShowCollaboratorModal(true)}
                      className="w-full"
                    >
                      Adicionar Colaboradores
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => navigate('/pricing')}
                      className="w-full"
                    >
                      Ver Planos
                    </Button>
                  </div>
                  
                  {/* Modal de Adicionar Colaboradores */}
                  {showCollaboratorModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                      <div className="bg-card p-6 rounded-lg border shadow-lg w-full max-w-md space-y-4">
                        <div>
                          <h3 className="text-lg font-semibold">Adicionar Colaboradores</h3>
                          <p className="text-sm text-muted-foreground">
                            Adicione mais colaboradores à sua equipe por R$ 30/mês cada
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="extra-qty">Quantidade de Colaboradores</Label>
                          <Input
                            id="extra-qty"
                            type="number"
                            min="1"
                            value={extraCollaboratorsQty}
                            onChange={(e) => setExtraCollaboratorsQty(parseInt(e.target.value) || 1)}
                          />
                          <p className="text-sm text-muted-foreground">
                            Total adicional: R$ {extraCollaboratorsQty * 30}/mês
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            onClick={handleAddCollaborators}
                            disabled={addingCollaborators}
                            className="flex-1"
                          >
                            {addingCollaborators ? "Processando..." : "Confirmar"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowCollaboratorModal(false);
                              setExtraCollaboratorsQty(1);
                            }}
                            disabled={addingCollaborators}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Você não possui uma assinatura ativa
                  </p>
                  <Button onClick={() => navigate('/pricing')}>
                    Ver Planos
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === "dark" ? (
                  <Moon className="h-5 w-5 text-primary" />
                ) : (
                  <Sun className="h-5 w-5 text-primary" />
                )}
                Aparência
              </CardTitle>
              <CardDescription>
                Personalize a aparência do CRM de acordo com sua preferência
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode" className="text-base">Tema Escuro</Label>
                  <p className="text-sm text-muted-foreground">
                    Alternar entre tema claro e escuro
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Segurança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha Atual</Label>
                <Input 
                  id="current-password" 
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input 
                  id="new-password" 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite a nova senha (mín. 6 caracteres)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input 
                  id="confirm-password" 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                />
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </CardContent>
          </Card>

          {/* Backup do Banco de Dados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Backup de Dados
              </CardTitle>
              <CardDescription>
                Exporte todos os dados da sua organização em formato JSON
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/30">
                <p className="text-sm text-muted-foreground mb-3">
                  O backup inclui: leads, mensagens, funis, equipes, tarefas, metas, histórico de distribuição, automações e configurações da organização.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Nota:</strong> Apenas owners e admins podem exportar backups.
                </p>
              </div>
              <Button 
                onClick={async () => {
                  setExportingBackup(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('export-database-backup');
                    
                    if (error) {
                      console.error('Erro ao exportar:', error);
                      toast.error(error.message || 'Erro ao exportar backup');
                      return;
                    }

                    // Create and download the file
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const date = new Date().toISOString().split('T')[0];
                    a.download = `backup-kairoz-${date}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    const stats = data?.metadata?.statistics;
                    toast.success(`Backup exportado! ${stats?.total_records || 0} registros em ${stats?.total_tables || 0} tabelas.`);
                  } catch (err) {
                    console.error('Erro ao exportar backup:', err);
                    toast.error('Erro ao exportar backup. Tente novamente.');
                  } finally {
                    setExportingBackup(false);
                  }
                }}
                disabled={exportingBackup}
                className="w-full sm:w-auto"
              >
                {exportingBackup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Backup Completo
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notificações
              </CardTitle>
              <CardDescription>
                Configure suas preferências de notificação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notification-sound" className="text-base">Som de Notificação</Label>
                  <p className="text-sm text-muted-foreground">
                    Reproduzir som quando novas mensagens chegarem
                  </p>
                </div>
                <Switch
                  id="notification-sound"
                  checked={notificationSoundEnabled}
                  onCheckedChange={handleToggleNotificationSound}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="button-click-sound" className="text-base">Som de Clique</Label>
                  <p className="text-sm text-muted-foreground">
                    Reproduzir som ao clicar nos botões
                  </p>
                </div>
                <Switch
                  id="button-click-sound"
                  checked={buttonClickSoundEnabled}
                  onCheckedChange={handleToggleButtonClickSound}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
