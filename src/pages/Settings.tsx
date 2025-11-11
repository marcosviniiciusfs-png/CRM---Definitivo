import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, User, Bell, Shield } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";

const Settings = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências e configurações do sistema</p>
      </div>

      <WhatsAppConnection />

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
              <Input id="name" defaultValue="João Silva" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="joao@empresa.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Cargo</Label>
            <Input id="role" defaultValue="Gerente de Vendas" />
          </div>
          <Button>Salvar Alterações</Button>
        </CardContent>
      </Card>

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
    </div>
  );
};

export default Settings;
