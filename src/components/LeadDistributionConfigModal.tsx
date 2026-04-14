import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface DistributionConfig {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  source_identifiers: any;
  distribution_method: string;
  is_active: boolean;
  triggers: any;
  auto_redistribute: boolean;
  redistribution_timeout_minutes?: number;
  eligible_agents?: string[];
  team_id?: string;
  funnel_id?: string | null;
  funnel_stage_id?: string | null;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface Funnel {
  id: string;
  name: string;
  is_active: boolean;
}

interface FunnelStage {
  id: string;
  name: string;
  position: number;
  stage_type: string;
}

interface WebhookConfig {
  id: string;
  name: string | null;
  webhook_token: string;
  is_active: boolean;
}

interface LeadDistributionConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DistributionConfig | null;
  organizationId: string | null | undefined;
}

// Descrições de cada método de distribuição
const DISTRIBUTION_METHOD_TOOLTIPS: Record<string, string> = {
  round_robin:
    "Rodízio circular: cada novo lead é atribuído ao próximo colaborador da lista, garantindo distribuição igual entre todos os elegíveis.",
  weighted:
    "Ponderado por prioridade: colaboradores com maior peso recebem proporcionalmente mais leads. Configure o peso de cada agente nas Configurações de Agente.",
  load_based:
    "Baseado em carga: o lead sempre vai para o colaborador com menos leads ativos no momento, equilibrando automaticamente a carga de trabalho.",
  random:
    "Aleatório: cada lead é atribuído a um colaborador sorteado aleatoriamente entre os elegíveis disponíveis.",
};

