import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Shuffle, Scale, Dices, Zap, ChartPie } from "lucide-react";

interface CreateRouletteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConfig?: any | null;
}

const METHODS = [
  { value: "round_robin", label: "Rodizio", icon: Shuffle, desc: "Distribui sequencialmente entre agentes ativos" },
  { value: "weighted", label: "Por porcentagem", icon: ChartPie, desc: "Define quanto cada agente deve receber" },
  { value: "load_based", label: "Por Carga", icon: Scale, desc: "Envia para quem tem menos leads atribuidos" },
  { value: "random", label: "Aleatorio", icon: Dices, desc: "Escolhe agente aleatoriamente" },
  { value: "conversion_priority", label: "Smart AI", icon: Zap, desc: "Prioriza agentes com melhor taxa de conversao" },
];

export function CreateRouletteModal({ open, onOpenChange, editConfig }: CreateRouletteModalProps) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    description: "",
    source_type: "all",
    funnel_id: "",
    distribution_method: "round_robin",
    eligible_agents: [] as string[],
    distribution_weights: {} as Record<string, number>,
    is_active: true,
  });

  const { data: funnels } = useQuery({
    queryKey: ["create-roulette-funnels", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase.from("sales_funnels").select("id, name").eq("organization_id", organizationId).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rawMembers } = useOrganizationMembers(organizationId);
  const members = rawMembers?.filter(m => m.user_id).map(m => ({
    user_id: m.user_id!,
    full_name: m.full_name || (m as any).display_name || m.email || "Sem nome",
  })) || [];

  // Load edit data
  useEffect(() => {
    if (editConfig && open) {
      setForm({
        name: editConfig.name || "",
        description: editConfig.description || "",
        source_type: editConfig.source_type || "all",
        funnel_id: editConfig.funnel_id || "",
        distribution_method: editConfig.distribution_method || "round_robin",
        eligible_agents: editConfig.eligible_agents || [],
        distribution_weights: Object.keys(editConfig.distribution_weights || {}).length > 0
          ? editConfig.distribution_weights
          : distributeEqually(editConfig.eligible_agents || []),
        is_active: editConfig.is_active ?? true,
      });
      setStep(1);
    } else if (!open) {
      setForm({ name: "", description: "", source_type: "all", funnel_id: "", distribution_method: "round_robin", eligible_agents: [], distribution_weights: {}, is_active: true });
      setStep(1);
    }
  }, [editConfig, open]);

  const distributeEqually = (agentIds: string[]) => {
    if (agentIds.length === 0) return {};
    const base = Math.floor(100 / agentIds.length);
    const remainder = 100 - (base * agentIds.length);
    return Object.fromEntries(agentIds.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
  };

  const totalWeight = form.eligible_agents.reduce(
    (total, id) => total + (Number(form.distribution_weights[id]) || 0), 0,
  );
  const totalSteps = form.distribution_method === "weighted" ? 4 : 3;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Sem organizacao");
      const payload = {
        ...form,
        distribution_weights: form.distribution_method === "weighted" ? form.distribution_weights : {},
        organization_id: organizationId,
        funnel_id: form.funnel_id || null,
        triggers: ["new_lead"],
        auto_redistribute: false,
        redistribution_timeout_minutes: 60,
        source_identifiers: [],
        filter_rules: { logic: "AND", conditions: [] },
      };
      if (editConfig?.id) {
        const { error } = await supabase.from("lead_distribution_configs").update(payload).eq("id", editConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lead_distribution_configs").insert(payload);
        if (error) throw error;
      }
      // Auto-create agent settings
      if (form.eligible_agents.length > 0) {
        for (const agentId of form.eligible_agents) {
          await supabase.from("agent_distribution_settings").upsert({
            user_id: agentId,
            organization_id: organizationId,
            is_active: true,
            is_paused: false,
            max_capacity: 200,
            capacity_enabled: false,
            priority_weight: 1,
          }, { onConflict: "user_id,organization_id", ignoreDuplicates: true });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success(editConfig ? "Roleta atualizada" : "Roleta criada com sucesso");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error("Erro ao salvar: " + err.message),
  });

  const canProceed = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 3 && form.distribution_method === "weighted") return form.eligible_agents.length > 0;
    if (step === 4) return totalWeight === 100 && form.eligible_agents.every(id => (form.distribution_weights[id] || 0) > 0);
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editConfig ? "Editar Roleta" : "Nova Roleta"}</DialogTitle>
          <DialogDescription>
            Configure sua roleta de distribuicao em {editConfig ? "poucos passos" : "3 passos"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-2">
          {Array.from({ length: totalSteps }, (_, index) => index + 1).map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                s < step ? "bg-primary text-primary-foreground" :
                s === step ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {s < step ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              {s < totalSteps && <div className={`flex-1 h-0.5 rounded ${s < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="py-4 space-y-5">
          {/* Step 1: Basic info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da roleta *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: WhatsApp - Funil B2B" />
              </div>
              <div className="space-y-2">
                <Label>Descricao</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descricao opcional" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os canais</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="facebook">Facebook Leads</SelectItem>
                    <SelectItem value="webhook">Webhook (Formularios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Funil</Label>
                <Select value={form.funnel_id || "__none__"} onValueChange={v => setForm({ ...form, funnel_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Todos os funis" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todos os funis (generica)</SelectItem>
                    {funnels?.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Method */}
          {step === 2 && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Metodo de distribuicao</Label>
              <div className="grid grid-cols-2 gap-3">
                {METHODS.map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setForm({
                        ...form,
                        distribution_method: m.value,
                        distribution_weights: m.value === "weighted" && Object.keys(form.distribution_weights).length === 0
                          ? distributeEqually(form.eligible_agents)
                          : form.distribution_weights,
                      })}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                        form.distribution_method === m.value
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        form.distribution_method === m.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="text-[11px] text-muted-foreground leading-snug">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Agents */}
          {step === 3 && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Agentes elegiveis</Label>
              <p className="text-xs text-muted-foreground">Selecione quais colaboradores receberao leads desta roleta.</p>
              <div className="space-y-2 max-h-56 overflow-y-auto border rounded-lg p-3">
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum membro encontrado</p>
                ) : (
                  members.map(member => (
                    <label key={member.user_id} className="flex items-center gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={form.eligible_agents.includes(member.user_id)}
                        onChange={e => {
                          const nextAgents = e.target.checked
                            ? [...form.eligible_agents, member.user_id]
                            : form.eligible_agents.filter(id => id !== member.user_id);
                          if (e.target.checked) {
                            setForm({ ...form, eligible_agents: nextAgents, distribution_weights: distributeEqually(nextAgents) });
                          } else {
                            setForm({ ...form, eligible_agents: nextAgents, distribution_weights: distributeEqually(nextAgents) });
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{member.full_name}</span>
                    </label>
                  ))
                )}
              </div>
              {form.eligible_agents.length === 0 && (
                <p className="text-xs text-muted-foreground">Se nenhum for selecionado, todos os agentes ativos serao elegiveis.</p>
              )}
            </div>
          )}

          {/* Step 4: Percentages (weighted only) */}
          {step === 4 && form.distribution_method === "weighted" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold">Porcentagem por agente</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Defina quanto dos novos leads cada participante deve receber.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, distribution_weights: distributeEqually(form.eligible_agents) })}>
                  Dividir igualmente
                </Button>
              </div>
              <div className="space-y-2">
                {form.eligible_agents.map(agentId => {
                  const member = members.find(item => item.user_id === agentId);
                  return (
                    <div key={agentId} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{member?.full_name || "Colaborador"}</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={form.distribution_weights[agentId] ?? ""}
                          onChange={event => {
                            const value = Math.max(0, Math.min(100, Number(event.target.value)));
                            setForm({ ...form, distribution_weights: { ...form.distribution_weights, [agentId]: value } });
                          }}
                          className="h-9 w-20 text-right"
                          aria-label={`Porcentagem de ${member?.full_name || "colaborador"}`}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${totalWeight === 100 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                <span className="font-medium">Total configurado</span>
                <span className="font-bold">{totalWeight}% de 100%</span>
              </div>
              {totalWeight !== 100 && <p className="text-xs text-destructive">A soma das porcentagens precisa ser exatamente 100%.</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-2 border-t">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          )}
          {step < totalSteps ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="gap-1">
              Proximo <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim() || (form.distribution_method === "weighted" && totalWeight !== 100)}>
              {saveMutation.isPending ? "Salvando..." : editConfig ? "Atualizar" : "Criar roleta"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
