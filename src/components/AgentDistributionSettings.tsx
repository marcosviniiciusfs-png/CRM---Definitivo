import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Clock, Pause, Save, TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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

export function AgentDistributionSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!member) return;

      const { data: existingSettings } = await supabase
        .from('agent_distribution_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('organization_id', member.organization_id)
        .single();

      if (existingSettings) {
        setSettings(existingSettings);
      } else {
        setSettings(prev => ({
          ...prev,
          user_id: user.id,
          organization_id: member.organization_id,
        }));
      }

      // Carregar carga atual
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('responsavel', profile.full_name)
          .neq('stage', 'GANHO')
          .neq('stage', 'PERDIDO')
          .neq('stage', 'DESCARTADO');

        setCurrentLoad(count || 0);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
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
        description: "Suas preferências de distribuição foram atualizadas.",
      });

      loadSettings();
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

  if (loading) {
    return <div className="text-center py-8">Carregando configurações...</div>;
  }

  const utilizationPercentage = (currentLoad / settings.max_capacity) * 100;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Minhas Configurações de Distribuição
          </CardTitle>
          <CardDescription>
            Configure suas preferências para receber leads automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status de Participação */}
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
            />
          </div>

          <Separator />

          {/* Carga Atual */}
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

          <Separator />

          {/* Capacidade Máxima */}
          <div className="space-y-2">
            <Label htmlFor="max_capacity">Capacidade Máxima</Label>
            <Input
              id="max_capacity"
              type="number"
              min="1"
              value={settings.max_capacity}
              onChange={(e) => setSettings({ ...settings, max_capacity: parseInt(e.target.value) })}
            />
            <p className="text-sm text-muted-foreground">
              Número máximo de leads ativos que você pode ter simultaneamente
            </p>
          </div>

          <Separator />

          {/* Prioridade/Peso */}
          <div className="space-y-2">
            <Label htmlFor="priority_weight">Prioridade (1-10)</Label>
            <Input
              id="priority_weight"
              type="number"
              min="1"
              max="10"
              value={settings.priority_weight}
              onChange={(e) => setSettings({ ...settings, priority_weight: parseInt(e.target.value) })}
            />
            <p className="text-sm text-muted-foreground">
              Peso para distribuição ponderada. Maior valor = mais leads recebidos
            </p>
          </div>

          <Separator />

          {/* Pausa Temporária */}
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
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pause_until">Pausar até</Label>
                  <Input
                    id="pause_until"
                    type="datetime-local"
                    value={settings.pause_until || ''}
                    onChange={(e) => setSettings({ ...settings, pause_until: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para pausar indefinidamente
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}