import { Home, Kanban, CheckSquare, Users, Settings, LogOut, MessageSquare, Lock, Unlock, ChevronDown, Briefcase, UserCircle, Layers, Activity, BarChart3, Shuffle, Puzzle, Trophy, AlertTriangle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { MenuLockToggle } from "@/components/MenuLockToggle";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { cn } from "@/lib/utils";
import { useTaskAlert } from "@/contexts/TaskAlertContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import logoFull from "@/assets/kairoz-logo-full-new.png";
import logoIcon from "@/assets/kairoz-logo-icon.png";

const PLAN_NAMES: { [key: string]: string } = {
  'star': 'Star',
  'pro': 'Pro',
  'elite': 'Elite'
};

// Features bloqueadas - "Em breve" (default, pode ser liberado por user_section_access)
const LOCKED_FEATURES = ['/lead-metrics', '/lead-distribution', '/chat', '/integrations'];

// Mapeamento URL -> section_key
const URL_TO_SECTION: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/pipeline': 'pipeline',
  '/leads': 'leads',
  '/lead-metrics': 'lead-metrics',
  '/lead-distribution': 'lead-distribution',
  '/chat': 'chat',
  '/ranking': 'ranking',
  '/administrativo/colaboradores': 'colaboradores',
  '/administrativo/producao': 'producao',
  '/administrativo/equipes': 'equipes',
  '/administrativo/atividades': 'atividades',
  '/tasks': 'tasks',
  '/integrations': 'integrations',
  '/settings': 'settings',
};

const items = [
  { title: "Início", url: "/dashboard", icon: Home },
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Métricas", url: "/lead-metrics", icon: BarChart3 },
  { title: "Roleta de Leads", url: "/lead-distribution", icon: Shuffle },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Ranking", url: "/ranking", icon: Trophy },
];

const administrativoItems = [
  { title: "Colaboradores", url: "/administrativo/colaboradores", icon: UserCircle },
  { title: "Produção", url: "/administrativo/producao", icon: Layers },
  { title: "Equipes", url: "/administrativo/equipes", icon: Users },
  { title: "Atividades", url: "/administrativo/atividades", icon: Activity },
];

