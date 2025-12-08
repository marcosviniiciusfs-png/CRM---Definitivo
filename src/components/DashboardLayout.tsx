import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { AutomationRulesModal } from "@/components/AutomationRulesModal";
import { AutomationDashboardModal } from "@/components/AutomationDashboardModal";
import { GoogleCalendarModal } from "@/components/GoogleCalendarModal";
import { ReactNode, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import googleCalendarIcon from "@/assets/google-calendar-icon.png";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [dashboardModalOpen, setDashboardModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const isOnChatPage = location.pathname === "/chat";

  // Inicializar com estado do localStorage para evitar flash
  const getInitialOpen = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-locked') === 'true';
    }
    return false;
  };

  return (
    <SidebarProvider defaultOpen={getInitialOpen()}>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghostIcon"
                    size="icon"
                    onClick={() => setCalendarModalOpen(true)}
                    className="h-9 w-9"
                  >
                    <img 
                      src={googleCalendarIcon} 
                      alt="Google Calendar" 
                      className="h-7 w-7"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Meu Calendário</p>
                </TooltipContent>
              </Tooltip>
              <NotificationBell />
              <UserProfileMenu />
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
      <GoogleCalendarModal
        open={calendarModalOpen}
        onOpenChange={setCalendarModalOpen}
      />
    </SidebarProvider>
  );
}
