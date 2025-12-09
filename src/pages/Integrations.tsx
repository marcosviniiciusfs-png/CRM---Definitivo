import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link2, Copy, RefreshCw, Pencil, X, Check } from "lucide-react";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import { IntegrationsHub } from "@/components/IntegrationsHub";
import { GlobalFunnelMapping } from "@/components/GlobalFunnelMapping";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingAnimation } from "@/components/LoadingAnimation";

const Integrations = () => {
  const { user } = useAuth();
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);
  const [webhookConfig, setWebhookConfig] = useState<{ webhook_token: string; is_active: boolean; tag_id?: string | null } | null>(null);
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [webhookTagName, setWebhookTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [editingTag, setEditingTag] = useState(false);
  const [tempTagName, setTempTagName] = useState("");

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        const { data: orgData } = await supabase
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (orgData && (orgData.role === 'owner' || orgData.role === 'admin')) {
          const { data: webhookData } = await supabase
            .from('webhook_configs')
            .select('webhook_token, is_active, tag_id')
            .eq('organization_id', orgData.organization_id)
            .maybeSingle();

          if (webhookData) {
            setWebhookConfig(webhookData);
            
            if (webhookData.tag_id) {
              const { data: tagData } = await supabase
                .from('lead_tags')
                .select('name')
                .eq('id', webhookData.tag_id)
                .single();
              
              if (tagData) {
                setWebhookTagName(tagData.name);
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleCreateWebhook = async () => {
    if (!user) return;

    if (!webhookTagName.trim()) {
      toast.error("Digite um nome para a tag do webhook");
      return;
    }

    setLoadingWebhook(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      const { data: existingWebhook } = await supabase
        .from('webhook_configs')
        .select('webhook_token, is_active, tag_id')
        .eq('organization_id', orgData.organization_id)
        .maybeSingle();

      if (existingWebhook) {
        setWebhookConfig(existingWebhook);
        toast.success("Webhook já existe!");
        return;
      }

      const { data: tagData, error: tagError } = await supabase
        .from('lead_tags')
        .insert({
          name: webhookTagName,
          organization_id: orgData.organization_id,
          color: '#10b981'
        })
        .select('id')
        .single();

      if (tagError) throw tagError;

      const { data, error } = await supabase
        .from('webhook_configs')
        .insert({ 
          organization_id: orgData.organization_id,
          tag_id: tagData.id
        })
        .select('webhook_token, is_active, tag_id')
        .single();

      if (error) throw error;

      setWebhookConfig(data);
      toast.success("Webhook e tag criados com sucesso!");
    } catch (error: any) {
      console.error('Erro ao criar webhook:', error);
      toast.error("Erro ao criar webhook. Tente novamente.");
    } finally {
      setLoadingWebhook(false);
    }
  };

  const handleRegenerateWebhook = async () => {
    if (!user) return;

    setLoadingWebhook(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { data, error } = await supabase
        .from('webhook_configs')
        .update({ webhook_token: newToken })
        .eq('organization_id', orgData.organization_id)
        .select('webhook_token, is_active')
        .single();

      if (error) throw error;

      setWebhookConfig(data);
      toast.success("Token do webhook regenerado!");
    } catch (error: any) {
      console.error('Erro ao regenerar webhook:', error);
      toast.error("Erro ao regenerar webhook. Tente novamente.");
    } finally {
      setLoadingWebhook(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!webhookConfig) return;

    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhookConfig.webhook_token}`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada para a área de transferência!");
  };

  const handleSaveWebhookTag = async () => {
    if (!user || !webhookTagName.trim()) {
      toast.error("Digite um nome para a tag");
      return;
    }

    setSavingTag(true);
    try {
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      let tagId: string;
      
      if (webhookConfig?.tag_id) {
        const { error: updateError } = await supabase
          .from('lead_tags')
          .update({ name: webhookTagName })
          .eq('id', webhookConfig.tag_id);
        
        if (updateError) throw updateError;
        tagId = webhookConfig.tag_id;
        toast.success("Tag atualizada com sucesso!");
      } else {
        const { data: tagData, error: tagError } = await supabase
          .from('lead_tags')
          .insert({
            name: webhookTagName,
            organization_id: orgData.organization_id,
            color: '#10b981'
          })
          .select('id')
          .single();

        if (tagError) throw tagError;
        tagId = tagData.id;

        const { error: webhookError } = await supabase
          .from('webhook_configs')
          .update({ tag_id: tagId })
          .eq('organization_id', orgData.organization_id);

        if (webhookError) throw webhookError;

        setWebhookConfig(prev => prev ? { ...prev, tag_id: tagId } : null);
        toast.success("Tag criada e associada ao webhook!");
      }

      setEditingTag(false);
    } catch (error: any) {
      console.error('Erro ao salvar tag:', error);
      toast.error("Erro ao salvar tag. Tente novamente.");
    } finally {
      setSavingTag(false);
    }
  };

  const handleStartEditTag = () => {
    setTempTagName(webhookTagName);
    setEditingTag(true);
  };

  const handleCancelEditTag = () => {
    setWebhookTagName(tempTagName);
    setEditingTag(false);
  };

  if (!permissions.canManageIntegrations) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingAnimation text="Carregando integrações..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">Conecte e gerencie suas integrações com serviços externos</p>
      </div>

      <div className="space-y-6">
        <WhatsAppConnection />
        <IntegrationsHub />
        <FacebookLeadsConnection />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Webhook de Formulários
            </CardTitle>
            <CardDescription>
              Integre formulários externos (landing pages, sites) para criar leads automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!webhookConfig ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Crie um webhook para receber dados de formulários externos e criar leads automaticamente no CRM.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="webhook-tag">Nome da Tag</Label>
                  <Input
                    id="webhook-tag"
                    value={webhookTagName}
                    onChange={(e) => setWebhookTagName(e.target.value)}
                    placeholder="Ex: Landing Page, Site, Formulário"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Esta tag será aplicada automaticamente aos leads criados por este webhook
                  </p>
                </div>
                <Button 
                  onClick={handleCreateWebhook} 
                  disabled={loadingWebhook || !webhookTagName.trim()}
                  className="w-full"
                >
                  {loadingWebhook ? "Criando..." : "Criar Webhook"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tag para Identificação dos Leads</Label>
                  {webhookTagName && !editingTag ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-200 dark:border-green-800">
                        {webhookTagName}
                      </Badge>
                      <Button
                        variant="ghostIcon"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleStartEditTag}
                        title="Editar tag"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Aplicada automaticamente aos novos leads
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={webhookTagName}
                          onChange={(e) => setWebhookTagName(e.target.value)}
                          placeholder="Ex: Landing Page, Site, Formulário"
                          className="flex-1"
                        />
                        {editingTag ? (
                          <>
                            <Button 
                              variant="default"
                              size="icon"
                              onClick={handleSaveWebhookTag}
                              disabled={savingTag || !webhookTagName.trim()}
                              title="Salvar"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline"
                              size="icon"
                              onClick={handleCancelEditTag}
                              disabled={savingTag}
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button 
                            onClick={handleSaveWebhookTag}
                            disabled={savingTag || !webhookTagName.trim()}
                          >
                            {savingTag ? "Salvando..." : "Salvar"}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Configure uma tag para identificar automaticamente os leads criados por este webhook
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>URL do Webhook</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhookConfig.webhook_token}`}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={handleCopyWebhookUrl}
                      title="Copiar URL"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use esta URL como destino (action) do seu formulário. Envie dados via POST com os campos: <code className="px-1 py-0.5 bg-muted rounded">nome</code> e <code className="px-1 py-0.5 bg-muted rounded">telefone</code> (obrigatórios), <code className="px-1 py-0.5 bg-muted rounded">email</code>, <code className="px-1 py-0.5 bg-muted rounded">empresa</code>, <code className="px-1 py-0.5 bg-muted rounded">valor</code> (opcionais).
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleRegenerateWebhook}
                  disabled={loadingWebhook}
                  className="w-full"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingWebhook ? 'animate-spin' : ''}`} />
                  Regenerar Token
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <GlobalFunnelMapping />
      </div>
    </div>
  );
};

export default Integrations;
