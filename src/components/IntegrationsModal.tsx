import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Video, Sheet, MessageSquare, CreditCard, Instagram, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { GoogleCalendarConnection } from "./GoogleCalendarConnection";
import { MetaPixelConnection } from "./MetaPixelConnection";
import metaPixelIcon from "@/assets/meta-pixel-icon.png";
import googleCalendarIcon from "@/assets/google-calendar-icon.png";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "available" | "coming_soon";
  component?: React.ComponentType<{ onClose?: () => void; onBack?: () => void }>;
}

interface IntegrationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IntegrationsModal = ({ open, onOpenChange }: IntegrationsModalProps) => {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  const integrations: Integration[] = [
    {
      id: "meta_pixel",
      name: "Meta Conversions API",
      description: "Envie eventos de conversão para o Meta Ads automaticamente",
      icon: <img src={metaPixelIcon} alt="Meta Pixel" className="h-6 w-6" />,
      status: "available",
      component: MetaPixelConnection,
    },
    {
      id: "google_calendar",
      name: "Google Calendar",
      description: "Agende reuniões e eventos automaticamente com leads",
      icon: <img src={googleCalendarIcon} alt="Google Calendar" className="h-6 w-6" />,
      status: "available",
      component: GoogleCalendarConnection,
    },
    {
      id: "gmail",
      name: "Gmail",
      description: "Envie e-mails diretamente do CRM com templates",
      icon: <Mail className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "google_meet",
      name: "Google Meet",
      description: "Gere links de reunião automaticamente",
      icon: <Video className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "google_sheets",
      name: "Google Sheets",
      description: "Exporte dados e crie relatórios personalizados",
      icon: <Sheet className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "slack",
      name: "Slack",
      description: "Notificações em tempo real no seu workspace",
      icon: <MessageSquare className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "mercado_pago",
      name: "Mercado Pago",
      description: "Gere links de pagamento e acompanhe status",
      icon: <CreditCard className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "instagram",
      name: "Instagram Direct",
      description: "Receba mensagens do Instagram no chat",
      icon: <Instagram className="h-6 w-6" />,
      status: "coming_soon",
    },
    {
      id: "notion",
      name: "Notion",
      description: "Sincronize tarefas do Kanban com o Notion",
      icon: <FileSpreadsheet className="h-6 w-6" />,
      status: "coming_soon",
    },
  ];

  const handleIntegrationClick = (integration: Integration) => {
    if (integration.status === "available" && integration.component) {
      setSelectedIntegration(integration);
    }
  };

  const handleCloseIntegration = () => {
    setSelectedIntegration(null);
  };

  if (selectedIntegration?.component) {
    const IntegrationComponent = selectedIntegration.component;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <IntegrationComponent onClose={handleCloseIntegration} onBack={handleCloseIntegration} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Integrações Disponíveis</DialogTitle>
          <DialogDescription>
            Conecte ferramentas externas ao CRM para automatizar seu trabalho
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {integrations.map((integration) => (
            <Card
              key={integration.id}
              className={`${
                integration.status === "available"
                  ? "cursor-pointer hover:border-primary/50 transition-colors"
                  : "opacity-60 cursor-not-allowed"
              }`}
              onClick={() => handleIntegrationClick(integration)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-muted rounded-lg">
                    {integration.icon}
                  </div>
                  <Badge
                    variant={integration.status === "available" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {integration.status === "available" ? "Disponível" : "Em breve"}
                  </Badge>
                </div>
                <h3 className="font-semibold mb-1">{integration.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {integration.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};