import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Crown, Shield, User, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OrganizationMembership {
  organization_id: string;
  role: 'owner' | 'admin' | 'member';
  organizations: {
    id: string;
    name: string;
  };
}

interface OrganizationSelectorModalProps {
  open: boolean;
  organizations: OrganizationMembership[];
  onSelect: (organizationId: string) => void;
}

const roleConfig = {
  owner: { label: 'Proprietário', icon: Crown, color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  admin: { label: 'Administrador', icon: Shield, color: 'bg-secondary text-secondary-foreground border-border' },
  member: { label: 'Membro', icon: User, color: 'bg-muted text-muted-foreground border-border' },
};

export function OrganizationSelectorModal({ 
  open, 
  organizations, 
  onSelect 
}: OrganizationSelectorModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelect = async (orgId: string) => {
    setSelectedId(orgId);
    setIsLoading(true);
    
    // Pequeno delay para feedback visual
    await new Promise(resolve => setTimeout(resolve, 300));
    
    onSelect(orgId);
  };

  // Ordenar: owner primeiro, depois admin, depois member
  const sortedOrgs = [...organizations].sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 };
    return order[a.role] - order[b.role];
  });

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Selecione uma Organização
          </DialogTitle>
          <DialogDescription>
            Você faz parte de múltiplas organizações. Escolha qual deseja acessar:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {sortedOrgs.map((org) => {
            const roleInfo = roleConfig[org.role];
            const RoleIcon = roleInfo.icon;
            const isSelected = selectedId === org.organization_id;
            
            return (
              <Button
                key={org.organization_id}
                variant="outline"
                className={cn(
                  "w-full h-auto p-4 flex items-center justify-between transition-all",
                  "hover:border-primary/50 hover:bg-primary/5",
                  isSelected && "border-primary bg-primary/10",
                  isLoading && !isSelected && "opacity-50 pointer-events-none"
                )}
                onClick={() => handleSelect(org.organization_id)}
                disabled={isLoading}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    org.role === 'owner' ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Building2 className={cn(
                      "h-5 w-5",
                      org.role === 'owner' ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{org.organizations.name}</p>
                    <Badge 
                      variant="outline" 
                      className={cn("mt-1 text-xs", roleInfo.color)}
                    >
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {roleInfo.label}
                    </Badge>
                  </div>
                </div>
                
                {isSelected && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
