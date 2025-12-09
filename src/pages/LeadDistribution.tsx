import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadDistributionList } from "@/components/LeadDistributionList";
import { AgentDistributionSettings } from "@/components/AgentDistributionSettings";
import { DistributionHistory } from "@/components/DistributionHistory";
import { Settings2, User, History } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export default function LeadDistribution() {
  const permissions = usePermissions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Roleta de Leads</h1>
        <p className="text-muted-foreground mt-2">
          Configure e gerencie a distribuição automática de leads entre sua equipe
        </p>
      </div>

      <Tabs defaultValue={permissions.canCreateRoulettes ? "config" : "agent"} className="space-y-6">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          {permissions.canCreateRoulettes && (
            <TabsTrigger value="config" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <Settings2 className="h-4 w-4" />
              Roletas
            </TabsTrigger>
          )}
          <TabsTrigger value="agent" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <User className="h-4 w-4" />
            {permissions.canManageAgentSettings ? "Configurar Agentes" : "Minhas Preferências"}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {permissions.canCreateRoulettes && (
          <TabsContent value="config">
            <LeadDistributionList />
          </TabsContent>
        )}

        <TabsContent value="agent">
          <AgentDistributionSettings />
        </TabsContent>

        <TabsContent value="history">
          <DistributionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
