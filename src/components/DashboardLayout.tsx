import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { AutomationRulesModal } from "@/components/AutomationRulesModal";
import { AutomationDashboardModal } from "@/components/AutomationDashboardModal";
import { ReactNode, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings, BarChart3 } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [dashboardModalOpen, setDashboardModalOpen] = useState(false);
  const isOnChatPage = location.pathname === "/chat";

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 bg-background">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-card px-6">
            <SidebarTrigger className="lg:hidden" />
            <div className="ml-auto flex items-center gap-2">
              {isOnChatPage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDashboardModalOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Logs de Automação
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutomationModalOpen(true)}
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Regras de Automação
                  </Button>
                </>
              )}
              <NotificationBell />
            </div>
          </header>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
      <AutomationRulesModal 
        open={automationModalOpen} 
        onOpenChange={setAutomationModalOpen} 
      />
      <AutomationDashboardModal 
        open={dashboardModalOpen} 
        onOpenChange={setDashboardModalOpen} 
      />
    </SidebarProvider>
  );
}
