import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface LeadDistributionConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DistributionConfig | null;
  organizationId: string | null | undefined;
}

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
  });

  // Buscar membros da organização
  const { data: members } = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: orgMembers, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, email")
        .eq("organization_id", organizationId)
        .not("user_id", "is", null);
      
      if (membersError) throw membersError;
      if (!orgMembers) return [];

      // Buscar profiles separadamente
      const userIds = orgMembers.map(m => m.user_id!);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      // Combinar dados
      return orgMembers.map(member => ({
        ...member,
        full_name: profiles?.find(p => p.user_id === member.user_id)?.full_name
      }));
    },
    enabled: !!organizationId,
  });

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
      });
    }
  }, [config, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organization ID not found");

      const payload = {
        ...formData,
        organization_id: organizationId,
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
        console.log('📝 Criando agent_distribution_settings para agentes elegíveis:', formData.eligible_agents);
        
        for (const agentId of formData.eligible_agents) {
          const { error: settingsError } = await supabase
            .from('agent_distribution_settings')
            .upsert({
              user_id: agentId,
              organization_id: organizationId,
              is_active: true,
              is_paused: false,
              max_capacity: 50,
              priority_weight: 1,
            }, { 
              onConflict: 'user_id,organization_id',
              ignoreDuplicates: false 
            });
          
          if (settingsError) {
            console.error('⚠️ Erro ao criar settings para agente:', agentId, settingsError);
            // Não falhar a operação inteira por erro em um agente
          } else {
            console.log('✅ Settings criados/atualizados para agente:', agentId);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config ? "Editar Roleta" : "Nova Roleta"}</DialogTitle>
          <DialogDescription>
            Configure as regras de distribuição para este canal específico
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Roleta *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Roleta Facebook - Imóveis"
            />
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="source_type">Canal de Origem</Label>
            <Select
              value={formData.source_type}
              onValueChange={(value) => setFormData({ ...formData, source_type: value })}
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
              Esta roleta será aplicada apenas para leads vindos do canal selecionado
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="distribution_method">Método de Distribuição</Label>
            <Select
              value={formData.distribution_method}
              onValueChange={(value) => setFormData({ ...formData, distribution_method: value })}
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
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Redistribuição Automática</Label>
              <p className="text-sm text-muted-foreground">
                Redistribuir leads sem resposta após timeout
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
              <Label htmlFor="timeout">Tempo para Redistribuição (minutos)</Label>
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

          <div className="space-y-2">
            <Label>Distribuir por Equipe</Label>
            <Select
              value={formData.team_id}
              onValueChange={(value) => setFormData({ ...formData, team_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as equipes (sem filtro)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as equipes (sem filtro)</SelectItem>
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
                      {member.full_name || member.email}
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum membro encontrado
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Roleta Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Ativar/desativar esta roleta
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
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
  );
}
