import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfileMenu } from "@/components/UserProfileMenu";
import { AutomationRulesModal } from "@/components/AutomationRulesModal";
import { AutomationDashboardModal } from "@/components/AutomationDashboardModal";
import { GoogleCalendarModal } from "@/components/GoogleCalendarModal";
import { ReactNode, useState } from "react";
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
  // Popup detection - if this page loaded inside a Facebook OAuth popup, close it immediately
  if (typeof window !== 'undefined' && window.opener && (
    window.location.search.includes('code=') || window.location.search.includes('facebook=')
  )) {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const fbStatus = urlParams.get('facebook');
    const hasOAuthParams = !!(code && state);

    const payload = hasOAuthParams
      ? { code, state, redirect_uri: `${window.location.origin}${window.location.pathname}` }
      : { facebook: fbStatus, message: urlParams.get('message') };

    try {
      window.opener.postMessage({
        type: 'FACEBOOK_OAUTH_RESPONSE',
        payload
      }, window.location.origin);
    } catch (e) {
      // Ignore cross-origin errors
    }

    setTimeout(() => window.close(), 300);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4" />
        <h2 className="text-xl font-semibold">Conectando ao Facebook</h2>
        <p className="text-muted-foreground mt-2">Esta janela fechara automaticamente em instantes.</p>
      </div>
    );
  }

  const { user, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [dashboardModalOpen, setDashboardModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const isOnChatPage = location.pathname === "/chat";
  const isPipelinePage = location.pathname === '/pipeline';
  const { currentAnnouncement, dismissAnnouncement } = useAnnouncements();

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
          <header className="sticky top-0 z-10 flex h-14 sm:h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6 shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="lg:hidden" />
              {location.pathname === "/dashboard" && (
                <h1 className="text-xl font-semibold text-primary">Dashboard</h1>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
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
              )}
              <NotificationBell />
              <UserProfileMenu />
            </div>
          </header>
          <div
            className={cn(
              "flex-1 overflow-x-hidden",
              isPipelinePage
                ? "overflow-hidden p-0"
                : "overflow-y-auto p-3 sm:p-4 md:p-6"
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
