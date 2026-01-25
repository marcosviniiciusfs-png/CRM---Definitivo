import { useState } from "react";
import { Building2, ChevronDown, Crown, Shield, User, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { OrganizationMembership } from "@/contexts/OrganizationContext";

const roleConfig = {
  owner: { label: 'Proprietário', icon: Crown, color: 'text-primary' },
  admin: { label: 'Admin', icon: Shield, color: 'text-secondary-foreground' },
  member: { label: 'Membro', icon: User, color: 'text-muted-foreground' },
};

interface OrganizationSwitcherProps {
  collapsed?: boolean;
}

export function OrganizationSwitcher({ collapsed = false }: OrganizationSwitcherProps) {
  const { 
    organizationId, 
    availableOrganizations, 
    switchOrganization,
  } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(false);

  // Se só tem uma organização, não mostrar o switcher
  if (!availableOrganizations || availableOrganizations.length <= 1) {
    return null;
  }

  const currentOrg = availableOrganizations.find(
    org => org.organization_id === organizationId
  );

  const handleSwitch = async (orgId: string) => {
    if (orgId === organizationId) return;
    
    setIsLoading(true);
    
    try {
      // Trocar org (agora inclui refresh de subscription internamente)
      await switchOrganization(orgId);
      
      // Reload para atualizar todos os dados
      window.location.reload();
    } catch (error) {
      console.error('[ORG-SWITCH] Error switching organization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghostIcon"
            size="icon"
            className="w-full"
            disabled={isLoading}
          >
            <Building2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56 bg-popover">
          <DropdownMenuLabel>Trocar Organização</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableOrganizations.map((org) => {
            const roleInfo = roleConfig[org.role];
            const RoleIcon = roleInfo.icon;
            const isActive = org.organization_id === organizationId;
            
            return (
              <DropdownMenuItem
                key={org.organization_id}
                onClick={() => handleSwitch(org.organization_id)}
                className={cn("cursor-pointer", isActive && "bg-accent")}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="truncate max-w-[120px]">
                      {org.organizations?.name || 'Organização'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={cn("h-3 w-3", roleInfo.color)} />
                    {isActive && <Check className="h-3 w-3 text-primary" />}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2 bg-sidebar-accent/50 border-sidebar-border text-sm h-auto py-2"
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {currentOrg?.organizations?.name || 'Organização'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-popover" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Trocar Organização
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableOrganizations.map((org) => {
          const roleInfo = roleConfig[org.role];
          const RoleIcon = roleInfo.icon;
          const isActive = org.organization_id === organizationId;
          
          return (
            <DropdownMenuItem
              key={org.organization_id}
              onClick={() => handleSwitch(org.organization_id)}
              className={cn(
                "cursor-pointer flex items-center justify-between",
                isActive && "bg-accent"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {org.organizations?.name || 'Organização'}
                  </p>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={cn("h-3 w-3", roleInfo.color)} />
                    <span className="text-xs text-muted-foreground">
                      {roleInfo.label}
                    </span>
                  </div>
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
