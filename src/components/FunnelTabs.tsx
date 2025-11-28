import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Funnel {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
}

interface FunnelTabsProps {
  funnels: Funnel[];
  activeFunnelId: string | null;
  onFunnelChange: (funnelId: string) => void;
  onCreateFunnel: () => void;
  onEditFunnel: (funnelId: string) => void;
}

export const FunnelTabs = ({
  funnels,
  activeFunnelId,
  onFunnelChange,
  onCreateFunnel,
  onEditFunnel
}: FunnelTabsProps) => {
  return (
    <div className="flex items-center gap-3 pb-4 border-b">
      <Tabs value={activeFunnelId || ""} onValueChange={onFunnelChange} className="flex-1">
        <TabsList className="w-auto">
          {funnels.map((funnel) => (
            <TabsTrigger
              key={funnel.id}
              value={funnel.id}
              className="relative group"
            >
              {funnel.name}
              {funnel.is_default && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Padrão
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "ml-2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
                  activeFunnelId === funnel.id && "opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditFunnel(funnel.id);
                }}
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Button onClick={onCreateFunnel} variant="outline" size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Novo Funil
      </Button>
    </div>
  );
};