import { CheckSquare, Filter, Home, Menu, MessageCircle, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { demoAwareUrl } from "@/lib/demoMode";

const ITEMS: Array<{ title: string; url: string; icon: LucideIcon }> = [
  { title: "Início", url: "/dashboard", icon: Home },
  { title: "Funil", url: "/pipeline", icon: Filter },
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
];

const itemClass =
  "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors";

/**
 * Navegação inferior do celular (DESIGN.md): quatro destinos e "Menu", que
 * abre o menu lateral completo. Substitui o botão que ficava sobre o título.
 */
export function MobileBottomNav() {
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.url}
          to={demoAwareUrl(item.url)}
          className={({ isActive }) => cn(itemClass, isActive && "font-semibold text-foreground")}
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn("h-5 w-5", isActive && "text-primary")}
                strokeWidth={isActive ? 2 : 1.75}
                aria-hidden="true"
              />
              {item.title}
            </>
          )}
        </NavLink>
      ))}
      <button type="button" className={itemClass} onClick={() => setOpenMobile(true)}>
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Menu
      </button>
    </nav>
  );
}
