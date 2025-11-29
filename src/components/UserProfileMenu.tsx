import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { User, Settings, CreditCard, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

const PLAN_NAMES: { [key: string]: string } = {
  'prod_TVqqdFt1DYCcCI': 'Básico',
  'prod_TVqr72myTFqI39': 'Profissional',
  'prod_TVqrhrzuIdUDcS': 'Enterprise'
};

export function UserProfileMenu() {
  const { user, signOut, subscriptionData } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{
    avatar_url: string | null;
    full_name: string | null;
  } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;

      // Verificar cache primeiro
      const cacheKey = `profile_${user.id}`;
      const cached = sessionStorage.getItem(cacheKey);
      
      if (cached) {
        setProfile(JSON.parse(cached));
        return;
      }

      // Se não houver cache, buscar do banco
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setProfile(data);
        // Armazenar no cache
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      }
    };

    loadProfile();
  }, [user?.id]);

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = async () => {
    // Limpar cache do perfil ao fazer logout
    if (user?.id) {
      sessionStorage.removeItem(`profile_${user.id}`);
    }
    await signOut();
    navigate("/auth");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 hover:ring-2 hover:ring-border transition-all">
          <Avatar className="h-8 w-8 cursor-pointer">
            <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "User"} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium leading-none">{profile?.full_name || "Usuário"}</p>
              {subscriptionData?.subscribed && subscriptionData.product_id && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {PLAN_NAMES[subscriptionData.product_id] || 'Pro'}
                </Badge>
              )}
            </div>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          <span>Perfil</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>Configurações</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/pricing")}
          className="cursor-pointer"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Preços</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
