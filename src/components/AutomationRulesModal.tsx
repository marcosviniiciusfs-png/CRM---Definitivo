import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Play, Pause, Settings } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AutomationRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: any;
  conditions: any[];
  actions: any[];
}

const TRIGGER_TYPES = [
  { value: "WHATSAPP_FIRST_MESSAGE", label: "Primeira mensagem do Lead (WhatsApp)" },
  { value: "LEAD_CREATED_META_FORM", label: "Lead criado via Meta Ads" },
  { value: "LEAD_STAGE_CHANGED", label: "Etapa do Lead alterada" },
  { value: "NEW_INCOMING_MESSAGE", label: "Nova mensagem recebida" },
];

const CONDITION_TYPES = [
  { value: "MESSAGE_CONTENT", label: "Conteúdo da mensagem" },
  { value: "LAST_CONVERSATION_ACTIVITY", label: "Última atividade" },
  { value: "AGENT_RESPONSE_TIME", label: "Tempo de resposta do agente" },
  { value: "TIME_OF_DAY", label: "Horário do dia" },
  { value: "ALWAYS_TRUE", label: "Sempre executar" },
];

const ACTION_TYPES = [
  { value: "SEND_PREDEFINED_MESSAGE", label: "Enviar mensagem pronta" },
  { value: "CHANGE_FUNNEL_STAGE", label: "Mudar etapa do funil" },
  { value: "ASSIGN_TO_AGENT", label: "Atribuir para agente" },
];

const FUNNEL_STAGES = ["NOVO", "QUALIFICACAO", "CONTATO_FEITO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO", "DESCARTADO"];

