import { Home, Filter, CheckSquare, Users, Settings, LogOut, MessageCircle, Lock, Unlock, ChevronDown, Building2, UserCircle, Layers, Activity, BarChart2, Shuffle, Puzzle, Trophy, AlertTriangle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { MenuLockToggle } from "@/components/MenuLockToggle";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { useTheme } from "@/contexts/ThemeContext";
import React, { useState, useEffect, useCallback } from "react";
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
const LOCKED_FEATURES = ['/lead-metrics', '/lead-distribution', '/chat'];

// Mapeamento URL -> section_key
const URL_TO_SECTION: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/pipeline': 'pipeline',
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
  { title: "Funil de Vendas", url: "/pipeline", icon: Filter },
  { title: "Métricas", url: "/lead-metrics", icon: BarChart2 },
  { title: "Roleta de Leads", url: "/lead-distribution", icon: Shuffle },
  { title: "Chat", url: "/chat", icon: MessageCircle },
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
  const { theme } = useTheme();
  const { signOut, user, subscriptionData, isSuperAdmin, roleLoading } = useAuth();
  const permissions = usePermissions();
  const { hasPendingTasks, needsAudioPermission } = useTaskAlert();

  const { sectionAccess, loading: sectionLoading } = useSectionAccess();

  // Helper: check if a URL is visible based on section access + custom role
  const isSectionVisible = useCallback((url: string) => {
    // Owners, admins e superadmins nunca são bloqueados
    if (isSuperAdmin || permissions.role === 'owner' || permissions.role === 'admin') {
      return undefined; // undefined = não bloqueia, não força
    }

    // Para membros com cargo personalizado, aplicar permissões do cargo
    if (permissions.role === 'member' && permissions.customRoleId !== null && !permissions.loading) {
      if (url === '/pipeline' && !permissions.canViewPipeline) return false;
      if (url === '/tasks' && !permissions.canViewKanban) return false;
      if (url === '/chat' && !permissions.canViewChat) return false;
    }

    if (sectionAccess === null) return undefined;
    const key = URL_TO_SECTION[url];
    if (!key) return undefined;
    return sectionAccess[key];
  }, [sectionAccess, isSuperAdmin, permissions]);

  // Helper: check if a feature should be locked
  const isFeatureLocked = useCallback((url: string) => {
    // 1. Se estiver carregando Auth, Role OU Organização, NÃO mostre o cadeado para evitar flicker
    if (sectionLoading || permissions.loading || roleLoading) return false;

    // 2. Se for Super Admin, Proprietário ou Administrador, NUNCA mostre cadeados.
    // Super Admin ignora qualquer bloqueio de plano ou seção.
    if (isSuperAdmin || permissions.role === 'owner' || permissions.role === 'admin') return false;

    // 3. Se ainda não temos os dados carregados do mapa de acesso, não bloqueie por segurança
    if (sectionAccess === null) return false;

    const access = isSectionVisible(url);
    if (access === true) return false; // explicitamente liberado pelo banco de dados
    if (access === false) return true; // explicitamente bloqueado pelo banco de dados

    // 4. Default: se for uma feature bloqueada padrão e não houver override, bloqueia
    return LOCKED_FEATURES.includes(url);
  }, [isSectionVisible, sectionAccess, sectionLoading, permissions.role, permissions.loading, isSuperAdmin]);

  // Classes condicionais para hover/active - neutras para ambos os temas
  const hoverClass = "hover:bg-sidebar-accent/60";
  const activeClass = "active-sidebar-gradient";
  const activeTextClass = "text-white";

  // Helper para animações de ícone
  const getIconAnimationClass = (url: string, isActive: boolean) => {
    if (url === "/pipeline") return isActive ? "active-icon-pipeline" : "sidebar-icon-pipeline";
    if (url === "/chat") return isActive ? "active-icon-chat" : "sidebar-icon-chat";
    if (url === "/ranking") return isActive ? "active-icon-ranking" : "sidebar-icon-ranking";
    if (url === "/lead-distribution") return isActive ? "active-icon-shuffle" : "sidebar-icon-shuffle";
    if (url === "/settings") return isActive ? "active-icon-settings" : "sidebar-icon-settings";
    if (url === "/integrations") return isActive ? "active-icon-integrations" : "sidebar-icon-integrations";
    if (url === "/dashboard") return isActive ? "active-icon-home" : "sidebar-icon-home";
    if (url === "/lead-metrics") return isActive ? "active-icon-metrics" : "sidebar-icon-metrics";

    return isActive ? "active-icon-default" : "sidebar-icon-default";
  };

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
                "w-auto object-contain",
                open ? "h-10 block" : "h-10 hidden",
                theme === "dark" ? "brightness-0 invert" : "logo-red-filter"
              )}
            />
            <img
              src={logoIcon}
              alt="K"
              className={cn(
                "w-auto object-contain",
                open ? "h-8 hidden" : "h-8 block",
                theme === "dark" ? "brightness-0 invert" : "logo-red-filter"
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
                            className={cn(hoverClass, "text-sidebar-foreground text-base px-3 py-2.5 transition-all duration-200")}
                            activeClassName={cn(activeClass, activeTextClass, "font-semibold shadow-md")}
                          >
                            {({ isActive }) => (
                              <>
                                <item.icon className={cn("h-5 w-5 flex-shrink-0 transition-all duration-300", getIconAnimationClass(item.url, isActive))} />
                                <span className="truncate">{item.title}</span>
                              </>
                            )}
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
                          <Building2 className="h-5 w-5 flex-shrink-0 sidebar-icon-default" />
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
                                    {({ isActive }) => (
                                      <>
                                        <subItem.icon className={cn("h-4 w-4 flex-shrink-0 transition-all duration-300", isActive ? "active-icon-default" : "sidebar-icon-default")} />
                                        <span>{subItem.title}</span>
                                      </>
                                    )}
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
                          className={cn(hoverClass, warningBgClass, "text-sidebar-foreground text-base px-3 py-2.5 relative transition-all duration-200")}
                          activeClassName={cn(activeClass, "text-white font-semibold shadow-md")}
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon className={cn("h-5 w-5 flex-shrink-0 transition-all duration-300", getIconAnimationClass(item.url, isActive))} />
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
                            </>
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
