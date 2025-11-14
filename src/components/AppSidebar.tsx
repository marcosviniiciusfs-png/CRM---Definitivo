import { LayoutDashboard, Kanban, CheckSquare, Users, Settings, LogOut, MessageSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CustomToggleSwitch } from "@/components/CustomToggleSwitch";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { open, setOpen } = useSidebar();
  const { signOut, user } = useAuth();
  const [isOnline, setIsOnline] = useState(false);

  return (
    <Sidebar 
      collapsible="icon"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
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
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-sm px-3">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
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
            <div className="flex items-center justify-center py-3" style={{ minHeight: '45px' }}>
              <CustomToggleSwitch 
                checked={isOnline}
                onChange={setIsOnline}
              />
            </div>
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
            <div className="flex justify-center py-2">
              <CustomToggleSwitch 
                checked={isOnline}
                onChange={setIsOnline}
              />
            </div>
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