const bottomItems = [
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
  { title: "Integrações", url: "/integrations", icon: Puzzle },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const SIDEBAR_LOCK_KEY = "sidebar-locked";

function AppSidebarComponent() {
  const { open, setOpen } = useSidebar();
  const { signOut, user, subscriptionData } = useAuth();
  const permissions = usePermissions();
  const { hasPendingTasks, needsAudioPermission } = useTaskAlert();

  const { sectionAccess, isSectionUnlocked, loading: sectionLoading } = useSectionAccess();

  // Helper: check if a URL is visible based on section access
  const isSectionVisible = useCallback((url: string) => {
    if (sectionAccess === null) return undefined; // no overrides loaded
    const key = URL_TO_SECTION[url];
    if (!key) return undefined;

    return sectionAccess[key];
  }, [sectionAccess]);

  // Helper: check if a feature should be locked
  const isFeatureLocked = useCallback((url: string) => {
    if (sectionLoading) return false; // Don't show locks while loading
    const access = isSectionVisible(url);
    if (access === true) return false;
    if (access === false) return true;
    return LOCKED_FEATURES.includes(url);
  }, [isSectionVisible, sectionLoading]);

  // Classes condicionais para hover/active - neutras para ambos os temas
  const hoverClass = "hover:bg-sidebar-accent/60";
  const activeClass = "bg-sidebar-accent";
  const activeTextClass = "text-sidebar-primary";

  // Inicializar estado de bloqueio do localStorage
  const [isLocked, setIsLocked] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_LOCK_KEY);
    return saved === 'true';
  });
  const [administrativoOpen, setAdministrativoOpen] = useState(false);
  // Persistir estado de bloqueio no localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_LOCK_KEY, String(isLocked));
  }, [isLocked]);

  // Manter sidebar aberto quando bloqueado
  useEffect(() => {
    if (isLocked && !open) {
      setOpen(true);
    }
  }, [isLocked, open, setOpen]);

  // Handlers memoizados para evitar re-renderizações
  const handleMouseEnter = useCallback(() => {
    if (!isLocked) {
      setOpen(true);
    }
  }, [isLocked, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (!isLocked) {
      setOpen(false);
    }
  }, [isLocked, setOpen]);

  return (
    <TooltipProvider delayDuration={300}>
      <Sidebar
        collapsible="icon"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="border-r border-sidebar-border shadow-sm"
      >
        <SidebarContent className="bg-sidebar overflow-y-auto">
          <div className="p-4 pb-4 flex items-center justify-center">
            <img
              src={logoFull}
              alt="KairoZ"
              className={cn(
                "h-10 w-auto object-contain",
                open ? "block" : "hidden"
              )}
            />
            <img
              src={logoIcon}
              alt="K"
              className={cn(
                "h-8 w-auto object-contain",
                open ? "hidden" : "block"
              )}
            />
          </div>

          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-sm px-3">Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {items.map((item) => {
                  // Ocultar "Métricas" para membros
                  if (item.url === '/lead-metrics' && !permissions.canViewTeamMetrics) {
                    return null;
                  }

                  // Section access: if explicitly disabled, hide completely
                  const accessOverride = isSectionVisible(item.url);
                  if (accessOverride === false) return null;

                  const locked = isFeatureLocked(item.url);

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild={!locked}>
                        {locked ? (
                          open ? (
                            <div className={cn("flex items-center gap-2 opacity-50 cursor-not-allowed text-sidebar-foreground text-base px-3 py-2.5")}>
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span className="truncate">{item.title}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  Em breve
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center opacity-50 cursor-not-allowed text-sidebar-foreground py-2.5">
                                  <item.icon className="h-5 w-5" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {item.title} - Em breve
                              </TooltipContent>
                            </Tooltip>
                          )
                        ) : (
                          <NavLink
                            to={item.url}
                            end
                            className={cn(hoverClass, "text-sidebar-foreground text-base px-3 py-2.5")}
                            activeClassName={cn(activeClass, activeTextClass, "font-semibold")}
                          >
                            <item.icon className="h-5 w-5 flex-shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </NavLink>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

                {permissions.canAccessAdminSection && (
                  <Collapsible open={administrativoOpen} onOpenChange={setAdministrativoOpen} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className={cn(hoverClass, "text-sidebar-foreground text-base px-3 py-2.5")}>
                          <Briefcase className="h-5 w-5 flex-shrink-0" />
                          <span>Administrativo</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {administrativoItems.map((subItem) => {
                            const subAccess = isSectionVisible(subItem.url);
                            if (subAccess === false) return null;
                            return (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    className={cn(hoverClass, "text-sidebar-foreground text-sm px-3 py-2")}
                                    activeClassName={cn(activeClass, activeTextClass, "font-semibold")}
                                  >
                                    <subItem.icon className="h-4 w-4 flex-shrink-0" />
                                    <span>{subItem.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {bottomItems.map((item) => {
                  // Section access: if explicitly disabled, hide completely
                  const accessOverride = isSectionVisible(item.url);
                  if (accessOverride === false) return null;

                  const locked = isFeatureLocked(item.url);

                  // Indicador especial para Tarefas
                  const isTasksItem = item.url === '/tasks';
                  const showTaskIndicator = isTasksItem && hasPendingTasks;
                  const showWarningIndicator = isTasksItem && hasPendingTasks && needsAudioPermission;
                  const warningBgClass = showWarningIndicator ? "bg-amber-400/10" : "";

                  if (locked) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton>
                          {open ? (
                            <div className={cn("flex items-center gap-2 opacity-50 cursor-not-allowed text-sidebar-foreground text-base w-full")}>
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span>{item.title}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  Em breve
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center opacity-50 cursor-not-allowed text-sidebar-foreground py-2.5 w-full">
                                  <item.icon className="h-5 w-5" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {item.title} - Em breve
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.title} className="relative">
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className={cn(hoverClass, warningBgClass, "text-sidebar-foreground text-base px-3 py-2.5 relative")}
                          activeClassName={cn(activeClass, "text-sidebar-primary font-semibold")}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0" />
                          <span>{item.title}</span>

                          {/* Indicador de tarefas pendentes */}
                          {showTaskIndicator && !showWarningIndicator && (
                            <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-amber-400 rounded-full animate-pulse" />
                          )}

                          {/* Indicador de aviso (precisa ativar som) */}
                          {showWarningIndicator && (
                            <span className="absolute top-0.5 right-0.5 text-amber-400 animate-pulse">
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-4 overflow-hidden">
          {/* Conteúdo expandido */}
          {open && (
            <div className="space-y-3">
              {/* Seletor de Organização */}
              <OrganizationSwitcher collapsed={false} />

              <MenuLockToggle
                locked={isLocked}
                onToggle={setIsLocked}
              />
              {subscriptionData?.subscribed && subscriptionData.product_id && (
                <div className="flex items-center justify-center">
                  <span className="text-xs font-semibold border border-sidebar-border rounded-full px-2.5 py-0.5 bg-sidebar-accent text-sidebar-foreground">
                    Plano {PLAN_NAMES[subscriptionData.product_id] || subscriptionData.product_id}
                  </span>
                </div>
              )}
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.email}
              </p>
              <Button
                onClick={signOut}
                variant="outline"
                className="w-full justify-start gap-2 bg-black hover:bg-black/80 border-sidebar-border text-white text-sm"
                size="sm"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          )}

          {/* Conteúdo colapsado */}
          {!open && (
            <div className="space-y-2">
              {/* Seletor de Organização colapsado */}
              <OrganizationSwitcher collapsed={true} />

              <Button
                onClick={() => setIsLocked(!isLocked)}
                variant="ghostIcon"
                size="icon"
                className={cn("w-full", isLocked && "bg-sidebar-accent")}
              >
                {isLocked ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={signOut}
                variant="ghostIcon"
                size="icon"
                className="w-full"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}

// Memoizar componente para evitar re-renderizações desnecessárias
export const AppSidebar = React.memo(AppSidebarComponent);
