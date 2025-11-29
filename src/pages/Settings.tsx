import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, User, Bell, Shield, Users, Moon, Sun, FileText, Link2, Copy, RefreshCw, Pencil, X, Check } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { WhatsAppStatus } from "@/components/WhatsAppStatus";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";
import { GlobalFunnelMapping } from "@/components/GlobalFunnelMapping";

const Settings = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<{ webhook_token: string; is_active: boolean; tag_id?: string | null } | null>(null);
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [webhookTagName, setWebhookTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [editingTag, setEditingTag] = useState(false);
  const [tempTagName, setTempTagName] = useState("");

  useEffect(() => {
    const getUserData = async () => {
      if (!user) return;
      
      try {
        // Get user app role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleError) {
          console.error('Erro ao buscar role:', roleError);
        }
        
        const currentUserRole = roleData?.role || null;
        setUserRole(currentUserRole);

        // Get organization role
        const { data: orgRoleData, error: orgRoleError } = await supabase
          .from('organization_members')
          .select('role, organization_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (orgRoleError) {
          console.error('Erro ao buscar role organizacional:', orgRoleError);
        }
        
        const currentOrgRole = orgRoleData?.role || null;
        setOrgRole(currentOrgRole);

        // Get user profile
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
        }

        // Get webhook config if user can manage integrations
        // Use the data directly from queries instead of state variables
        const canManageWebhook = currentUserRole === 'super_admin' || 
                                  currentOrgRole === 'owner' || 
                                  currentOrgRole === 'admin';
        
        if (canManageWebhook && orgRoleData?.organization_id) {
          const { data: webhookData } = await supabase
            .from('webhook_configs')
            .select('webhook_token, is_active, tag_id')
            .eq('organization_id', orgRoleData.organization_id)
            .maybeSingle();

          if (webhookData) {
            setWebhookConfig(webhookData);
            
            // Load tag name if tag_id exists
            if (webhookData.tag_id) {
              const { data: tagData } = await supabase
                .from('lead_tags')
                .select('name')
                .eq('id', webhookData.tag_id)
                .single();
              
              if (tagData) {
                setWebhookTagName(tagData.name);
              }
            }
          }
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

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("Erro ao identificar usuário");
      return;
    }

    // Validações
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
      // Primeiro, verificar se a senha atual está correta tentando fazer login
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Senha atual incorreta");
        setChangingPassword(false);
        return;
      }

      // Se a senha atual está correta, atualizar para a nova senha
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Limpar os campos
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

  const handleCreateWebhook = async () => {
    if (!user) return;

    if (!webhookTagName.trim()) {
      toast.error("Digite um nome para a tag do webhook");
      return;
    }

    setLoadingWebhook(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      // Check if webhook already exists
      const { data: existingWebhook } = await supabase
        .from('webhook_configs')
        .select('webhook_token, is_active, tag_id')
        .eq('organization_id', orgData.organization_id)
        .maybeSingle();

      if (existingWebhook) {
        setWebhookConfig(existingWebhook);
        toast.success("Webhook já existe!");
        return;
      }

      // Create tag for webhook leads
      const { data: tagData, error: tagError } = await supabase
        .from('lead_tags')
        .insert({
          name: webhookTagName,
          organization_id: orgData.organization_id,
          color: '#10b981' // Green color for webhook tags
        })
        .select('id')
        .single();

      if (tagError) throw tagError;

      // Create new webhook with tag_id
      const { data, error } = await supabase
        .from('webhook_configs')
        .insert({ 
          organization_id: orgData.organization_id,
          tag_id: tagData.id
        })
        .select('webhook_token, is_active, tag_id')
        .single();

      if (error) throw error;

      setWebhookConfig(data);
      toast.success("Webhook e tag criados com sucesso!");
    } catch (error: any) {
      console.error('Erro ao criar webhook:', error);
      toast.error("Erro ao criar webhook. Tente novamente.");
    } finally {
      setLoadingWebhook(false);
    }
  };

  const handleRegenerateWebhook = async () => {
    if (!user) return;

    setLoadingWebhook(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      // Generate new token
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { data, error } = await supabase
        .from('webhook_configs')
        .update({ webhook_token: newToken })
        .eq('organization_id', orgData.organization_id)
        .select('webhook_token, is_active')
        .single();

      if (error) throw error;

      setWebhookConfig(data);
      toast.success("Token do webhook regenerado!");
    } catch (error: any) {
      console.error('Erro ao regenerar webhook:', error);
      toast.error("Erro ao regenerar webhook. Tente novamente.");
    } finally {
      setLoadingWebhook(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!webhookConfig) return;

    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhookConfig.webhook_token}`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada para a área de transferência!");
  };

  const handleSaveWebhookTag = async () => {
    if (!user || !webhookTagName.trim()) {
      toast.error("Digite um nome para a tag");
      return;
    }

    setSavingTag(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      // Create or find existing tag
      let tagId: string;
      
      if (webhookConfig?.tag_id) {
        // Update existing tag name
        const { error: updateError } = await supabase
          .from('lead_tags')
          .update({ name: webhookTagName })
          .eq('id', webhookConfig.tag_id);
        
        if (updateError) throw updateError;
        tagId = webhookConfig.tag_id;
        toast.success("Tag atualizada com sucesso!");
      } else {
        // Create new tag
        const { data: tagData, error: tagError } = await supabase
          .from('lead_tags')
          .insert({
            name: webhookTagName,
            organization_id: orgData.organization_id,
            color: '#10b981'
          })
          .select('id')
          .single();

        if (tagError) throw tagError;
        tagId = tagData.id;

        // Associate tag with webhook
        const { error: webhookError } = await supabase
          .from('webhook_configs')
          .update({ tag_id: tagId })
          .eq('organization_id', orgData.organization_id);

        if (webhookError) throw webhookError;

        setWebhookConfig(prev => prev ? { ...prev, tag_id: tagId } : null);
        toast.success("Tag criada e associada ao webhook!");
      }

      setEditingTag(false);
    } catch (error: any) {
      console.error('Erro ao salvar tag:', error);
      toast.error("Erro ao salvar tag. Tente novamente.");
    } finally {
      setSavingTag(false);
    }
  };

  const handleStartEditTag = () => {
    setTempTagName(webhookTagName);
    setEditingTag(true);
  };

  const handleCancelEditTag = () => {
    setWebhookTagName(tempTagName);
    setEditingTag(false);
  };

  // Super admins, owners e admins organizacionais podem gerenciar integrações
  const canManageIntegrations = userRole === 'super_admin' || orgRole === 'owner' || orgRole === 'admin';

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
        <p className="text-muted-foreground">Gerencie as configurações da sua conta e integrações</p>
      </div>

      <Tabs defaultValue={canManageIntegrations ? "integracoes" : "perfil"} className="w-full">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${canManageIntegrations ? 4 : 2}, 1fr)` }}>
          {canManageIntegrations && (
            <>
              <TabsTrigger value="integracoes">Integrações</TabsTrigger>
              <TabsTrigger value="equipe">Equipe</TabsTrigger>
            </>
          )}
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
        </TabsList>

        {canManageIntegrations && (
          <TabsContent value="integracoes" className="space-y-6 mt-6">
          {canManageIntegrations ? (
            <>
              <WhatsAppConnection />
              <FacebookLeadsConnection />

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-primary" />
                    Webhook de Formulários
                  </CardTitle>
                  <CardDescription>
                    Integre formulários externos (landing pages, sites) para criar leads automaticamente
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!webhookConfig ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Crie um webhook para receber dados de formulários externos e criar leads automaticamente no CRM.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="webhook-tag">Nome da Tag</Label>
                        <Input
                          id="webhook-tag"
                          value={webhookTagName}
                          onChange={(e) => setWebhookTagName(e.target.value)}
                          placeholder="Ex: Landing Page, Site, Formulário"
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Esta tag será aplicada automaticamente aos leads criados por este webhook
                        </p>
                      </div>
                      <Button 
                        onClick={handleCreateWebhook} 
                        disabled={loadingWebhook || !webhookTagName.trim()}
                        className="w-full"
                      >
                        {loadingWebhook ? "Criando..." : "Criar Webhook"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tag para Identificação dos Leads</Label>
                        {webhookTagName && !editingTag ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-200 dark:border-green-800">
                              {webhookTagName}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleStartEditTag}
                              title="Editar tag"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Aplicada automaticamente aos novos leads
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                value={webhookTagName}
                                onChange={(e) => setWebhookTagName(e.target.value)}
                                placeholder="Ex: Landing Page, Site, Formulário"
                                className="flex-1"
                              />
                              {editingTag ? (
                                <>
                                  <Button 
                                    variant="default"
                                    size="icon"
                                    onClick={handleSaveWebhookTag}
                                    disabled={savingTag || !webhookTagName.trim()}
                                    title="Salvar"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCancelEditTag}
                                    disabled={savingTag}
                                    title="Cancelar"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  onClick={handleSaveWebhookTag}
                                  disabled={savingTag || !webhookTagName.trim()}
                                >
                                  {savingTag ? "Salvando..." : "Salvar"}
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Configure uma tag para identificar automaticamente os leads criados por este webhook
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>URL do Webhook</Label>
                        <div className="flex gap-2">
                          <Input 
                            value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhookConfig.webhook_token}`}
                            readOnly
                            className="font-mono text-xs"
                          />
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={handleCopyWebhookUrl}
                            title="Copiar URL"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use esta URL como destino (action) do seu formulário. Envie dados via POST com os campos: <code className="px-1 py-0.5 bg-muted rounded">nome</code> e <code className="px-1 py-0.5 bg-muted rounded">telefone</code> (obrigatórios), <code className="px-1 py-0.5 bg-muted rounded">email</code>, <code className="px-1 py-0.5 bg-muted rounded">empresa</code>, <code className="px-1 py-0.5 bg-muted rounded">valor</code> (opcionais).
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleRegenerateWebhook}
                        disabled={loadingWebhook}
                        className="w-full"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {loadingWebhook ? "Regenerando..." : "Regenerar Token"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <GlobalFunnelMapping />
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Logs de Integrações
                  </CardTitle>
                  <CardDescription>
                    Visualize e monitore os logs das integrações do Facebook e WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/facebook-webhook-logs')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Logs do Facebook Webhook
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/whatsapp-webhook-logs')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Logs do WhatsApp Webhook
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/form-webhook-logs')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Logs do URL Webhook
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <WhatsAppStatus />
          )}
        </TabsContent>
      )}

        {canManageIntegrations && (
          <TabsContent value="equipe" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Gerenciar Equipe
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Funcionalidade em desenvolvimento</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}

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
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
