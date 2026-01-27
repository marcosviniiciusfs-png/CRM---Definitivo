import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2, Plug } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import { IntegrationsHub } from "@/components/IntegrationsHub";
import { WebhookIntegrationsTab } from "@/components/WebhookIntegrationsTab";
import { IntegratedLogsViewer } from "@/components/IntegratedLogsViewer";
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
          <IntegratedLogsViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Integrations;
