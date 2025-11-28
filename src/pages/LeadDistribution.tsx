import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadDistributionConfig } from "@/components/LeadDistributionConfig";
import { AgentDistributionSettings } from "@/components/AgentDistributionSettings";
import { DistributionHistory } from "@/components/DistributionHistory";
import { Settings2, User, History } from "lucide-react";

export default function LeadDistribution() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Roleta de Leads</h1>
          <p className="text-muted-foreground mt-2">
            Configure e gerencie a distribuição automática de leads entre sua equipe
          </p>
        </div>

        <Tabs defaultValue="config" className="space-y-6">
          <TabsList>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Configuração Geral
            </TabsTrigger>
            <TabsTrigger value="agent" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Minhas Preferências
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <LeadDistributionConfig />
          </TabsContent>

          <TabsContent value="agent">
            <AgentDistributionSettings />
          </TabsContent>

          <TabsContent value="history">
            <DistributionHistory />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}