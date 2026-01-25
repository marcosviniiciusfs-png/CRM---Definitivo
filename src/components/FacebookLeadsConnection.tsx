import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Facebook, CheckCircle, AlertCircle, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FunnelSelector } from "@/components/FunnelSelector";


interface LeadForm {
  id: string;
  name: string;
  status: string;
  leads_count: number;
}

export const FacebookLeadsConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [checkingTokens, setCheckingTokens] = useState(false);

  useEffect(() => {
    checkConnection();
    
    // Check if returning from successful OAuth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('facebook') === 'success') {
      toast.success('Facebook conectado com sucesso!');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Show form selector after successful connection
      setTimeout(() => fetchLeadForms(), 1000);
    } else if (urlParams.get('facebook') === 'error') {
      const errorMessage = urlParams.get('message') || 'Erro ao conectar com Facebook';
      toast.error(errorMessage);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkConnection = async () => {
    try {
      setCheckingTokens(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Usar função mascarada que não retorna tokens
      const { data, error } = await supabase.rpc('get_facebook_integrations_masked');

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Facebook connection:', error);
        return;
      }

      const integrationData = data?.[0];

      if (integrationData && integrationData.page_id) {
        setIsConnected(true);
        setIntegration(integrationData);
        
        // Verificar integridade dos tokens
        const { data: orgData } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (orgData) {
          const { data: tokenCheck } = await supabase.rpc('get_facebook_tokens_secure', {
            p_organization_id: orgData.organization_id
          });
          
          // Se não há tokens na tabela segura E o token principal é placeholder, precisa reconectar
          const hasSecureTokens = tokenCheck && tokenCheck.length > 0 && tokenCheck[0].encrypted_access_token;
          
          if (!hasSecureTokens) {
            // Verificar se tem token legado válido
            const { data: legacyCheck } = await supabase
              .from('facebook_integrations')
              .select('access_token')
              .eq('organization_id', orgData.organization_id)
              .single();
            
            if (!legacyCheck?.access_token || legacyCheck.access_token === 'ENCRYPTED_IN_TOKENS_TABLE') {
              setNeedsReconnect(true);
            }
          }
        }
      } else if (integrationData) {
        setIsConnected(false);
        setIntegration(integrationData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setCheckingTokens(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Você precisa estar autenticado');
        return;
      }

      // Get user's organization
      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error('Organização não encontrada');
        return;
      }

      // Call edge function to initiate OAuth
      const { data, error } = await supabase.functions.invoke('facebook-oauth-initiate', {
        body: {
          user_id: user.id,
          organization_id: orgData.organization_id,
        },
      });

      if (error) throw error;

      // Redirect to Facebook OAuth
      window.location.href = data.auth_url;

    } catch (error) {
      console.error('Error initiating Facebook OAuth:', error);
      toast.error('Erro ao conectar com Facebook');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!integration) return;

    try {
      const { error } = await supabase
        .from('facebook_integrations')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;

      setIsConnected(false);
      setIntegration(null);
      setShowSuccess(false);
      toast.success('Facebook desconectado com sucesso');
    } catch (error) {
      console.error('Error disconnecting Facebook:', error);
      toast.error('Erro ao desconectar Facebook');
    }
  };

  const fetchLeadForms = async () => {
    if (!integration) {
      toast.error('Integração não encontrada. Reconecte ao Facebook.');
      return;
    }
    
    if (!integration.page_id) {
      toast.error('Página não configurada. Por favor, reconecte ao Facebook.');
      return;
    }

    setLoadingForms(true);
    try {
      // Buscar organization_id do usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error('Organização não encontrada');
        return;
      }

      // Enviar apenas organization_id - tokens serão buscados de forma segura no servidor
      const { data, error } = await supabase.functions.invoke('facebook-list-lead-forms', {
        body: {
          organization_id: orgData.organization_id,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setLeadForms(data.forms || []);
      setShowFormSelector(true);
    } catch (error) {
      console.error('Error fetching lead forms:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar formulários de lead');
    } finally {
      setLoadingForms(false);
    }
  };

  const handleFormSelect = async (form: LeadForm) => {
    setSubscribing(true);
    try {
      // Buscar organization_id do usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const { data: orgData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) {
        toast.error('Organização não encontrada');
        return;
      }

      const { error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          form_id: form.id,
          form_name: form.name,
          integration_id: integration.id,
          organization_id: orgData.organization_id,
        },
      });

      if (error) throw error;

      toast.success(`Webhook inscrito para "${form.name}"!`);
      setShowFormSelector(false);
      setShowSuccess(true);
      await checkConnection();
    } catch (error) {
      console.error('Error subscribing webhook:', error);
      toast.error('Erro ao inscrever webhook');
    } finally {
      setSubscribing(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'webhook' | 'token') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'webhook') {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
      toast.success('Copiado!');
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-600" />
            Facebook Leads
          </CardTitle>
          <CardDescription>
            Conecte sua conta do Facebook para receber leads automaticamente das suas campanhas de anúncios
          </CardDescription>
        </CardHeader>
      <CardContent className="space-y-4">
        {showSuccess && isConnected && !needsReconnect && (
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-sm text-green-800 dark:text-green-200">
              <strong>Conexão estabelecida!</strong> Agora configure o webhook no Facebook para começar a receber leads.
            </AlertDescription>
          </Alert>
        )}

        {needsReconnect && (
          <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Reconexão necessária!</strong> Os tokens de acesso expiraram ou estão inválidos. 
              Por favor, desconecte e reconecte sua conta do Facebook para restaurar a funcionalidade.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            {isConnected && !needsReconnect ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : needsReconnect ? (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">Status da Conexão</p>
              <p className="text-sm text-muted-foreground">
                {needsReconnect 
                  ? 'Reconexão necessária' 
                  : isConnected 
                    ? `Conectado - ${integration?.page_name || 'Página configurada'}` 
                    : 'Não conectado'}
              </p>
              {isConnected && integration?.selected_form_name && !needsReconnect && (
                <p className="text-xs text-muted-foreground mt-1">
                  Formulário: {integration.selected_form_name}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isConnected && !integration?.selected_form_id && !needsReconnect && (
              <Button onClick={fetchLeadForms} disabled={loadingForms} variant="outline">
                {loadingForms ? 'Carregando...' : 'Selecionar Formulário'}
              </Button>
            )}
            {isConnected ? (
              <Button variant="destructive" onClick={handleDisconnect}>
                Desconectar
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Facebook className="h-4 w-4" />
                {loading ? 'Conectando...' : 'Conectar ao Facebook'}
              </Button>
            )}
          </div>
        </div>

        {!isConnected && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">Como funciona:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Conecte sua conta do Facebook Business</li>
              <li>Configure o webhook (instruções aparecerão após conexão)</li>
              <li>Leads serão automaticamente importados para as seções Leads e Pipeline</li>
              <li>Cada lead virá com a fonte "Facebook Leads"</li>
            </ul>
          </div>
        )}

        {isConnected && integration && integration.selected_form_id && (
          <div className="space-y-3">
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <p className="font-medium text-sm text-green-800 dark:text-green-200">✅ Tudo Configurado!</p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Os leads do formulário <strong>"{integration.selected_form_name}"</strong> aparecerão automaticamente nas seções <strong>Leads</strong> e <strong>Pipeline</strong> com a fonte "Facebook Leads".
              </p>
            </div>
            <FunnelSelector sourceType="facebook" />
          </div>
        )}

        {/* Form Selection Dialog */}
        <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Selecione o Formulário de Lead</DialogTitle>
              <DialogDescription>
                Escolha qual formulário do Facebook você deseja monitorar para receber leads automaticamente
              </DialogDescription>
            </DialogHeader>
            
            {loadingForms ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : leadForms.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>Nenhum formulário de lead encontrado nesta página.</p>
                <p className="text-sm mt-2">Crie um formulário no Facebook Ads Manager primeiro.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {leadForms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => handleFormSelect(form)}
                    disabled={subscribing}
                    className="w-full p-4 border rounded-lg hover:bg-accent hover:border-primary transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{form.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">ID: {form.id}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                            {form.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {form.leads_count || 0} leads
                          </span>
                        </div>
                      </div>
                      {subscribing && (
                        <Loader2 className="h-5 w-5 animate-spin text-primary ml-4" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};