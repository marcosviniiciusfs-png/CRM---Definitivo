import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import { useState } from "react";
import { Clock, Target, RefreshCw, Plus, Trash2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ──────────────────────────────────────────────────────

interface SystemRules {
  reroute_same_agent: boolean;
  work_hours_enabled: boolean;
  work_hours_start: string;
  work_hours_end: string;
  hot_lead_enabled: boolean;
  hot_lead_score: number;
  auto_redistribute_timeout: number;
}

interface CustomRule {
  id: string;
  name: string;
  condition_field: "source" | "score_min" | "score_max" | "funnel";
  condition_operator: "equals" | "not_equals" | "greater" | "less";
  condition_value: string;
  action: "assign_to" | "skip";
  agent_id: string;
  enabled: boolean;
}

interface SmartRulesData {
  system: SystemRules;
  custom: CustomRule[];
}

const DEFAULT_SYSTEM: SystemRules = {
  reroute_same_agent: false,
  work_hours_enabled: false,
  work_hours_start: "08:00",
  work_hours_end: "18:00",
  hot_lead_enabled: false,
  hot_lead_score: 70,
  auto_redistribute_timeout: 60,
};

const TIMEOUT_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 240, label: "4h" },
  { value: 480, label: "8h" },
];

const CONDITION_FIELDS = [
  { value: "source", label: "Origem do lead" },
  { value: "score_min", label: "Score minimo" },
  { value: "score_max", label: "Score maximo" },
  { value: "funnel", label: "Funil" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "igual a" },
  { value: "not_equals", label: "diferente de" },
  { value: "greater", label: "maior que" },
  { value: "less", label: "menor que" },
];

const ACTIONS = [
  { value: "assign_to", label: "Atribuir para" },
  { value: "skip", label: "Ignorar (nao distribuir)" },
];

// ── Rule Tooltip ──────────────────────────────────────────────

function RuleTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Toggle Switch ──────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function SmartRulesPanel() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: ["smart-rules", organizationId],
    queryFn: async (): Promise<SmartRulesData> => {
      if (!organizationId) return { system: DEFAULT_SYSTEM, custom: [] };
      const { data } = await supabase
        .from("lead_distribution_configs")
        .select("smart_rules")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle();

      if (!data?.smart_rules || (typeof data.smart_rules === "object" && !("system" in (data.smart_rules as object)))) {
        return { system: DEFAULT_SYSTEM, custom: [] };
      }
      const parsed = typeof data.smart_rules === "string" ? JSON.parse(data.smart_rules) : data.smart_rules;
      return {
        system: { ...DEFAULT_SYSTEM, ...(parsed.system || {}) },
        custom: parsed.custom || [],
      };
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const current = rules || { system: DEFAULT_SYSTEM, custom: [] };

  const saveMutation = useMutation({
    mutationFn: async (updated: SmartRulesData) => {
      if (!organizationId) return;
      const { data: configs } = await supabase
        .from("lead_distribution_configs")
        .select("id")
        .eq("organization_id", organizationId);
      if (!configs?.length) {
        toast.error("Crie pelo menos uma roleta antes de configurar regras");
        return;
      }
      // Update all configs with the same smart_rules + sync timeout/auto_redistribute
      for (const config of configs) {
        await supabase
          .from("lead_distribution_configs")
          .update({
            smart_rules: updated as any,
            redistribution_timeout_minutes: updated.system.auto_redistribute_timeout,
            auto_redistribute: true,
          })
          .eq("id", config.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-rules"] });
      toast.success("Regras salvas com sucesso");
    },
    onError: () => toast.error("Erro ao salvar regras"),
  });

  const updateSystemRule = (key: keyof SystemRules, value: boolean | number | string) => {
    const updated: SmartRulesData = {
      system: { ...current.system, [key]: value },
      custom: current.custom,
    };
    saveMutation.mutate(updated);
  };

  const addCustomRule = () => {
    const newRule: CustomRule = {
      id: crypto.randomUUID(),
      name: `Regra ${current.custom.length + 1}`,
      condition_field: "source",
      condition_operator: "equals",
      condition_value: "",
      action: "assign_to",
      agent_id: "",
      enabled: true,
    };
    const updated: SmartRulesData = {
      system: current.system,
      custom: [...current.custom, newRule],
    };
    saveMutation.mutate(updated);
  };

  const updateCustomRule = (id: string, changes: Partial<CustomRule>) => {
    const updated: SmartRulesData = {
      system: current.system,
      custom: current.custom.map(r => (r.id === id ? { ...r, ...changes } : r)),
    };
    saveMutation.mutate(updated);
  };

  const removeCustomRule = (id: string) => {
    const updated: SmartRulesData = {
      system: current.system,
      custom: current.custom.filter(r => r.id !== id),
    };
    saveMutation.mutate(updated);
  };

  // Fetch agents for custom rules
  const { data: agents = [] } = useQuery({
    queryKey: ["smart-rules-agents", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: settings } = await supabase
        .from("agent_distribution_settings")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      if (!settings?.length) return [];
      const ids = settings.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return (profiles || []).map((p: any) => ({ user_id: p.user_id, full_name: p.full_name }));
    },
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground text-center py-8">Carregando regras...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Regras inteligentes de distribuicao</h3>
      <p className="text-xs text-muted-foreground">
        Configure regras avancadas para otimizar a distribuicao de leads automaticamente.
      </p>

      {/* ── System Rules ────────────────────────────── */}
      <div className="space-y-3">
        {/* Rule 1: Reroute same agent */}
        <div className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/10 shrink-0">
              <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">Reagendamento para mesmo agente</p>
                <RuleTooltip text="Se um lead ja foi atendido por um agente antes, ele sera automaticamente devolvido para esse mesmo agente. Exemplo: o lead 'Joao' conversou com a 'Maria' no passado — ao entrar na roleta novamente, vai direto para a Maria, independente do metodo de distribuicao." />
              </div>
              <p className="text-[11px] text-muted-foreground">Se o lead ja teve contato com um agente, rotear para o mesmo</p>
            </div>
          </div>
          <Toggle checked={current.system.reroute_same_agent} onChange={() => updateSystemRule("reroute_same_agent", !current.system.reroute_same_agent)} />
        </div>

        {/* Rule 2: Work hours */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/10 shrink-0">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium">Horario de trabalho</p>
                  <RuleTooltip text="Define um horario limite para distribuicao. Leads que chegam fora desse horario nao sao distribuidos e ficam aguardando ate o proximo horario util. Exemplo: com horario 08:00-18:00, um lead que chega as 22h so sera distribuido no dia seguinte." />
                </div>
                <p className="text-[11px] text-muted-foreground">Leads fora do horario ficam em fila para o proximo dia util</p>
              </div>
            </div>
            <Toggle checked={current.system.work_hours_enabled} onChange={() => updateSystemRule("work_hours_enabled", !current.system.work_hours_enabled)} />
          </div>
          {current.system.work_hours_enabled && (
            <div className="flex items-center gap-2 ml-11">
              <input
                type="time"
                value={current.system.work_hours_start}
                onChange={e => updateSystemRule("work_hours_start", e.target.value)}
                className="bg-background border rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-xs text-muted-foreground">ate</span>
              <input
                type="time"
                value={current.system.work_hours_end}
                onChange={e => updateSystemRule("work_hours_end", e.target.value)}
                className="bg-background border rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>

        {/* Rule 3: Auto redistribution timeout */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/10 shrink-0">
              <RefreshCw className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">Redistribuicao automatica</p>
                <RuleTooltip text="Se um agente receber um lead e nao fizer nenhuma interacao dentro do prazo definido, o lead e automaticamente redistribuido para outro agente disponivel. Exemplo: com prazo de 1h, se o agente 'Carlos' nao contatar o lead em 1 hora, o lead volta para a roleta e vai para outro agente." />
              </div>
              <p className="text-[11px] text-muted-foreground">Redistribui se o agente nao interagir dentro do prazo</p>
            </div>
          </div>
          <div className="flex gap-2 ml-11">
            {TIMEOUT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateSystemRule("auto_redistribute_timeout", opt.value)}
                className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${
                  current.system.auto_redistribute_timeout === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custom Rules ────────────────────────────── */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold">Regras personalizadas</h4>
              <RuleTooltip text="Crie condicoes personalizadas para rotear leads automaticamente. Exemplo: 'Se origem for igual a facebook, atribuir para a Maria' ou 'Se score minimo for maior que 80, nao distribuir'. As regras sao avaliadas na ordem e a primeira que bater e executada." />
            </div>
            <p className="text-[11px] text-muted-foreground">Crie regras condicionais para rotear leads automaticamente</p>
          </div>
          <Button variant="outline" size="sm" onClick={addCustomRule} className="gap-1 text-xs">
            <Plus className="h-3 w-3" /> Nova regra
          </Button>
        </div>

        {current.custom.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
            <p className="text-xs text-muted-foreground">Nenhuma regra personalizada criada</p>
            <p className="text-[11px] text-muted-foreground mt-1">Clique em "Nova regra" para criar uma condicao personalizada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {current.custom.map(rule => (
              <CustomRuleCard
                key={rule.id}
                rule={rule}
                agents={agents}
                onChange={changes => updateCustomRule(rule.id, changes)}
                onRemove={() => removeCustomRule(rule.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom Rule Card ───────────────────────────────────────────

function CustomRuleCard({
  rule,
  agents,
  onChange,
  onRemove,
}: {
  rule: CustomRule;
  agents: { user_id: string; full_name: string }[];
  onChange: (changes: Partial<CustomRule>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-xl border bg-card transition-opacity ${!rule.enabled ? "opacity-50" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Toggle checked={rule.enabled} onChange={() => onChange({ enabled: !rule.enabled })} />
          <input
            type="text"
            value={rule.name}
            onChange={e => onChange({ name: e.target.value })}
            className="text-sm font-medium bg-transparent border-none outline-none flex-1 min-w-0"
            placeholder="Nome da regra"
          />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-accent transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <button onClick={onRemove} className="p-1 rounded hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Condicao</p>
          <div className="grid grid-cols-3 gap-2">
            <Select value={rule.condition_field} onValueChange={v => onChange({ condition_field: v as CustomRule["condition_field"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={rule.condition_operator} onValueChange={v => onChange({ condition_operator: v as CustomRule["condition_operator"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={rule.condition_value}
              onChange={e => onChange({ condition_value: e.target.value })}
              className="h-8 text-xs"
              placeholder="Valor"
            />
          </div>

          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Acao</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={rule.action} onValueChange={v => onChange({ action: v as CustomRule["action"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {rule.action === "assign_to" && (
              <Select value={rule.agent_id} onValueChange={v => onChange({ agent_id: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione agente" /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.user_id} value={a.user_id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {rule.action === "skip" && (
              <div className="h-8 flex items-center px-3 text-xs text-muted-foreground rounded-md border bg-muted/30">
                Lead nao sera distribuido
              </div>
            )}
          </div>

          {/* Summary */}
          <p className="text-[11px] text-muted-foreground">
            Se <span className="font-medium text-foreground">{CONDITION_FIELDS.find(f => f.value === rule.condition_field)?.label}</span>{" "}
            <span className="font-medium text-foreground">{CONDITION_OPERATORS.find(o => o.value === rule.condition_operator)?.label}</span>{" "}
            <span className="font-medium text-foreground">"{rule.condition_value || "..."}"</span>{" "}
            &rarr;{" "}
            <span className="font-medium text-foreground">
              {rule.action === "assign_to"
                ? agents.find(a => a.user_id === rule.agent_id)?.full_name || "selecionar agente"
                : "nao distribuir"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
