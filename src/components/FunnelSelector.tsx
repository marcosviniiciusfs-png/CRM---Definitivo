import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Funnel {
  id: string;
  name: string;
  is_active: boolean;
}

interface FunnelSelectorProps {
  sourceType: 'whatsapp' | 'facebook' | 'webhook';
  disabled?: boolean;
  className?: string;
}

export const FunnelSelector = ({ sourceType, disabled, className }: FunnelSelectorProps) => {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");
  const [selectedFunnelName, setSelectedFunnelName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user) {
      loadFunnelsAndMapping();
    }
  }, [user, sourceType]);

  const loadFunnelsAndMapping = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get organization
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!orgData) return;

      // Load funnels
      const { data: funnelsData } = await supabase
        .from("sales_funnels")
        .select("id, name, is_active")
        .eq("organization_id", orgData.organization_id)
        .eq("is_active", true)
        .order("name");

      if (funnelsData) {
        setFunnels(funnelsData);
      }

      // Load existing mapping for this source type
      const { data: mappingsData } = await supabase
        .from("funnel_source_mappings")
        .select("funnel_id, source_type")
        .in("funnel_id", funnelsData?.map(f => f.id) || []);

      if (mappingsData) {
        const currentMapping = mappingsData.find(m => m.source_type === sourceType);
        if (currentMapping) {
          setSelectedFunnel(currentMapping.funnel_id);
          const funnel = funnelsData?.find(f => f.id === currentMapping.funnel_id);
          if (funnel) {
            setSelectedFunnelName(funnel.name);
          }
        }
      }
    } catch (error) {
      console.error("Error loading funnels:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFunnelChange = async (funnelId: string) => {
    if (!user || updating) return;

    try {
      setUpdating(true);

      // Get organization
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!orgData) return;

      // Get first stage of selected funnel
      const { data: stageData } = await supabase
        .from("funnel_stages")
        .select("id")
        .eq("funnel_id", funnelId)
        .order("position")
        .limit(1)
        .maybeSingle();

      if (!stageData) {
        toast.error("Funil sem etapas configuradas");
        return;
      }

      // Check if mapping already exists for this source type
      const { data: existingMappings } = await supabase
        .from("funnel_source_mappings")
        .select("id, funnel_id")
        .in("funnel_id", funnels.map(f => f.id));

      const existingMapping = existingMappings?.find(m => {
        // We need to check by source_type, but the query above doesn't include it
        // Let's do a more specific query
        return false;
      });

      // More specific check for existing mapping
      const { data: specificMapping } = await supabase
        .from("funnel_source_mappings")
        .select("id")
        .eq("source_type", sourceType)
        .in("funnel_id", funnels.map(f => f.id))
        .maybeSingle();

      if (specificMapping) {
        // Update existing mapping
        const { error } = await supabase
          .from("funnel_source_mappings")
          .update({
            funnel_id: funnelId,
            target_stage_id: stageData.id,
          })
          .eq("id", specificMapping.id);

        if (error) throw error;
      } else {
        // Create new mapping
        const { error } = await supabase
          .from("funnel_source_mappings")
          .insert({
            funnel_id: funnelId,
            source_type: sourceType,
            target_stage_id: stageData.id,
          });

        if (error) throw error;
      }

      // Update local state
      setSelectedFunnel(funnelId);
      const funnel = funnels.find(f => f.id === funnelId);
      if (funnel) {
        setSelectedFunnelName(funnel.name);
      }

      toast.success("Direcionamento atualizado!");
    } catch (error) {
      console.error("Error updating mapping:", error);
      toast.error("Erro ao atualizar direcionamento");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(
        "bg-muted/30 border border-border/50 rounded-lg p-3 mt-3",
        className
      )}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando funis...
        </div>
      </div>
    );
  }

  if (funnels.length === 0) {
    return null; // No funnels configured, don't show selector
  }

  return (
    <div 
      className={cn(
        "bg-muted/30 border border-border/50 rounded-lg p-3 mt-3 transition-opacity duration-200",
        updating && "opacity-60",
        className
      )}
    >
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <ArrowRight className="h-3 w-3" />
        Direcionar leads para:
      </label>
      <Select
        value={selectedFunnel}
        onValueChange={handleFunnelChange}
        disabled={disabled || updating}
      >
        <SelectTrigger className="h-9 text-sm bg-background">
          <SelectValue placeholder="Selecione o funil de destino" />
        </SelectTrigger>
        <SelectContent>
          {funnels.map((funnel) => (
            <SelectItem key={funnel.id} value={funnel.id}>
              {funnel.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedFunnel && (
        <p className="flex items-center gap-1 text-[11px] text-success mt-2">
          <CheckCircle className="h-3 w-3" />
          Leads adicionados à primeira etapa
        </p>
      )}
    </div>
  );
};
