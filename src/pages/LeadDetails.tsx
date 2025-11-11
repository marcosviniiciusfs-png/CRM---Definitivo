import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, Mail, Building, Calendar, DollarSign, MessageSquare, Activity } from "lucide-react";
import { Link } from "react-router-dom";

const activities = [
  { id: 1, type: "call", description: "Ligação realizada - Discussão sobre proposta", date: "2024-01-15 14:30", user: "Você" },
  { id: 2, type: "email", description: "Email enviado com apresentação da empresa", date: "2024-01-14 10:15", user: "Você" },
  { id: 3, type: "note", description: "Lead demonstrou interesse em solução enterprise", date: "2024-01-13 16:45", user: "Maria Santos" },
  { id: 4, type: "meeting", description: "Reunião agendada para próxima semana", date: "2024-01-12 11:00", user: "Você" },
];

const LeadDetails = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/leads">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Carlos Silva</h1>
          <p className="text-muted-foreground">Tech Solutions Ltda</p>
        </div>
        <Badge>Novo Lead</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Histórico de Atividades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex gap-4 pb-4 border-b last:border-0 last:pb-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {activity.type === "call" && <Phone className="h-4 w-4 text-primary" />}
                      {activity.type === "email" && <Mail className="h-4 w-4 text-primary" />}
                      {activity.type === "note" && <MessageSquare className="h-4 w-4 text-primary" />}
                      {activity.type === "meeting" && <Calendar className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.date} • {activity.user}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Anotações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                placeholder="Adicione uma anotação sobre este lead..." 
                className="min-h-[100px]"
              />
              <Button className="w-full">Salvar Anotação</Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Empresa</p>
                  <p className="text-sm text-muted-foreground">Tech Solutions Ltda</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">carlos@techsolutions.com</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">(11) 98765-4321</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Valor Estimado</p>
                  <p className="text-lg font-bold text-primary">R$ 45.000</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Criado em</p>
                  <p className="text-sm text-muted-foreground">15 de Janeiro, 2024</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start gap-2" variant="outline">
                <Phone className="h-4 w-4" />
                Fazer Ligação
              </Button>
              <Button className="w-full justify-start gap-2" variant="outline">
                <Mail className="h-4 w-4" />
                Enviar Email
              </Button>
              <Button className="w-full justify-start gap-2" variant="outline">
                <Calendar className="h-4 w-4" />
                Agendar Reunião
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