export function AutomationRulesModal({ open, onOpenChange }: AutomationRulesModalProps) {
  const queryClient = useQueryClient();
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [conditions, setConditions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["automation-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AutomationRule[];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (ruleData: any) => {
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      const { data, error } = await supabase
        .from("automation_rules")
        .insert({
          ...ruleData,
          organization_id: orgData?.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Rule created successfully with data:', JSON.stringify(data, null, 2));
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Regra criada com sucesso!");
      resetForm();
      setIsCreating(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao criar regra: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase
        .from("automation_rules")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Regra atualizada!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Regra excluída!");
      setSelectedRule(null);
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerType("");
    setTriggerConfig({});
    setConditions([]);
    setActions([]);
  };

  const handleSave = () => {
    if (!name || !triggerType || actions.length === 0) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    console.log('Saving automation rule with actions:', JSON.stringify(actions, null, 2));

    createMutation.mutate({
      name,
      description,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      conditions,
      actions,
      is_active: true,
    });
  };

  const toggleRuleStatus = (rule: AutomationRule) => {
    updateMutation.mutate({
      id: rule.id,
      is_active: !rule.is_active,
    });
  };

  const addCondition = () => {
    setConditions([...conditions, { type: "", operator: "CONTAINS", value: "" }]);
  };

  const addAction = () => {
    setActions([...actions, { type: "", config: {} }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Regras de Automação</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Minhas Regras</TabsTrigger>
            <TabsTrigger value="create" onClick={() => setIsCreating(true)}>
              Nova Regra
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : rules && rules.length > 0 ? (
              rules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {rule.name}
                          <Badge variant={rule.is_active ? "default" : "secondary"}>
                            {rule.is_active ? "Ativa" : "Pausada"}
                          </Badge>
                        </CardTitle>
                        {rule.description && (
                          <CardDescription className="mt-1">{rule.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleRuleStatus(rule)}
                          title={rule.is_active ? "Pausar" : "Ativar"}
                        >
                          {rule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-semibold">Gatilho:</span>{" "}
                        {TRIGGER_TYPES.find((t) => t.value === rule.trigger_type)?.label}
                      </div>
                      <div>
                        <span className="font-semibold">Condições:</span> {rule.conditions.length}
                      </div>
                      <div>
                        <span className="font-semibold">Ações:</span> {rule.actions.length}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma regra criada ainda. Crie sua primeira regra de automação!
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Regra *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Resposta automática de orçamento"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo desta automação"
                />
              </div>

              <div>
                <Label htmlFor="trigger">Gatilho *</Label>
                <Select value={triggerType} onValueChange={setTriggerType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gatilho" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((trigger) => (
                      <SelectItem key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {triggerType === "LEAD_STAGE_CHANGED" && (
                <div>
                  <Label>Etapa específica</Label>
                  <Select
                    value={triggerConfig.stage || ""}
                    onValueChange={(value) => setTriggerConfig({ ...triggerConfig, stage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {FUNNEL_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Condições</Label>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {conditions.map((condition, index) => (
                  <Card key={index} className="mb-2 p-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Tipo</Label>
                        <Select
                          value={condition.type}
                          onValueChange={(value) => {
                            const newConditions = [...conditions];
                            newConditions[index].type = value;
                            setConditions(newConditions);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {condition.type === "MESSAGE_CONTENT" && (
                        <>
                          <div className="flex-1">
                            <Label>Operador</Label>
                            <Select
                              value={condition.operator}
                              onValueChange={(value) => {
                                const newConditions = [...conditions];
                                newConditions[index].operator = value;
                                setConditions(newConditions);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CONTAINS">Contém</SelectItem>
                                <SelectItem value="EQUALS">Igual a</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Label>Valor</Label>
                            <Input
                              value={condition.value}
                              onChange={(e) => {
                                const newConditions = [...conditions];
                                newConditions[index].value = e.target.value;
                                setConditions(newConditions);
                              }}
                              placeholder="Ex: orçamento, preço"
                            />
                          </div>
                        </>
                      )}

                      {condition.type === "LAST_CONVERSATION_ACTIVITY" && (
                        <>
                          <div className="flex-1">
                            <Label>Dias sem atividade</Label>
                            <Input
                              type="number"
                              value={condition.days || ""}
                              onChange={(e) => {
                                const newConditions = [...conditions];
                                newConditions[index].days = parseInt(e.target.value);
                                setConditions(newConditions);
                              }}
                            />
                          </div>
                        </>
                      )}

                      {condition.type === "AGENT_RESPONSE_TIME" && (
                        <>
                          <div className="flex-1">
                            <Label>Minutos</Label>
                            <Input
                              type="number"
                              value={condition.minutes || ""}
                              onChange={(e) => {
                                const newConditions = [...conditions];
                                newConditions[index].minutes = parseInt(e.target.value);
                                setConditions(newConditions);
                              }}
                            />
                          </div>
                        </>
                      )}

                      {condition.type === "TIME_OF_DAY" && (
                        <>
                          <div className="flex-1">
                            <Label>Hora início</Label>
                            <Input
                              type="time"
                              value={condition.start_time || ""}
                              onChange={(e) => {
                                const newConditions = [...conditions];
                                newConditions[index].start_time = e.target.value;
                                setConditions(newConditions);
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <Label>Hora fim</Label>
                            <Input
                              type="time"
                              value={condition.end_time || ""}
                              onChange={(e) => {
                                const newConditions = [...conditions];
                                newConditions[index].end_time = e.target.value;
                                setConditions(newConditions);
                              }}
                            />
                          </div>
                        </>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConditions(conditions.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Ações *</Label>
                  <Button variant="outline" size="sm" onClick={addAction}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {actions.map((action, index) => (
                  <Card key={index} className="mb-2 p-4">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>Tipo</Label>
                        <Select
                          value={action.type}
                          onValueChange={(value) => {
                            const newActions = [...actions];
                            newActions[index].type = value;
                            setActions(newActions);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {action.type === "SEND_PREDEFINED_MESSAGE" && (
                        <>
                          <div className="flex-1">
                            <Label>Mensagem</Label>
                            <Textarea
                              value={action.config.message || ""}
                              onChange={(e) => {
                                const newActions = [...actions];
                                newActions[index].config = { 
                                  ...newActions[index].config,
                                  message: e.target.value 
                                };
                                setActions(newActions);
                              }}
                              placeholder="Digite a mensagem a ser enviada"
                            />
                          </div>
                          <div className="flex-1">
                            <Label>Delay de digitação</Label>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={action.config.typing_delay_unit === "minutes" ? 5 : 300}
                                value={action.config.typing_delay_value || 0}
                                onChange={(e) => {
                                  const newActions = [...actions];
                                  const value = parseInt(e.target.value) || 0;
                                  const unit = newActions[index].config.typing_delay_unit || "seconds";
                                  newActions[index].config = { 
                                    ...newActions[index].config,
                                    typing_delay_value: value,
                                    typing_delay: unit === "minutes" ? value * 60 : value
                                  };
                                  setActions(newActions);
                                }}
                                placeholder="0"
                                className="flex-1"
                              />
                              <Select
                                value={action.config.typing_delay_unit || "seconds"}
                                onValueChange={(value) => {
                                  const newActions = [...actions];
                                  const currentValue = newActions[index].config.typing_delay_value || 0;
                                  newActions[index].config = { 
                                    ...newActions[index].config,
                                    typing_delay_unit: value,
                                    typing_delay: value === "minutes" ? currentValue * 60 : currentValue
                                  };
                                  setActions(newActions);
                                }}
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="seconds">Segundos</SelectItem>
                                  <SelectItem value="minutes">Minutos</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              O lead verá "digitando..." por este tempo
                            </p>
                          </div>
                        </>
                      )}

                      {action.type === "CHANGE_FUNNEL_STAGE" && (
                        <div className="flex-1">
                          <Label>Nova etapa</Label>
                          <Select
                            value={action.config.stage || ""}
                            onValueChange={(value) => {
                              const newActions = [...actions];
                              newActions[index].config = { stage: value };
                              setActions(newActions);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FUNNEL_STAGES.map((stage) => (
                                <SelectItem key={stage} value={stage}>
                                  {stage}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === "ASSIGN_TO_AGENT" && (
                        <div className="flex-1">
                          <Label>E-mail do agente</Label>
                          <Input
                            value={action.config.agent_email || ""}
                            onChange={(e) => {
                              const newActions = [...actions];
                              newActions[index].config = { agent_email: e.target.value };
                              setActions(newActions);
                            }}
                            placeholder="usuario@exemplo.com"
                          />
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActions(actions.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetForm}>
                  Limpar
                </Button>
                <Button onClick={handleSave} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar Regra"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
