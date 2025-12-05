import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Clock, Pause, Save, TrendingUp, Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingAnimation } from "@/components/LoadingAnimation";

interface AgentSettings {
  id?: string;
  user_id: string;
  organization_id: string;
  is_active: boolean;
  is_paused: boolean;
  pause_reason?: string;
  pause_until?: string;
  max_capacity: number;
  priority_weight: number;
  working_hours?: any;
}

interface OrganizationMember {
  user_id: string;
  full_name: string;
  email: string;
}

export function AgentDistributionSettings() {
  const { toast } = useToast();
  const permissions = usePermissions();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [settings, setSettings] = useState<AgentSettings>({
    user_id: '',
    organization_id: '',
    is_active: true,
    is_paused: false,
    max_capacity: 50,
    priority_weight: 1,
  });
  const [currentLoad, setCurrentLoad] = useState(0);

  useEffect(() => {
    if (!permissions.loading) {
      loadInitialData();
    }
  }, [permissions.loading]);

  useEffect(() => {
    if (selectedMemberId) {
      loadMemberSettings(selectedMemberId);
    }
  }, [selectedMemberId]);

  const loadInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!member) return;

      // Se for admin/owner, carregar membros e perfis em PARALELO
      if (permissions.canManageAgentSettings) {
        const [orgMembersResult, profilesResult] = await Promise.all([
          supabase
            .from('organization_members')
            .select('user_id, email')
            .eq('organization_id', member.organization_id)
            .not('user_id', 'is', null),
          supabase
            .from('profiles')
            .select('user_id, full_name')
        ]);

        const orgMembers = orgMembersResult.data || [];
        const profiles = profilesResult.data || [];

        const membersWithNames = orgMembers.map(m => {
          const profile = profiles.find(p => p.user_id === m.user_id);
          return {
            user_id: m.user_id!,
            full_name: profile?.full_name || m.email || 'Sem nome',
            email: m.email || '',
          };
        });

        setMembers(membersWithNames);
        setSelectedMemberId(user.id);
      } else {
        setSelectedMemberId(user.id);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const loadMemberSettings = async (memberId: string) => {
    if (!memberId) return;
    
    try {
      setLoadingSettings(true);
      
      // Buscar organization_id e profile em PARALELO
      const [memberResult, profileResult] = await Promise.all([
        supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', memberId)
          .single(),
        supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', memberId)
          .single()
      ]);

      if (!memberResult.data) return;

      // Buscar settings
      const settingsResult = await supabase
        .from('agent_distribution_settings')
        .select('*')
        .eq('user_id', memberId)
        .eq('organization_id', memberResult.data.organization_id)
        .single();

      // Contar leads ativos (excluindo stage_type won/lost)
      // Usar query com join para verificar stage_type do funil
      const { data: activeLeads, error: leadsError } = await supabase
        .from('leads')
        .select(`
          id,
          funnel_stages!inner(stage_type)
        `)
        .eq('responsavel_user_id', memberId)
        .not('funnel_stages.stage_type', 'in', '("won","lost")');

      const leadsCount = leadsError ? 0 : (activeLeads?.length || 0);

      if (settingsResult.data) {
        setSettings(settingsResult.data);
      } else {
        setSettings({
          user_id: memberId,
          organization_id: memberResult.data.organization_id,
          is_active: true,
          is_paused: false,
          max_capacity: 50,
          priority_weight: 1,
        });
      }

      setCurrentLoad(leadsCount);
    } catch (error) {
      console.error('Error loading member settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.id) {
        const { error } = await supabase
          .from('agent_distribution_settings')
          .update(settings)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_distribution_settings')
          .insert(settings);

        if (error) throw error;
      }

      toast({
        title: "Configurações salvas",
        description: permissions.canManageAgentSettings 
          ? "As configurações do agente foram atualizadas."
          : "Suas preferências de distribuição foram atualizadas.",
      });

      loadMemberSettings(selectedMemberId);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return <LoadingAnimation text="Carregando configurações" />;
  }

  const utilizationPercentage = (currentLoad / settings.max_capacity) * 100;
  const isReadOnly = !permissions.canManageAgentSettings;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {permissions.canManageAgentSettings 
              ? "Configurações de Distribuição dos Agentes"
              : "Minhas Configurações (Somente Leitura)"}
          </CardTitle>
          <CardDescription>
            {permissions.canManageAgentSettings
              ? "Configure as preferências de distribuição para cada membro da equipe"
              : "Suas configurações são definidas pelos administradores"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seletor de Membro (apenas para admins/owners) */}
          {permissions.canManageAgentSettings && (
            <>
              <div className="space-y-2">
                <Label htmlFor="member-select">Selecionar Agente</Label>
                <Select 
                  value={selectedMemberId} 
                  onValueChange={setSelectedMemberId}
                  disabled={loadingSettings || members.length === 0}
                >
                  <SelectTrigger id="member-select">
                    <SelectValue placeholder={members.length === 0 ? "Carregando membros..." : "Selecione um membro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name} {member.user_id === currentUserId && "(Você)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
            </>
          )}

          {loadingSettings && (
            <div className="py-8">
              <LoadingAnimation text="Carregando dados do agente" />
            </div>
          )}

          {/* Mensagem informativa para members */}
          {!loadingSettings && isReadOnly && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Suas configurações são definidas pelos administradores da organização.
                </AlertDescription>
              </Alert>
              <Separator />
            </>
          )}
          
          {/* Status de Participação */}
          {!loadingSettings && (
            <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Participar da Roleta</Label>
              <p className="text-sm text-muted-foreground">
                Receber leads através da distribuição automática
              </p>
            </div>
            <Switch
              id="is_active"
              checked={settings.is_active}
              onCheckedChange={(checked) => setSettings({ ...settings, is_active: checked })}
              disabled={isReadOnly}
            />
            </div>
          )}

          {!loadingSettings && <Separator />}

          {/* Carga Atual */}
          {!loadingSettings && (
            <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Carga Atual de Leads
              </Label>
              <span className="text-2xl font-bold">{currentLoad}/{settings.max_capacity}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {utilizationPercentage.toFixed(0)}% de utilização
            </p>
            </div>
          )}

          {!loadingSettings && <Separator />}

          {/* Capacidade Máxima */}
          {!loadingSettings && (
            <div className="space-y-2">
            <Label htmlFor="max_capacity">Capacidade Máxima</Label>
            <Input
              id="max_capacity"
              type="number"
              min="1"
              value={settings.max_capacity}
              onChange={(e) => setSettings({ ...settings, max_capacity: parseInt(e.target.value) })}
              disabled={isReadOnly}
            />
            <p className="text-sm text-muted-foreground">
              Número máximo de leads ativos que você pode ter simultaneamente
            </p>
            </div>
          )}

          {!loadingSettings && <Separator />}

          {/* Prioridade/Peso */}
          {!loadingSettings && (
            <div className="space-y-2">
            <Label htmlFor="priority_weight">Prioridade (1-10)</Label>
            <Input
              id="priority_weight"
              type="number"
              min="1"
              max="10"
              value={settings.priority_weight}
              onChange={(e) => setSettings({ ...settings, priority_weight: parseInt(e.target.value) })}
              disabled={isReadOnly}
            />
            <p className="text-sm text-muted-foreground">
              Peso para distribuição ponderada. Maior valor = mais leads recebidos
            </p>
            </div>
          )}

          {!loadingSettings && <Separator />}

          {/* Pausa Temporária */}
          {!loadingSettings && (
            <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_paused" className="flex items-center gap-2">
                  <Pause className="h-4 w-4" />
                  Pausar Recebimento
                </Label>
                <p className="text-sm text-muted-foreground">
                  Temporariamente parar de receber novos leads
                </p>
              </div>
              <Switch
                id="is_paused"
                checked={settings.is_paused}
                onCheckedChange={(checked) => setSettings({ ...settings, is_paused: checked })}
                disabled={isReadOnly}
              />
            </div>

            {settings.is_paused && (
              <div className="space-y-4 pl-6 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label htmlFor="pause_reason">Motivo da Pausa</Label>
                  <Textarea
                    id="pause_reason"
                    placeholder="Ex: Férias, reunião importante, etc."
                    value={settings.pause_reason || ''}
                    onChange={(e) => setSettings({ ...settings, pause_reason: e.target.value })}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pause_until">Pausar até</Label>
                  <Input
                    id="pause_until"
                    type="datetime-local"
                    value={settings.pause_until || ''}
                    onChange={(e) => setSettings({ ...settings, pause_until: e.target.value })}
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para pausar indefinidamente
                  </p>
                </div>
              </div>
            )}
            </div>
          )}

          {!isReadOnly && !loadingSettings && (
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}