export function LeadDistributionConfigModal({
  open,
  onOpenChange,
  config,
  organizationId,
}: LeadDistributionConfigModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    source_type: "all",
    source_identifiers: [],
    distribution_method: "round_robin",
    is_active: true,
    triggers: ["new_lead"],
    auto_redistribute: false,
    redistribution_timeout_minutes: 60,
    eligible_agents: [] as string[],
    team_id: "" as string,
    funnel_id: "" as string,
    funnel_stage_id: "" as string,
  });

  // Buscar equipes da organização
  const { data: teams } = useQuery({
    queryKey: ["teams", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar funis ativos da organização
  const { data: funnels } = useQuery({
    queryKey: ["sales-funnels-active", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("sales_funnels")
        .select("id, name, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Funnel[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar estágios do funil selecionado (excluindo won/lost)
  const { data: funnelStages } = useQuery({
    queryKey: ["funnel-stages-active", formData.funnel_id],
    queryFn: async () => {
      if (!formData.funnel_id) return [];
      const { data, error } = await supabase
        .from("funnel_stages")
        .select("id, name, position, stage_type")
        .eq("funnel_id", formData.funnel_id)
        .not("stage_type", "in", '("won","lost")')
        .order("position");
      if (error) throw error;
      return data as FunnelStage[];
    },
    enabled: !!formData.funnel_id,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar webhooks configurados (formulários) — apenas quando source_type = webhook
  const { data: webhookConfigs } = useQuery({
    queryKey: ["webhook-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("id, name, webhook_token, is_active")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return data as WebhookConfig[];
    },
    enabled: !!organizationId && formData.source_type === "webhook",
    staleTime: 5 * 60 * 1000,
  });

  // Buscar membros da organização usando o hook dedicado (com fallback correto)
  const { data: rawMembers } = useOrganizationMembers(organizationId);

  // Normalizar para o formato simples usado no modal
  const members = rawMembers
    ?.filter((m) => m.user_id)
    .map((m) => ({
      user_id: m.user_id!,
      full_name: m.full_name || (m as any).display_name || m.email || 'Sem nome',
    }));

  // Quando o funil muda, limpar o estágio selecionado
  const handleFunnelChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      funnel_id: value === "__none__" ? "" : value,
      funnel_stage_id: "",
    }));
  };

  // Quando o canal muda, limpar source_identifiers se não for webhook
  const handleSourceTypeChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      source_type: value,
      source_identifiers: value === "webhook" ? prev.source_identifiers : [],
    }));
  };

  // Alternar seleção de token de formulário em source_identifiers
  const handleWebhookTokenToggle = (token: string, checked: boolean) => {
    const currentIds: string[] = Array.isArray(formData.source_identifiers)
      ? formData.source_identifiers
      : [];
    const updated = checked
      ? [...currentIds, token]
      : currentIds.filter((t) => t !== token);
    setFormData((prev) => ({ ...prev, source_identifiers: updated }));
  };


  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        description: config.description || "",
        source_type: config.source_type,
        source_identifiers: config.source_identifiers || [],
        distribution_method: config.distribution_method,
        is_active: config.is_active,
        triggers: Array.isArray(config.triggers) ? config.triggers : ["new_lead"],
        auto_redistribute: config.auto_redistribute,
        redistribution_timeout_minutes: config.redistribution_timeout_minutes || 60,
        eligible_agents: config.eligible_agents || [],
        team_id: config.team_id || "",
        funnel_id: config.funnel_id || "",
        funnel_stage_id: config.funnel_stage_id || "",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        source_type: "all",
        source_identifiers: [],
        distribution_method: "round_robin",
        is_active: true,
        triggers: ["new_lead"],
        auto_redistribute: false,
        redistribution_timeout_minutes: 60,
        eligible_agents: [],
        team_id: "",
        funnel_id: "",
        funnel_stage_id: "",
      });
    }
  }, [config, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organization ID not found");

      const payload = {
        ...formData,
        organization_id: organizationId,
        team_id: formData.team_id === "" ? null : formData.team_id,
        funnel_id: formData.funnel_id === "" ? null : formData.funnel_id,
        funnel_stage_id: formData.funnel_stage_id === "" ? null : formData.funnel_stage_id,
      };

      if (config?.id) {
        const { error } = await supabase
          .from("lead_distribution_configs")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lead_distribution_configs")
          .insert(payload);
        if (error) throw error;
      }

      // ✅ CRIAR AUTOMATICAMENTE AGENT SETTINGS PARA AGENTES ELEGÍVEIS
      if (formData.eligible_agents.length > 0) {
        for (const agentId of formData.eligible_agents) {
          const { error: settingsError } = await supabase
            .from('agent_distribution_settings')
            .upsert({
              user_id: agentId,
              organization_id: organizationId,
              is_active: true,
              is_paused: false,
              max_capacity: 200,
              capacity_enabled: false,
              priority_weight: 1,
            }, {
              onConflict: 'user_id,organization_id',
              ignoreDuplicates: false
            });

          if (settingsError) {
            console.error('⚠️ Erro ao criar settings para agente:', agentId, settingsError);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success(config ? "Roleta atualizada com sucesso" : "Roleta criada com sucesso");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar roleta: " + error.message);
    },
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Nome da roleta é obrigatório");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{config ? "Editar Roleta" : "Nova Roleta"}</DialogTitle>
            <DialogDescription>
              Configure as regras de distribuição para este canal específico
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Roleta *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Roleta WhatsApp - Consórcio"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional da roleta"
                rows={2}
              />
            </div>

            <Separator />

            {/* Canal de Origem */}
            <div className="space-y-2">
              <Label htmlFor="source_type">Canal de Origem</Label>
              <Select
                value={formData.source_type}
                onValueChange={handleSourceTypeChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os canais</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="facebook">Facebook Leads</SelectItem>
                  <SelectItem value="webhook">Webhook (Formulários)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                A roleta só será ativada para leads vindos do canal selecionado.
                Combinado com o Funil abaixo, você pode ter roletas separadas por canal + funil.
              </p>
              {formData.source_type !== "all" && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Dica: Use "Todos os canais" para garantir que leads de qualquer origem sejam distribuídos.
                  Roletas específicas por canal têm prioridade sobre a roleta genérica.
                </p>
              )}
            </div>

            {/* Formulários Webhook — visível somente quando source_type = webhook */}
            {formData.source_type === "webhook" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-semibold">Formulários desta Roleta</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm">
                        <p className="font-semibold mb-1">Como funciona:</p>
                        <p>Selecione quais formulários/webhooks devem ativar <strong>esta</strong> roleta em específico.</p>
                        <p className="mt-1">Se nenhum for selecionado, a roleta atua como fallback para qualquer webhook sem roleta específica configurada.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="space-y-2 max-h-44 overflow-y-auto border rounded-md p-3">
                    {webhookConfigs && webhookConfigs.length > 0 ? (
                      webhookConfigs.map((wh) => {
                        const selectedTokens: string[] = Array.isArray(formData.source_identifiers)
                          ? formData.source_identifiers
                          : [];
                        const isSelected = selectedTokens.includes(wh.webhook_token);
                        return (
                          <div key={wh.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`wh-${wh.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleWebhookTokenToggle(wh.webhook_token, !!checked)
                              }
                            />
                            <label
                              htmlFor={`wh-${wh.id}`}
                              className="flex-1 text-sm font-medium leading-none cursor-pointer"
                            >
                              {wh.name || wh.webhook_token}
                              {!wh.is_active && (
                                <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>
                              )}
                            </label>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum formulário webhook configurado.
                        Crie um em Configurações → Integrações.
                      </p>
                    )}
                  </div>

                  {Array.isArray(formData.source_identifiers) && formData.source_identifiers.length > 0 ? (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      ✅ Esta roleta será ativada <strong>apenas</strong> para os {formData.source_identifiers.length} formulário(s) selecionado(s).
                    </p>
                  ) : (
                    <p className="text-sm text-amber-500">
                      ⚠️ Sem formulários selecionados, esta roleta atua como fallback para qualquer webhook sem roleta específica.
                    </p>
                  )}
                </div>
              </>
            )}


            {/* Método de Distribuição com Tooltip */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="distribution_method">Método de Distribuição</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Escolha como os leads serão distribuídos entre os colaboradores elegíveis.
                    Passe o mouse sobre cada opção para mais detalhes.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select
                value={formData.distribution_method}
                onValueChange={(value) =>
                  setFormData({ ...formData, distribution_method: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Rodízio (Round Robin)</SelectItem>
                  <SelectItem value="weighted">Ponderado por Prioridade</SelectItem>
                  <SelectItem value="load_based">Baseado em Carga</SelectItem>
                  <SelectItem value="random">Aleatório</SelectItem>
                </SelectContent>
              </Select>
              {/* Descrição inline do método selecionado */}
              {formData.distribution_method && (
                <p className="text-sm text-muted-foreground">
                  {DISTRIBUTION_METHOD_TOOLTIPS[formData.distribution_method]}
                </p>
              )}
            </div>

            <Separator />

            {/* ── FUNIL (FILTRO + DESTINO) ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm font-semibold">Funil da Roleta</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    <p className="font-semibold mb-1">Como funciona o filtro por funil:</p>
                    <p>Quando um funil é selecionado, esta roleta será ativada <strong>somente</strong> para leads desse funil.</p>
                    <p className="mt-1">Isso permite criar roletas separadas por produto/negócio:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>Roleta Consórcio → agentes A, B, C</li>
                      <li>Roleta Veículos → agentes D, E</li>
                      <li>Roleta Imóveis → agentes F, G</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Seletor de Funil */}
              <div className="space-y-2">
                <Label htmlFor="funnel_id">Funil</Label>
                <Select
                  value={formData.funnel_id || "__none__"}
                  onValueChange={handleFunnelChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um funil (recomendado)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Todos os funis (roleta genérica)
                    </SelectItem>
                    {funnels?.map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        {funnel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.funnel_id ? (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✅ Esta roleta será ativada <strong>apenas</strong> para leads do funil selecionado.
                    Leads de outros funis usarão outra roleta (ou não serão distribuídos).
                  </p>
                ) : (
                  <p className="text-sm text-amber-500">
                    ⚠️ Sem funil definido, esta roleta atua como genérica e pode ser usada por leads de qualquer funil
                    (somente se nenhuma roleta específica for encontrada).
                  </p>
                )}
              </div>

              {/* Seletor de Estágio — aparece somente quando um funil for escolhido */}
              {formData.funnel_id && (
                <div className="space-y-2">
                  <Label htmlFor="funnel_stage_id">Estágio de Entrada</Label>
                  <Select
                    value={formData.funnel_stage_id || "__first__"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        funnel_stage_id: value === "__first__" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Primeiro estágio (padrão)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__first__">
                        Primeiro estágio (padrão)
                      </SelectItem>
                      {funnelStages?.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Estágio em que o lead entrará ao ser distribuído por esta roleta.
                    Se não especificado, o primeiro estágio do funil será utilizado.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Redistribuição Automática */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Redistribuição Automática</Label>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Se o colaborador atribuído não interagir com o lead dentro do tempo definido, o lead é automaticamente repassado para outro disponível nesta roleta.
                </p>
              </div>
              <Switch
                checked={formData.auto_redistribute}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_redistribute: checked })
                }
              />
            </div>

            {formData.auto_redistribute && (
              <div className="space-y-2">
                <Label htmlFor="timeout">Tempo sem interação para redistribuir (minutos)</Label>
                <p className="text-xs text-muted-foreground">
                  O lead será redistribuído se o colaborador não movê-lo de etapa nem enviar mensagem dentro deste prazo.
                </p>
                <Input
                  id="timeout"
                  type="number"
                  min="5"
                  value={formData.redistribution_timeout_minutes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      redistribution_timeout_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                />
              </div>
            )}

            <Separator />

            {/* Distribuir por Equipe */}
            <div className="space-y-2">
              <Label>Distribuir por Equipe</Label>
              <Select
                value={formData.team_id || "__all__"}
                onValueChange={(value) =>
                  setFormData({ ...formData, team_id: value === "__all__" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as equipes (sem filtro)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as equipes (sem filtro)</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        {team.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Quando uma equipe é selecionada, apenas membros desta equipe receberão leads
              </p>
            </div>

            <Separator />

            {/* Membros Elegíveis */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Membros Elegíveis</Label>
                <p className="text-sm text-muted-foreground">
                  Selecione quais colaboradores podem receber leads desta roleta.
                  Se nenhum for selecionado, todos os membros ativos serão elegíveis.
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {members && members.length > 0 ? (
                  members.map((member) => (
                    <div key={member.user_id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`member-${member.user_id}`}
                        checked={formData.eligible_agents.includes(member.user_id!)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              eligible_agents: [...formData.eligible_agents, member.user_id!],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              eligible_agents: formData.eligible_agents.filter(
                                (id) => id !== member.user_id
                              ),
                            });
                          }
                        }}
                      />
                      <label
                        htmlFor={`member-${member.user_id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {member.full_name}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Roleta Ativa */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Roleta Ativa</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar/desativar esta roleta
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : config ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
