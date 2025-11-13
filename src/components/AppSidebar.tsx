import { LayoutDashboard, Kanban, CheckSquare, Users, Settings, LogOut, MessageSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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

  return (
    <Sidebar 
      collapsible="icon"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="border-r border-sidebar-border shadow-sm"
    >
      <SidebarContent className="bg-sidebar">
        <div className="p-6 pb-6">
          <h1 className={`font-bold text-sidebar-primary transition-all ${open ? "text-3xl" : "text-2xl text-center"}`}>
            {open ? "CRM" : "C"}
          </h1>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-base px-4">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-14">
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent text-sidebar-foreground text-lg px-6 py-4"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-7 w-7 flex-shrink-0" />
                      <span className="text-lg">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-6">
        {open ? (
          <div className="space-y-3">
            <p className="text-sm text-sidebar-foreground/60 truncate">
              {user?.email}
            </p>
            <Button
              onClick={signOut}
              variant="outline"
              className="w-full justify-start gap-3 bg-sidebar-accent hover:bg-sidebar-accent/80 h-12 text-base"
              size="lg"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </Button>
          </div>
        ) : (
          <Button
            onClick={signOut}
            variant="ghost"
            size="icon"
            className="w-full h-12"
          >
            <LogOut className="h-6 w-6" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
