import { Home, Filter, CheckSquare, Users, Settings, LogOut, MessageCircle, Lock, Unlock, ChevronDown, Building2, UserCircle, Layers, Activity, BarChart2, Shuffle, Puzzle, Trophy, AlertTriangle, CalendarDays, Gauge, Calculator, Wallet, type LucideIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { MenuLockToggle } from "@/components/MenuLockToggle";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { useTheme } from "@/contexts/ThemeContext";
import React, { useState, useEffect, useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { useChatAccess } from "@/hooks/useChatAccess";
import { cn } from "@/lib/utils";
import { useTaskAlert } from "@/contexts/TaskAlertContext";
import { SIDEBAR_LOCK_KEY, readSidebarLocked } from "@/lib/sidebarLock";
import { demoAwareUrl } from "@/lib/demoMode";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
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
  '/reunioes': 'reunioes',
  '/administrativo/colaboradores': 'colaboradores',
  '/administrativo/producao': 'producao',
  '/administrativo/equipes': 'equipes',
  '/administrativo/atividades': 'atividades',
  '/tasks': 'tasks',
  '/integrations': 'integrations',
  '/settings': 'settings',
};

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Só aparece no modo consórcio. */
  consorcioOnly?: boolean;
}

// Grupos do menu (DESIGN.md: menu com nomes e grupos Vendas, Análise e Equipe).
const NAV_GROUPS: Array<{ label: string; items: NavItem[]; withAdmin?: boolean }> = [
  {
    label: "Vendas",
    items: [
      { title: "Início", url: "/dashboard", icon: Home },
      { title: "Funil de vendas", url: "/pipeline", icon: Filter },
      { title: "Chat", url: "/chat", icon: MessageCircle },
      { title: "Reuniões", url: "/reunioes", icon: CalendarDays },
      { title: "Simulador", url: "/simulador", icon: Calculator, consorcioOnly: true },
      { title: "Tarefas", url: "/tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Análise",
    items: [
      { title: "Métricas", url: "/lead-metrics", icon: BarChart2 },
      { title: "Painel", url: "/painel", icon: Gauge },
      { title: "Ranking", url: "/ranking", icon: Trophy },
    ],
  },
  {
    label: "Equipe",
    items: [
      { title: "Roleta de leads", url: "/lead-distribution", icon: Shuffle },
      { title: "Comissões", url: "/comissoes", icon: Wallet },
    ],
    withAdmin: true,
  },
];

const administrativoItems: NavItem[] = [
  { title: "Colaboradores", url: "/administrativo/colaboradores", icon: UserCircle },
  { title: "Produção", url: "/administrativo/producao", icon: Layers },
  { title: "Equipes", url: "/administrativo/equipes", icon: Users },
  { title: "Atividades", url: "/administrativo/atividades", icon: Activity },
];

const footerItems: NavItem[] = [
  { title: "Integrações", url: "/integrations", icon: Puzzle },
  { title: "Configurações", url: "/settings", icon: Settings },
];

const itemBase =
  "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";
const itemActive = "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

function AppSidebarComponent() {
  const { open, setOpen, isMobile, openMobile, setOpenMobile } = useSidebar();

  // On mobile (Sheet overlay), always treat sidebar as expanded for rendering
  const isOpen = isMobile ? true : open;
  const { theme } = useTheme();
  const { signOut, user, subscriptionData, isSuperAdmin, roleLoading } = useAuth();
  const permissions = usePermissions();
  const { isConsorcio } = useOrganizationSegment();
  const { canAccessChat } = useChatAccess();
  const { hasPendingTasks, needsAudioPermission } = useTaskAlert();

  const { sectionAccess, loading: sectionLoading } = useSectionAccess();

  // Helper: check if a URL is visible based on section access + custom role
  const isSectionVisible = useCallback((url: string) => {
    // Owners, admins e superadmins nunca são bloqueados
    if (isSuperAdmin || permissions.role === 'owner' || permissions.role === 'admin') {
      return undefined; // undefined = não bloqueia, não força
    }

    // Para membros com cargo personalizado, aplicar permissões do cargo.
    // Excecao: /chat tem fallback de atribuicao a canal WhatsApp
    // (useChatAccess combina cargo + atribuicao em whatsapp_channel_members).
    if (permissions.role === 'member' && permissions.customRoleId !== null && !permissions.loading) {
      if (url === '/pipeline' && !permissions.canViewPipeline) return false;
      if (url === '/tasks' && !permissions.canViewKanban) return false;
      if (url === '/chat' && !canAccessChat) return false;
    }

    // Override universal: atribuicao a canal libera /chat mesmo se o
    // sectionAccess global do plano/admin disser false.
    if (url === '/chat' && canAccessChat) return true;

    if (sectionAccess === null) return undefined;
    const key = URL_TO_SECTION[url];
    if (!key) return undefined;
    return sectionAccess[key];
  }, [sectionAccess, isSuperAdmin, permissions, canAccessChat]);

  // Helper: check if a feature should be locked
  const isFeatureLocked = useCallback((url: string) => {
    // 1. Se estiver carregando Auth, Role OU Organização, NÃO mostre o cadeado para evitar flicker
    if (sectionLoading || permissions.loading || roleLoading) return false;

    // 2. Se for Super Admin, Proprietário ou Administrador, NUNCA mostre cadeados.
    if (isSuperAdmin || permissions.role === 'owner' || permissions.role === 'admin') return false;

    // 3. Se ainda não temos os dados carregados do mapa de acesso, não bloqueie por segurança
    if (sectionAccess === null) return false;

    const access = isSectionVisible(url);
    if (access === true) return false; // explicitamente liberado pelo banco de dados
    if (access === false) return true; // explicitamente bloqueado pelo banco de dados

    // 4. Default: se for uma feature bloqueada padrão e não houver override, bloqueia
    return LOCKED_FEATURES.includes(url);
  }, [isSectionVisible, sectionAccess, sectionLoading, permissions.role, permissions.loading, isSuperAdmin]);

  const [isLocked, setIsLocked] = useState(readSidebarLocked);
  const [administrativoOpen, setAdministrativoOpen] = useState(false);

  // Fechar sidebar mobile ao navegar
  const location = useLocation();
  useEffect(() => {
    if (isMobile && openMobile) {
      // Delay suficiente para a navegação completar e não conflitar com animação
      const timer = setTimeout(() => setOpenMobile(false), 250);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, isMobile, setOpenMobile]);

  // Persistir estado de bloqueio no localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_LOCK_KEY, String(isLocked));
  }, [isLocked]);

  // Manter sidebar aberto quando bloqueado (apenas desktop)
  useEffect(() => {
    if (isMobile) return;
    if (isLocked && !open) {
      setOpen(true);
    }
  }, [isLocked, open, setOpen, isMobile]);

  // Handlers memoizados para evitar re-renderizações (apenas desktop)
  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    if (!isLocked) {
      setOpen(true);
    }
  }, [isLocked, setOpen, isMobile]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (!isLocked) {
      setOpen(false);
    }
  }, [isLocked, setOpen, isMobile]);

  const isItemHidden = (url: string) => {
    // Comissões de consórcio só existem no modo consórcio; organizações genéricas não mudam.
    if (url === '/comissoes' && !isConsorcio) return true;
    if ((url === '/lead-metrics' || url === '/painel') && !permissions.canViewTeamMetrics) return true;
    return isSectionVisible(url) === false;
  };

  const renderNavItem = (item: NavItem) => {
    if (item.consorcioOnly && !isConsorcio) return null;
    if (isItemHidden(item.url)) return null;
    const locked = isFeatureLocked(item.url);

    if (locked) {
      return (
        <SidebarMenuItem key={item.url}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                aria-disabled
                className={cn(itemBase, "cursor-not-allowed opacity-50 hover:bg-transparent")}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.title}</span>
                <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/50" />
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {item.title}: em breve
            </TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      );
    }

    const isTasksItem = item.url === '/tasks';
    const showTaskIndicator = isTasksItem && hasPendingTasks && !needsAudioPermission;
    const showWarningIndicator = isTasksItem && hasPendingTasks && needsAudioPermission;

    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild tooltip={isOpen ? undefined : item.title}>
          <NavLink to={demoAwareUrl(item.url)} end className={itemBase} activeClassName={itemActive}>
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/80")}
                  strokeWidth={isActive ? 2 : 1.75}
                />
                <span className="truncate">{item.title}</span>
                {showTaskIndicator && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-warning" aria-label="Há tarefas pendentes" />
                )}
                {showWarningIndicator && (
                  <AlertTriangle className="ml-auto h-3.5 w-3.5 text-warning" aria-label="Ative o som para os alertas de tarefa" />
                )}
              </>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Sidebar
        collapsible="icon"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="border-r border-sidebar-border"
      >
        <SidebarContent className="bg-sidebar overflow-y-auto gap-0">
          <div className={cn("flex h-14 items-center", isOpen ? "px-4" : "justify-center px-2")}>
            <img
              src={logoFull}
              alt="KairoZ"
              className={cn(
                "w-auto object-contain",
                isOpen ? "h-10 block" : "hidden",
                theme === "dark" ? "brightness-0 invert" : "logo-red-filter"
              )}
            />
            <img
              src={logoIcon}
              alt="KairoZ"
              className={cn(
                "w-auto object-contain",
                isOpen ? "hidden" : "h-7 block",
                theme === "dark" ? "brightness-0 invert" : "logo-red-filter"
              )}
            />
          </div>

          <div className={cn("pb-2", isOpen ? "px-3" : "px-2")}>
            <OrganizationSwitcher collapsed={!isOpen} />
          </div>

          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/60">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map(renderNavItem)}

                  {group.withAdmin && permissions.canAccessAdminSection && (
                    <Collapsible open={administrativoOpen} onOpenChange={setAdministrativoOpen} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className={itemBase} tooltip={isOpen ? undefined : "Administrativo"}>
                            <Building2 className="h-4 w-4 flex-shrink-0 text-sidebar-foreground/80" strokeWidth={1.75} />
                            <span>Administrativo</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {administrativoItems.map((subItem) => {
                              if (isSectionVisible(subItem.url) === false) return null;
                              return (
                                <SidebarMenuSubItem key={subItem.url}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={subItem.url}
                                      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/70"
                                      activeClassName={itemActive}
                                    >
                                      {({ isActive }) => (
                                        <>
                                          <subItem.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/80")} />
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
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          <SidebarGroup className="mt-auto py-2">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {footerItems.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-3 overflow-hidden">
          {isOpen ? (
            <div className="space-y-2">
              <MenuLockToggle locked={isLocked} onToggle={setIsLocked} />
              <div className="flex items-center gap-2 px-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-sidebar-foreground/70" title={user?.email ?? undefined}>
                    {user?.email}
                  </p>
                  {subscriptionData?.subscribed && subscriptionData.product_id && PLAN_NAMES[subscriptionData.product_id] && (
                    <p className="text-[11px] font-medium text-sidebar-foreground/60">
                      Plano {PLAN_NAMES[subscriptionData.product_id]}
                    </p>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={signOut} variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Sair">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Sair</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Button
                onClick={() => setIsLocked(!isLocked)}
                variant="ghost"
                size="icon"
                className={cn("h-8 w-full", isLocked && "bg-sidebar-accent")}
                aria-label={isLocked ? "Deixar o menu recolher" : "Manter o menu aberto"}
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
              <Button onClick={signOut} variant="ghost" size="icon" className="h-8 w-full" aria-label="Sair">
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
