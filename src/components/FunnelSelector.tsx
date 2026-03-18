import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle, Loader2, X } from "lucide-react";
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
  sourceIdentifier?: string;
  organizationId?: string;
  disabled?: boolean;
  className?: string;
  onMappingChange?: () => void;    // Chamado quando um funil é selecionado
  onMappingRemoved?: () => void;   // Chamado quando o mapeamento é removido
}

// Valor especial para indicar "remover mapeamento"
const REMOVE_VALUE = "__REMOVE__";

export const FunnelSelector = ({
  sourceType,
  sourceIdentifier,
  organizationId,
  disabled,
  className,
  onMappingChange,
  onMappingRemoved,
}: FunnelSelectorProps) => {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");
  const [selectedFunnelName, setSelectedFunnelName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // org resolvida (prop ou lookup)
  const [resolvedOrgId, setResolvedOrgId] = useState<string | undefined>(organizationId);

  useEffect(() => {
    if (user) {
      loadFunnelsAndMapping();
    }
  }, [user, sourceType, sourceIdentifier, organizationId]);

  const loadFunnelsAndMapping = async () => {
    if (!user) return;

    try {
      setLoading(true);

      let targetOrgId = organizationId;

      // Se não recebemos organizationId explicitamente, buscar via organization_members
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

      setResolvedOrgId(targetOrgId);

      // Carregar funis da org primeiro
      const funnelsResult = await supabase
        .from("sales_funnels")
        .select("id, name, is_active, is_default")
        .eq("organization_id", targetOrgId)
        .order("name");

      const funnelsData = funnelsResult.data || [];

      if (funnelsResult.error) {
        console.error("Error fetching funnels:", funnelsResult.error);
      }

      setFunnels(funnelsData);

      // Buscar mapeamento APENAS entre os funis desta organização (evita capturar mapeamentos de outras orgs)
      const orgFunnelIds = funnelsData.map(f => f.id);
      let mappingData: any = null;

      if (orgFunnelIds.length > 0) {
        let q = supabase
          .from("funnel_source_mappings")
          .select("funnel_id, source_type, source_identifier, id")
          .eq("source_type", sourceType)
          .in("funnel_id", orgFunnelIds);
        if (sourceIdentifier) {
          q = q.eq("source_identifier", sourceIdentifier);
        } else {
          q = q.is("source_identifier", null);
        }
        const mappingResult = await q.limit(1).maybeSingle();
        mappingData = mappingResult.data;
      }

      // Aplicar mapeamento existente (já garantido que pertence à org)
      if (mappingData) {
        setSelectedFunnel(mappingData.funnel_id);
        const funnel = funnelsData.find(f => f.id === mappingData.funnel_id);
        if (funnel) setSelectedFunnelName(funnel.name);
      } else {
        setSelectedFunnel("");
        setSelectedFunnelName("");
      }
    } catch (error) {
      console.error("Error loading funnels:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFunnelChange = async (value: string) => {
    if (!user || updating) return;

    // --- REMOVER mapeamento ---
    if (value === REMOVE_VALUE) {
      await removeMappingForIdentifier();
      return;
    }

    const funnelId = value;

    try {
      setUpdating(true);

      // Resolver org se ainda não temos
      let targetOrgId = resolvedOrgId;
      if (!targetOrgId) {
        const { data: orgData } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        targetOrgId = orgData?.organization_id;
        if (targetOrgId) setResolvedOrgId(targetOrgId);
      }

      if (!targetOrgId) return;

      // Buscar primeira etapa do funil
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

      // Search ONLY within this org's funnels to avoid overwriting another org's mapping.
      // The unique constraint is now per-org (organization_id, source_type, source_identifier),
      // so each org can independently map the same form_id to their own funnel.
      const orgFunnelIdsForSave = funnels.map(f => f.id);
      let orgQuery = supabase
        .from("funnel_source_mappings")
        .select("id")
        .eq("source_type", sourceType)
        .in("funnel_id", orgFunnelIdsForSave);
      if (sourceIdentifier) {
        orgQuery = orgQuery.eq("source_identifier", sourceIdentifier);
      } else {
        orgQuery = orgQuery.is("source_identifier", null);
      }
      const { data: orgMapping } = await orgQuery.limit(1).maybeSingle();

      if (orgMapping) {
        // Update the existing mapping within this org
        const { error } = await supabase
          .from("funnel_source_mappings")
          .update({
            funnel_id: funnelId,
            target_stage_id: stageData.id,
            source_identifier: sourceIdentifier || null,
          })
          .eq("id", orgMapping.id);
        if (error) throw error;
      } else {
        // Insert new row — safe because constraint is now per-org
        const { error } = await supabase
          .from("funnel_source_mappings")
          .insert({
            organization_id: targetOrgId,
            funnel_id: funnelId,
            source_type: sourceType,
            source_identifier: sourceIdentifier || null,
            target_stage_id: stageData.id,
          });
        if (error) throw error;
      }

      setSelectedFunnel(funnelId);
      const funnel = funnels.find(f => f.id === funnelId);
      if (funnel) setSelectedFunnelName(funnel.name);

      toast.success("Direcionamento atualizado!");
      onMappingChange?.();
    } catch (error) {
      console.error("Error updating mapping:", error);
      toast.error("Erro ao atualizar direcionamento");
    } finally {
      setUpdating(false);
    }
  };

  const removeMappingForIdentifier = async () => {
    if (!user || updating) return;
    try {
      setUpdating(true);

      // Only delete mappings belonging to the current org's funnels to prevent cross-org deletion
      const orgFunnelIds = funnels.map(f => f.id);
      if (orgFunnelIds.length === 0) {
        setSelectedFunnel("");
        setSelectedFunnelName("");
        return;
      }

      let query = supabase
        .from("funnel_source_mappings")
        .delete()
        .eq("source_type", sourceType)
        .in("funnel_id", orgFunnelIds);

      if (sourceIdentifier) {
        query = query.eq("source_identifier", sourceIdentifier);
      } else {
        query = query.is("source_identifier", null);
      }

      const { error } = await query;
      if (error) throw error;

      setSelectedFunnel("");
      setSelectedFunnelName("");
      toast.success("Formulário desativado.");
      onMappingRemoved?.();
    } catch (error) {
      console.error("Error removing mapping:", error);
      toast.error("Erro ao desativar formulário");
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
        Nenhum funil encontrado. Crie um funil de vendas primeiro.
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
          {/* Opção para desativar (só aparece quando há um funil selecionado) */}
          {selectedFunnel && (
            <SelectItem value={REMOVE_VALUE} className="text-destructive focus:text-destructive">
              <span className="flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Desativar este formulário
              </span>
            </SelectItem>
          )}
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
