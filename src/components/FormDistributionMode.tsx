import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FunnelSelector } from "@/components/FunnelSelector";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Tabelas novas (form_funnel_rotations) ainda não estão em types.ts; o acesso fica tipado como any.
const db = supabase as any;
const SOURCE_TYPE = "facebook";

interface FunnelOption {
  id: string;
  name: string;
}

interface FormDistributionModeProps {
  formId: string;
  organizationId?: string;
  onMappingChange?: () => void;
  onMappingRemoved?: () => void;
}

/**
 * Distribuição de leads de um formulário do Facebook:
 * - "Funil fixo": um funil para o formulário (FunnelSelector).
 * - "Rodízio entre funis": cada lead novo vai para o próximo funil da lista, em sequência.
 */
export function FormDistributionMode({ formId, organizationId, onMappingChange, onMappingRemoved }: FormDistributionModeProps) {
  const [mode, setMode] = useState<"fixed" | "rotation">("fixed");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [funnels, setFunnels] = useState<FunnelOption[]>([]);
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (organizationId) void load();
  }, [organizationId, formId]);

  const load = async () => {
    setLoading(true);
    try {
      const [funnelsResult, rotationResult] = await Promise.all([
        db.from("sales_funnels").select("id, name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
        db.from("form_funnel_rotations")
          .select("funnel_id, position")
          .eq("organization_id", organizationId)
          .eq("source_type", SOURCE_TYPE)
          .eq("source_identifier", formId)
          .order("position"),
      ]);
      if (funnelsResult.error || rotationResult.error) throw funnelsResult.error || rotationResult.error;
      const ids: string[] = (rotationResult.data || []).map((row: { funnel_id: string }) => row.funnel_id);
      setFunnels(funnelsResult.data || []);
      setOrder(ids);
      setMode(ids.length > 0 ? "rotation" : "fixed");
    } catch (err) {
      console.error("[FormDistributionMode] load", err);
      toast.error("Não foi possível carregar os funis. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const chooseFixed = async () => {
    if (mode === "fixed") return;
    if (order.length > 0) {
      const confirmed = window.confirm(
        "Voltar para funil fixo? O rodízio salvo deste formulário será desativado. Os leads já recebidos continuam nos funis.",
      );
      if (!confirmed) return;
      const { error } = await db.from("form_funnel_rotations")
        .delete()
        .eq("organization_id", organizationId)
        .eq("source_type", SOURCE_TYPE)
        .eq("source_identifier", formId);
      if (error) {
        toast.error("Não foi possível desativar o rodízio. Tente novamente.");
        return;
      }
      setOrder([]);
      toast.success("Rodízio desativado.");
    }
    setMode("fixed");
    onMappingChange?.();
  };

  const toggleFunnel = (funnelId: string) => {
    setOrder((current) => (current.includes(funnelId) ? current.filter((id) => id !== funnelId) : [...current, funnelId]));
  };

  const moveFunnel = (funnelId: string, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(funnelId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveRotation = async () => {
    if (order.length < 2 || saving || !organizationId) return;
    setSaving(true);
    try {
      // Primeira etapa de cada funil da sequência.
      const { data: stages, error: stagesError } = await db.from("funnel_stages")
        .select("id, funnel_id, position")
        .in("funnel_id", order)
        .order("position");
      if (stagesError) throw stagesError;

      const firstStageByFunnel = new Map<string, string>();
      for (const stage of stages || []) {
        if (!firstStageByFunnel.has(stage.funnel_id)) firstStageByFunnel.set(stage.funnel_id, stage.id);
      }
      const semEtapas = order.find((id) => !firstStageByFunnel.has(id));
      if (semEtapas) {
        const nome = funnels.find((f) => f.id === semEtapas)?.name ?? "selecionado";
        toast.error(`O funil ${nome} não tem etapas. Configure as etapas antes de incluí-lo no rodízio.`);
        return;
      }

      // Substitui a lista de funis do rodízio.
      const { error: deleteError } = await db.from("form_funnel_rotations")
        .delete()
        .eq("organization_id", organizationId)
        .eq("source_type", SOURCE_TYPE)
        .eq("source_identifier", formId);
      if (deleteError) throw deleteError;

      const rows = order.map((funnelId, index) => ({
        organization_id: organizationId,
        source_type: SOURCE_TYPE,
        source_identifier: formId,
        funnel_id: funnelId,
        target_stage_id: firstStageByFunnel.get(funnelId),
        position: index,
      }));
      const { error: insertError } = await db.from("form_funnel_rotations").insert(rows);
      if (insertError) throw insertError;

      // Mantém o mapeamento do formulário apontando para o primeiro funil, para aparecer como configurado.
      const firstFunnel = order[0];
      const { data: existingMapping, error: mappingError } = await db.from("funnel_source_mappings")
        .select("id")
        .eq("source_type", SOURCE_TYPE)
        .eq("source_identifier", formId)
        .in("funnel_id", funnels.map((f) => f.id))
        .limit(1)
        .maybeSingle();
      if (mappingError) throw mappingError;
      const mappingPayload = { funnel_id: firstFunnel, target_stage_id: firstStageByFunnel.get(firstFunnel) };
      const mappingResult = existingMapping
        ? await db.from("funnel_source_mappings").update(mappingPayload).eq("id", existingMapping.id)
        : await db.from("funnel_source_mappings").insert({
            ...mappingPayload,
            organization_id: organizationId,
            source_type: SOURCE_TYPE,
            source_identifier: formId,
          });
      if (mappingResult.error) throw mappingResult.error;

      toast.success("Rodízio salvo.");
      onMappingChange?.();
    } catch (err) {
      console.error("[FormDistributionMode] save", err);
      toast.error("Não foi possível salvar o rodízio. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Carregando funis...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Modo de distribuição">
        <button
          type="button"
          onClick={chooseFixed}
          className={cn("rounded px-2.5 py-1 font-medium transition-colors", mode === "fixed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          aria-pressed={mode === "fixed"}
        >
          Funil fixo
        </button>
        <button
          type="button"
          onClick={() => setMode("rotation")}
          className={cn("rounded px-2.5 py-1 font-medium transition-colors", mode === "rotation" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          aria-pressed={mode === "rotation"}
        >
          Rodízio entre funis
        </button>
      </div>

      {mode === "fixed" ? (
        <FunnelSelector
          sourceType="facebook"
          sourceIdentifier={formId}
          organizationId={organizationId}
          className="mt-0 bg-transparent border-none p-0"
          onMappingChange={onMappingChange}
          onMappingRemoved={onMappingRemoved}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Cada lead novo vai para o próximo funil da lista, em sequência. Dentro de cada funil, a roleta de colaboradores continua valendo.
          </p>

          {funnels.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum funil ativo ainda. Crie um funil antes de montar o rodízio.</p>
          ) : (
            <ul className="space-y-1.5">
              {funnels.map((funnel) => {
                const index = order.indexOf(funnel.id);
                const selected = index >= 0;
                return (
                  <li key={funnel.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleFunnel(funnel.id)}
                      aria-label={`Incluir ${funnel.name} no rodízio`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{funnel.name}</span>
                    {selected && <span className="text-xs tabular-nums text-muted-foreground">{index + 1}º</span>}
                    {selected && (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveFunnel(funnel.id, -1)} disabled={index === 0} aria-label={`Subir ${funnel.name}`}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveFunnel(funnel.id, 1)} disabled={index === order.length - 1} aria-label={`Descer ${funnel.name}`}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={saveRotation} disabled={saving || order.length < 2}>
              {saving ? "Salvando..." : "Salvar rodízio"}
            </Button>
            {order.length < 2 && <span className="text-xs text-muted-foreground">Selecione pelo menos 2 funis.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
