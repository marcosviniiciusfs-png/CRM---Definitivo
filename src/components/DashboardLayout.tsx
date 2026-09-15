import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AutomationRulesModal } from "@/components/AutomationRulesModal";
import { AutomationDashboardModal } from "@/components/AutomationDashboardModal";
import { GoogleCalendarModal } from "@/components/GoogleCalendarModal";
import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Settings, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import googleCalendarIcon from "@/assets/google-calendar-icon.png";
import { cn } from "@/lib/utils";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { useAnnouncements } from "@/hooks/useAnnouncements";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const isOAuthPopup = typeof window !== 'undefined' && window.opener && (
    window.location.search.includes('code=') || window.location.search.includes('facebook=')
  );
  const { user, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [dashboardModalOpen, setDashboardModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const isOnChatPage = location.pathname === "/chat";
  const isPipelinePage = location.pathname === '/pipeline';
  const hasHeaderActions = isOnChatPage || isSuperAdmin;
  const { currentAnnouncement, dismissAnnouncement } = useAnnouncements();

  useEffect(() => {
    if (!isOAuthPopup) return;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const hasOAuthParams = !!(code && state);
    const payload = hasOAuthParams
      ? { code, state, redirect_uri: `${window.location.origin}${window.location.pathname}` }
      : { facebook: urlParams.get('facebook'), message: urlParams.get('message') };

    try {
      window.opener.postMessage({ type: 'FACEBOOK_OAUTH_RESPONSE', payload }, window.location.origin);
    } catch {
      // O popup ainda se fecha mesmo se a janela de origem nao estiver acessivel.
    }

    const closeTimer = window.setTimeout(() => window.close(), 300);
    return () => window.clearTimeout(closeTimer);
  }, [isOAuthPopup]);

  if (isOAuthPopup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4" />
        <h2 className="text-xl font-semibold">Conectando ao Facebook</h2>
        <p className="text-muted-foreground mt-2">Esta janela fechara automaticamente em instantes.</p>
      </div>
    );
  }

  const handleDismissAnnouncement = (announcementId: string, dontShowAgain: boolean) => {
    dismissAnnouncement(announcementId, dontShowAgain);
  };

  // Inicializar com estado do localStorage para evitar flash
  const getInitialOpen = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-locked') === 'true';
    }
    return false;
  };

  return (
    <SidebarProvider defaultOpen={getInitialOpen()}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
          <header className="relative z-10 h-2.5 shrink-0 overflow-visible border-b bg-card">
            <div className="absolute left-3 top-2 flex items-center gap-4 lg:hidden">
              <SidebarTrigger className="lg:hidden" />
            </div>
            {hasHeaderActions && (
              <div className="absolute right-3 top-2 flex items-center gap-1 sm:gap-2">
                {isOnChatPage && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDashboardModalOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Logs de Automação</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAutomationModalOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Regras de Automação</span>
                    </Button>
                  </>
                )}
                {isSuperAdmin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghostIcon"
                        size="icon"
                        onClick={() => setCalendarModalOpen(true)}
                        className="h-8 w-8"
                      >
                        <img 
                          src={googleCalendarIcon} 
                          alt="Google Calendar" 
                          className="h-6 w-6"
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Meu Calendário</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </header>
          <div
            className={cn(
              "flex-1 overflow-x-hidden",
              isPipelinePage
                ? "overflow-hidden p-0"
                : "overflow-y-auto px-2 pb-2 pt-0 sm:px-3 sm:pb-3 sm:pt-0 md:px-4 md:pb-4 md:pt-0"
            )}
          >
            <div className={cn("min-w-0 w-full max-w-full", isPipelinePage && "h-full")}>
              {children}
            </div>
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
      <AnnouncementPopup
        announcement={currentAnnouncement}
        onDismiss={handleDismissAnnouncement}
      />
    </SidebarProvider>
  );
}
