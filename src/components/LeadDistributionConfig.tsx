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
  redistribution_timeout_minutes: number | null;
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
        title: "Roleta salva",
        description: "As configurações da roleta foram atualizadas.",
      });

      loadConfig();
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({
        title: "Não foi possível salvar a roleta",
        description: "Tente novamente.",
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
            Configuração da roleta de leads
          </CardTitle>
          <CardDescription>
            Configure como os leads são distribuídos automaticamente entre os colaboradores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status da Roleta */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Ativar roleta</Label>
              <p className="text-sm text-muted-foreground">
                Liga a distribuição automática de leads.
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
            <Label htmlFor="distribution_method">Método de distribuição</Label>
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
                    <div className="font-medium">Rodízio</div>
                    <div className="text-xs text-muted-foreground">Distribui em sequência, um colaborador por vez.</div>
                  </div>
                </SelectItem>
                <SelectItem value="weighted">
                  <div>
                    <div className="font-medium">Por prioridade</div>
                    <div className="text-xs text-muted-foreground">Leva em conta o peso de cada colaborador.</div>
                  </div>
                </SelectItem>
                <SelectItem value="load_based">
                  <div>
                    <div className="font-medium">Por carga</div>
                    <div className="text-xs text-muted-foreground">Prioriza colaboradores com menos leads ativos.</div>
                  </div>
                </SelectItem>
                <SelectItem value="random">
                  <div>
                    <div className="font-medium">Aleatório</div>
                    <div className="text-xs text-muted-foreground">Escolhe ao acaso entre os colaboradores disponíveis.</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Gatilhos de Distribuição */}
          <div className="space-y-3">
            <Label>Gatilhos de distribuição</Label>
            <p className="text-sm text-muted-foreground">
              Selecione quando a roleta distribui leads automaticamente.
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
                    Leads novos (qualquer origem)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando um lead entra no KairoZ.
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
                    Distribui quando o lead chega pelo WhatsApp.
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
                    Leads do Facebook Lead Ads
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando o lead chega por formulário do Facebook.
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
                    Leads de webhooks (formulários externos)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui quando o lead chega por webhook.
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
                <Label htmlFor="auto_redistribute">Redistribuição automática</Label>
                <p className="text-sm text-muted-foreground">
                  Redistribui o lead se o colaborador não responder a tempo.
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
                <Label htmlFor="timeout">Prazo (minutos)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min="1"
                  value={config.redistribution_timeout_minutes ?? 60}
                  onChange={(e) => setConfig({ ...config, redistribution_timeout_minutes: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  Tempo máximo para o colaborador responder antes da redistribuição.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar roleta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
