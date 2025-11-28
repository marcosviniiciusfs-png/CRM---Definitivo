import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Users, History, Save } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface DistributionConfig {
  id?: string;
  organization_id: string;
  is_active: boolean;
  distribution_method: string;
  triggers: string[];
  auto_redistribute: boolean;
  redistribution_timeout_minutes: number;
}

export function LeadDistributionConfig() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DistributionConfig>({
    organization_id: '',
    is_active: false,
    distribution_method: 'round_robin',
    triggers: [],
    auto_redistribute: false,
    redistribution_timeout_minutes: 60,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!member) return;

      const { data: existingConfig } = await supabase
        .from('lead_distribution_configs')
        .select('*')
        .eq('organization_id', member.organization_id)
        .single();

      if (existingConfig) {
        const triggers = Array.isArray(existingConfig.triggers) 
          ? existingConfig.triggers.filter((t): t is string => typeof t === 'string')
          : [];
        setConfig({
          ...existingConfig,
          triggers
        });
      } else {
        setConfig(prev => ({ ...prev, organization_id: member.organization_id }));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config.id) {
        const { error } = await supabase
          .from('lead_distribution_configs')
          .update(config)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lead_distribution_configs')
          .insert(config);

        if (error) throw error;
      }

      toast({
        title: "Configuração salva",
        description: "As configurações da roleta foram atualizadas com sucesso.",
      });

      loadConfig();
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

  const toggleTrigger = (trigger: string) => {
    setConfig(prev => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter(t => t !== trigger)
        : [...prev.triggers, trigger]
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Carregando configurações...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configuração da Roleta de Leads
          </CardTitle>
          <CardDescription>
            Configure como os leads serão distribuídos automaticamente entre os agentes da sua equipe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status da Roleta */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Ativar Roleta</Label>
              <p className="text-sm text-muted-foreground">
                Habilita a distribuição automática de leads
              </p>
            </div>
            <Switch
              id="is_active"
              checked={config.is_active}
              onCheckedChange={(checked) => setConfig({ ...config, is_active: checked })}
            />
          </div>

          <Separator />

          {/* Método de Distribuição */}
          <div className="space-y-2">
            <Label htmlFor="distribution_method">Método de Distribuição</Label>
            <Select
              value={config.distribution_method}
              onValueChange={(value) => setConfig({ ...config, distribution_method: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">
                  <div>
                    <div className="font-medium">Round-robin (Rotativo)</div>
                    <div className="text-xs text-muted-foreground">Distribui sequencialmente em ordem circular</div>
                  </div>
                </SelectItem>
                <SelectItem value="weighted">
                  <div>
                    <div className="font-medium">Ponderado por Prioridade</div>
                    <div className="text-xs text-muted-foreground">Baseado no peso/prioridade de cada agente</div>
                  </div>
                </SelectItem>
                <SelectItem value="load_based">
                  <div>
                    <div className="font-medium">Baseado em Carga</div>
                    <div className="text-xs text-muted-foreground">Prioriza agentes com menos leads ativos</div>
                  </div>
                </SelectItem>
                <SelectItem value="random">
                  <div>
                    <div className="font-medium">Aleatório</div>
                    <div className="text-xs text-muted-foreground">Distribui aleatoriamente entre agentes disponíveis</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Gatilhos de Distribuição */}
          <div className="space-y-3">
            <Label>Gatilhos de Distribuição</Label>
            <p className="text-sm text-muted-foreground">
              Selecione quando a roleta deve distribuir leads automaticamente
            </p>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="trigger_new_lead"
                  checked={config.triggers.includes('new_lead')}
                  onCheckedChange={() => toggleTrigger('new_lead')}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="trigger_new_lead" className="font-medium cursor-pointer">
                    Leads novos (qualquer fonte)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui automaticamente quando um lead entra no sistema
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="trigger_whatsapp"
                  checked={config.triggers.includes('whatsapp')}
                  onCheckedChange={() => toggleTrigger('whatsapp')}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="trigger_whatsapp" className="font-medium cursor-pointer">
                    Leads de WhatsApp
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando leads chegam via WhatsApp
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="trigger_facebook"
                  checked={config.triggers.includes('facebook')}
                  onCheckedChange={() => toggleTrigger('facebook')}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="trigger_facebook" className="font-medium cursor-pointer">
                    Leads de Facebook Lead Ads
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando leads chegam via formulários do Facebook
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="trigger_webhook"
                  checked={config.triggers.includes('webhook')}
                  onCheckedChange={() => toggleTrigger('webhook')}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="trigger_webhook" className="font-medium cursor-pointer">
                    Leads de Webhooks (Formulários Externos)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando leads chegam via integração de webhooks
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Redistribuição Automática */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto_redistribute">Redistribuição Automática</Label>
                <p className="text-sm text-muted-foreground">
                  Redistribui leads se o agente não responder em tempo hábil
                </p>
              </div>
              <Switch
                id="auto_redistribute"
                checked={config.auto_redistribute}
                onCheckedChange={(checked) => setConfig({ ...config, auto_redistribute: checked })}
              />
            </div>

            {config.auto_redistribute && (
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (minutos)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min="1"
                  value={config.redistribution_timeout_minutes}
                  onChange={(e) => setConfig({ ...config, redistribution_timeout_minutes: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  Tempo máximo para o agente responder antes da redistribuição automática
                </p>
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