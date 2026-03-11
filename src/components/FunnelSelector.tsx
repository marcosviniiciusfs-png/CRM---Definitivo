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
  sourceIdentifier?: string; // Add this to handle specific forms/IDs
  organizationId?: string; // Explicit organization ID
  disabled?: boolean;
  className?: string;
  onMappingChange?: () => void; // Callback when a funnel mapping is created/updated
}

export const FunnelSelector = ({ sourceType, sourceIdentifier, organizationId, disabled, className, onMappingChange }: FunnelSelectorProps) => {
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

      let targetOrgId = organizationId;

      // If no explicit organizationId, try to find it
      if (!targetOrgId) {
        const { data: orgData } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        targetOrgId = orgData?.organization_id;
      }

      if (!targetOrgId) {
        console.warn("⚠️ [FunnelSelector] No organization found for user");
        setLoading(false);
        return;
      }

      console.log(`🎯 [FunnelSelector] Loading funnels for org: ${targetOrgId}`);

      // Load all funnels for this organization
      const { data: funnelsData, error: funnelsError } = await supabase
        .from("sales_funnels")
        .select("id, name, is_active, is_default")
        .eq("organization_id", targetOrgId)
        .order("name");

      if (funnelsError) {
        console.error("Error fetching funnels:", funnelsError);
      }
      console.log(`📊 [FunnelSelector] Funnels found:`, funnelsData?.length || 0);

      if (funnelsData && funnelsData.length > 0) {
        // Show all funnels regardless of active status to avoid hiding default pipelines
        setFunnels(funnelsData);
      } else {
        setFunnels([]);
      }

      // Load existing mapping for this source type and specific identifier
      let query = supabase
        .from("funnel_source_mappings")
        .select("funnel_id, source_type, source_identifier")
        .eq("source_type", sourceType)
        .in("funnel_id", funnelsData?.map(f => f.id) || []);

      if (sourceIdentifier) {
        query = query.eq("source_identifier", sourceIdentifier);
      } else {
        query = query.is("source_identifier", null);
      }

      const { data: mappingsData } = await query;

      if (mappingsData && mappingsData.length > 0) {
        const currentMapping = mappingsData[0];
        setSelectedFunnel(currentMapping.funnel_id);
        const funnel = funnelsData?.find(f => f.id === currentMapping.funnel_id);
        if (funnel) {
          setSelectedFunnelName(funnel.name);
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
        .limit(1)
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

      // Check if mapping already exists for this source type and identifier
      let query = supabase
        .from("funnel_source_mappings")
        .select("id")
        .eq("source_type", sourceType)
        .in("funnel_id", funnels.map(f => f.id));

      if (sourceIdentifier) {
        query = query.eq("source_identifier", sourceIdentifier);
      } else {
        query = query.is("source_identifier", null);
      }

      const { data: specificMapping } = await query.limit(1).maybeSingle();

      if (specificMapping) {
        // Update existing mapping
        const { error } = await supabase
          .from("funnel_source_mappings")
          .update({
            funnel_id: funnelId,
            target_stage_id: stageData.id,
            source_identifier: sourceIdentifier || null
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
            source_identifier: sourceIdentifier || null,
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
      onMappingChange?.();
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
    return (
      <div className="p-3 text-sm text-amber-500 border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 rounded mt-3">
        Nenhum funil ativo encontrado. Crie um funil de vendas primeiro para poder direcionar os leads.
      </div>
    );
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
