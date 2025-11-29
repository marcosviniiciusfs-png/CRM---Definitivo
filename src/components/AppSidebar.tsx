import { LayoutDashboard, Kanban, CheckSquare, Users, Settings, LogOut, MessageSquare, Lock, Unlock, ChevronDown, Briefcase, UserCircle, Layers, Activity, BarChart3, Shuffle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MenuLockToggle } from "@/components/MenuLockToggle";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
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
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";

const PLAN_NAMES: { [key: string]: string } = {
  'prod_TVqqdFt1DYCcCI': 'Básico',
  'prod_TVqr72myTFqI39': 'Profissional',
  'prod_TVqrhrzuIdUDcS': 'Enterprise'
};

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Métricas", url: "/lead-metrics", icon: BarChart3 },
  { title: "Roleta de Leads", url: "/lead-distribution", icon: Shuffle },
  { title: "Chat", url: "/chat", icon: MessageSquare },
];

const administrativoItems = [
  { title: "Colaboradores", url: "/administrativo/colaboradores", icon: UserCircle },
  { title: "Produção", url: "/administrativo/producao", icon: Layers },
  { title: "Equipes", url: "/administrativo/equipes", icon: Users },
  { title: "Atividades", url: "/administrativo/atividades", icon: Activity },
];

const bottomItems = [
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { open, setOpen } = useSidebar();
  const { signOut, user, subscriptionData } = useAuth();
  const permissions = usePermissions();
  const [isLocked, setIsLocked] = useState(false);
  const [administrativoOpen, setAdministrativoOpen] = useState(false);

  const handleMouseEnter = () => {
    if (!isLocked) {
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isLocked) {
      setOpen(false);
    }
  };

  return (
    <Sidebar 
      collapsible="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="border-r border-sidebar-border shadow-sm"
    >
      <SidebarContent className="bg-sidebar">
        <div className="p-4 pb-4 flex items-center justify-center">
          {open ? (
            <img 
              src={logoFull} 
              alt="KairoZ" 
              className="h-10 w-auto object-contain transition-all"
            />
          ) : (
            <img 
              src={logoIcon} 
              alt="K" 
              className="h-8 w-auto object-contain transition-all"
            />
          )}
        </div>

        <SidebarGroup>
          {open && (
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-sm px-3">Menu</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                // Ocultar "Métricas" para membros
                if (item.url === '/lead-metrics' && !permissions.canViewTeamMetrics) {
                  return null;
                }
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-sidebar-accent text-sidebar-foreground text-base px-3 py-2.5"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              
              {permissions.canAccessAdminSection && (
                <Collapsible open={administrativoOpen} onOpenChange={setAdministrativoOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="hover:bg-sidebar-accent text-sidebar-foreground text-base px-3 py-2.5">
                        <Briefcase className="h-5 w-5 flex-shrink-0" />
                        <span>Administrativo</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {administrativoItems.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <NavLink
                                to={subItem.url}
                                className="hover:bg-sidebar-accent text-sidebar-foreground text-sm px-3 py-2"
                                activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                              >
                                <subItem.icon className="h-4 w-4 flex-shrink-0" />
                                <span>{subItem.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {bottomItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent text-sidebar-foreground text-base px-3 py-2.5"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-4">
        {open ? (
          <div className="space-y-3">
            <MenuLockToggle
              locked={isLocked}
              onToggle={setIsLocked}
            />
            {subscriptionData?.subscribed && subscriptionData.product_id && (
              <div className="flex items-center justify-center">
                <Badge variant="secondary" className="text-xs">
                  Plano {PLAN_NAMES[subscriptionData.product_id] || 'Pro'}
                </Badge>
              </div>
            )}
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user?.email}
            </p>
            <Button
              onClick={signOut}
              variant="outline"
              className="w-full justify-start gap-2 bg-sidebar-accent hover:bg-sidebar-accent/80 text-sm"
              size="sm"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={() => setIsLocked(!isLocked)}
              variant="ghost"
              size="icon"
              className={`w-full ${isLocked ? "bg-sidebar-accent" : ""}`}
            >
              {isLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={signOut}
              variant="ghost"
              size="icon"
              className="w-full"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
