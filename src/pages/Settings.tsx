import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, User, Bell, Shield, Users, Moon, Sun } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { WhatsAppStatus } from "@/components/WhatsAppStatus";
import { WebhookLogs } from "@/components/WebhookLogs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Settings = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

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
        } else if (roleData) {
          setUserRole(roleData.role || null);
        }

        // Get organization role
        const { data: orgRoleData, error: orgRoleError } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (orgRoleError) {
          console.error('Erro ao buscar role organizacional:', orgRoleError);
        } else if (orgRoleData) {
          setOrgRole(orgRoleData.role || null);
        }

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

      <Tabs defaultValue="integracoes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="integracoes" className="space-y-6 mt-6">
          {canManageIntegrations ? (
            <>
              <WhatsAppConnection />
              <WebhookLogs />
            </>
          ) : (
            <WhatsAppStatus />
          )}
        </TabsContent>


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

        <TabsContent value="perfil" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Perfil do Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Input id="current-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input id="new-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input id="confirm-password" type="password" />
              </div>
              <Button>Atualizar Senha</Button>
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações de Email</p>
                  <p className="text-sm text-muted-foreground">Receba atualizações por email</p>
                </div>
                <Button variant="outline">Ativado</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Alertas de Tarefas Vencidas</p>
                  <p className="text-sm text-muted-foreground">Notificação quando uma tarefa vence</p>
                </div>
                <Button variant="outline">Ativado</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Leads sem Atividade</p>
                  <p className="text-sm text-muted-foreground">Alerta para leads inativos por 7 dias</p>
                </div>
                <Button variant="outline">Ativado</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
