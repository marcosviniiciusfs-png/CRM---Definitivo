import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageSquare, BarChart3, Link2, Plug } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import { IntegrationsHub } from "@/components/IntegrationsHub";
import { WebhookIntegrationsTab } from "@/components/WebhookIntegrationsTab";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";

const Integrations = () => {
  const { organizationId, isReady } = useOrganizationReady();

  // Guard: Aguardar inicialização completa (auth + org)
  if (!isReady || !organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingAnimation text="Carregando integrações..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">Conecte e gerencie suas integrações com serviços externos</p>
      </div>

      <Tabs defaultValue="conexoes" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="conexoes" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Conexões
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexoes" className="mt-6">
          <div className="space-y-6">
            <WhatsAppConnection />
            <IntegrationsHub />
            <FacebookLeadsConnection />
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-6">
          <WebhookIntegrationsTab organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Logs de Acompanhamento
              </CardTitle>
              <CardDescription>
                Monitore os webhooks e eventos das suas integrações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  asChild 
                  className="justify-start border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 dark:text-blue-400"
                >
                  <Link to="/facebook-webhook-logs">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Logs Facebook Leads
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  asChild 
                  className="justify-start border-green-200 bg-green-50/50 hover:bg-green-100/50 text-green-600 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/50 dark:text-green-400"
                >
                  <Link to="/whatsapp-webhook-logs">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Logs WhatsApp
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  asChild 
                  className="justify-start border-orange-200 bg-orange-50/50 hover:bg-orange-100/50 text-orange-600 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-950/50 dark:text-orange-400"
                >
                  <Link to="/form-webhook-logs">
                    <Link2 className="h-4 w-4 mr-2" />
                    Logs Webhook
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  asChild 
                  className="justify-start border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 text-purple-600 dark:border-purple-800 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 dark:text-purple-400"
                >
                  <Link to="/meta-pixel-logs">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Logs Meta Pixel
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Integrations;
