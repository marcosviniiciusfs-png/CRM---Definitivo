import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, Activity, Eye, EyeOff } from "lucide-react";
import { LoadingAnimation } from "./LoadingAnimation";

interface MetaPixelConnectionProps {
  onBack: () => void;
}

interface PixelIntegration {
  id: string;
  funnel_id: string;
  pixel_id: string;
  access_token: string;
  is_active: boolean;
  created_at: string;
}

interface Funnel {
  id: string;
  name: string;
  icon: string | null;
}

export const MetaPixelConnection = ({ onBack }: MetaPixelConnectionProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrations, setIntegrations] = useState<PixelIntegration[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // Form state for new integration
  const [showForm, setShowForm] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [selectedFunnel, setSelectedFunnel] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      // Get organization
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;
      setOrganizationId(orgData.organization_id);

      // Load funnels
      const { data: funnelsData } = await supabase
        .from('sales_funnels')
        .select('id, name, icon')
        .eq('organization_id', orgData.organization_id)
        .eq('is_active', true)
        .order('name');

      setFunnels(funnelsData || []);

      // Load existing integrations
      const { data: integrationsData } = await supabase
        .from('meta_pixel_integrations')
        .select('*')
        .eq('organization_id', orgData.organization_id)
        .order('created_at', { ascending: false });

      setIntegrations(integrationsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organizationId || !pixelId || !accessToken || !selectedFunnel) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('meta_pixel_integrations')
        .insert({
          organization_id: organizationId,
          funnel_id: selectedFunnel,
          pixel_id: pixelId,
          access_token: accessToken,
          is_active: true,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Este funil já possui um Pixel configurado");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Pixel configurado com sucesso!");
      setShowForm(false);
      setPixelId("");
      setAccessToken("");
      setSelectedFunnel("");
      loadData();
    } catch (error) {
      console.error('Error saving integration:', error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (integration: PixelIntegration) => {
    try {
      const { error } = await supabase
        .from('meta_pixel_integrations')
        .update({ is_active: !integration.is_active })
        .eq('id', integration.id);

      if (error) throw error;

      toast.success(integration.is_active ? "Pixel desativado" : "Pixel ativado");
      loadData();
    } catch (error) {
      console.error('Error toggling integration:', error);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover esta integração?")) return;

    try {
      const { error } = await supabase
        .from('meta_pixel_integrations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Integração removida");
      loadData();
    } catch (error) {
      console.error('Error deleting integration:', error);
      toast.error("Erro ao remover integração");
    }
  };

  const getFunnelName = (funnelId: string) => {
    const funnel = funnels.find(f => f.id === funnelId);
    return funnel?.name || "Funil não encontrado";
  };

  const getAvailableFunnels = () => {
    const usedFunnelIds = integrations.map(i => i.funnel_id);
    return funnels.filter(f => !usedFunnelIds.includes(f.id));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingAnimation />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Meta Conversions API
            </CardTitle>
            <CardDescription>
              Envie eventos de conversão para o Meta Ads quando leads forem convertidos
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium">Como configurar:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Acesse o <strong>Events Manager</strong> da Meta</li>
            <li>Selecione seu Pixel e vá em <strong>Configurações</strong></li>
            <li>Na seção <strong>Conversions API</strong>, gere um Access Token</li>
            <li>Copie o Pixel ID e Access Token para cá</li>
            <li>Selecione qual funil disparará eventos de conversão</li>
          </ol>
        </div>

        {/* Existing integrations */}
        {integrations.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Pixels Configurados</h4>
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{getFunnelName(integration.funnel_id)}</span>
                    <Badge variant={integration.is_active ? "default" : "secondary"}>
                      {integration.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pixel ID: {integration.pixel_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={integration.is_active}
                    onCheckedChange={() => handleToggleActive(integration)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(integration.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new integration */}
        {!showForm ? (
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            disabled={getAvailableFunnels().length === 0}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            {getAvailableFunnels().length === 0 
              ? "Todos os funis já possuem Pixel configurado"
              : "Adicionar Pixel"
            }
          </Button>
        ) : (
          <div className="space-y-4 border rounded-lg p-4">
            <h4 className="font-medium">Nova Configuração</h4>
            
            <div className="space-y-2">
              <Label>Funil</Label>
              <Select value={selectedFunnel} onValueChange={setSelectedFunnel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableFunnels().map((funnel) => (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      {funnel.icon && <span className="mr-2">{funnel.icon}</span>}
                      {funnel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Eventos serão disparados quando leads entrarem na etapa "Ganho" deste funil
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pixel ID</Label>
              <Input
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="Ex: 123456789012345"
              />
            </div>

            <div className="space-y-2">
              <Label>Access Token (Conversions API)</Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Cole seu Access Token aqui"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setPixelId("");
                  setAccessToken("");
                  setSelectedFunnel("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
