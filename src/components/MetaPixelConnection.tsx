import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Activity, Eye, EyeOff, CheckCircle } from "lucide-react";
import { LoadingAnimation } from "./LoadingAnimation";

interface MetaPixelConnectionProps {
  onBack: () => void;
}

interface PixelIntegration {
  id: string;
  pixel_id: string;
  access_token: string;
  is_active: boolean;
  created_at: string;
}

export const MetaPixelConnection = ({ onBack }: MetaPixelConnectionProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integration, setIntegration] = useState<PixelIntegration | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
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

      // Load existing integration (one per org)
      const { data: integrationData } = await supabase
        .from('meta_pixel_integrations')
        .select('id, pixel_id, access_token, is_active, created_at')
        .eq('organization_id', orgData.organization_id)
        .maybeSingle();

      setIntegration(integrationData);
      
      if (integrationData) {
        setPixelId(integrationData.pixel_id);
        setAccessToken(integrationData.access_token);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organizationId || !pixelId || !accessToken) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      if (integration) {
        // Update existing
        const { error } = await supabase
          .from('meta_pixel_integrations')
          .update({
            pixel_id: pixelId,
            access_token: accessToken,
          })
          .eq('id', integration.id);

        if (error) throw error;
        toast.success("Pixel atualizado com sucesso!");
      } else {
        // Create new
        const { error } = await supabase
          .from('meta_pixel_integrations')
          .insert({
            organization_id: organizationId,
            pixel_id: pixelId,
            access_token: accessToken,
            is_active: true,
          });

        if (error) throw error;
        toast.success("Pixel configurado com sucesso!");
      }

      setIsEditing(false);
      loadData();
    } catch (error) {
      console.error('Error saving integration:', error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!integration) return;
    
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

  const handleDelete = async () => {
    if (!integration) return;
    if (!confirm("Tem certeza que deseja remover esta integração?")) return;

    try {
      const { error } = await supabase
        .from('meta_pixel_integrations')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;

      toast.success("Integração removida");
      setIntegration(null);
      setPixelId("");
      setAccessToken("");
    } catch (error) {
      console.error('Error deleting integration:', error);
      toast.error("Erro ao remover integração");
    }
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
          <Button variant="ghostIcon" size="icon" onClick={onBack}>
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
          </ol>
          <div className="mt-3 p-3 bg-primary/10 rounded-md border border-primary/20">
            <p className="text-primary font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Funciona em todos os funis
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              O evento de conversão será disparado automaticamente quando um lead entrar em qualquer etapa de "Ganho" em qualquer funil.
            </p>
          </div>
        </div>

        {/* Existing integration or form */}
        {integration && !isEditing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Pixel Configurado</span>
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
                  onCheckedChange={handleToggleActive}
                />
                <Button
                  variant="ghostIcon"
                  size="icon"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="w-full"
            >
              Editar Configuração
            </Button>
          </div>
        ) : (
          <div className="space-y-4 border rounded-lg p-4">
            <h4 className="font-medium">
              {integration ? "Editar Configuração" : "Nova Configuração"}
            </h4>

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
                  variant="ghostIcon"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              {(integration || isEditing) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    if (integration) {
                      setPixelId(integration.pixel_id);
                      setAccessToken(integration.access_token);
                    }
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
