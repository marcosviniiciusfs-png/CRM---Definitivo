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

interface FacebookLeadsConnectionProps {
  organizationId?: string;
}

export const FacebookLeadsConnection = ({ organizationId }: FacebookLeadsConnectionProps) => {
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
    const init = async () => {
      // Check if we are inside a popup
      const isPopup = window.opener && (window.name === 'FacebookLoginPopup' || window.location.search.includes('code='));

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const fbStatus = urlParams.get('facebook');

      if (isPopup && (code || state || fbStatus)) {
        console.log('🪟 [FB-CONN] Detectado ambiente de popup. Enviando mensagem ao pai...');
        const payload = code && state ? { code, state } : {
          facebook: fbStatus,
          message: urlParams.get('message')
        };

        try {
          // Tentar enviar mensagem ao pai
          window.opener.postMessage({
            type: 'FACEBOOK_OAUTH_RESPONSE',
            payload
          }, window.location.origin);

          // Se for via redirect de backend direto pro integracoes dentro do popup, fechamos logo
          if (fbStatus === 'success' || fbStatus === 'error') {
            setTimeout(() => window.close(), 1000);
          }
        } catch (e) {
          console.error('❌ [FB-CONN] Erro ao enviar mensagem para opener:', e);
        }
        return;
      }

      // Se tivermos code/state e NÃO formos um popup, processamos normal (compatibilidade)
      if (code && state && !isPopup) {
        handleOauthCallback(code, state);
        return;
      }

      // Fallback para flow antigo ou sucesso via redirecionamento de backend
      const integrationData = await checkConnection();

      if (fbStatus === 'success' && !isPopup) {
        toast.success('Facebook conectado com sucesso!');
        window.history.replaceState({}, '', window.location.pathname);
        if (integrationData) {
          setTimeout(() => fetchLeadForms(integrationData), 1000);
        }
      } else if (fbStatus === 'error' && !isPopup) {
        const errorMessage = urlParams.get('message') || 'Erro ao conectar com Facebook';
        toast.error(errorMessage);
        window.history.replaceState({}, '', window.location.pathname);
      }
    };

    // Escutar mensagens do popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'FACEBOOK_OAUTH_RESPONSE') {
        console.log('📬 [FB-CONN] Recebida resposta do popup:', event.data.payload);
        const { code, state, facebook, message } = event.data.payload;

        if (code && state) {
          handleOauthCallback(code, state);
        } else if (facebook === 'success') {
          toast.success('Facebook conectado com sucesso!');
          checkConnection().then(data => {
            if (data) setTimeout(() => fetchLeadForms(data), 500);
          });
        } else if (facebook === 'error') {
          toast.error(message || 'Erro ao conectar com Facebook');
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    init();

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [organizationId]);

  const handleOauthCallback = async (code: string, state: string) => {
    setLoading(true);
    console.log('🔄 [FB-CONN] Processando callback do Facebook...');
    toast.info('Finalizando conexão com Facebook...', { id: 'fb-connecting' });

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      console.log('🔗 [FB-CONN] Usando redirect_uri para troca:', redirectUri);

      const { data, error } = await supabase.functions.invoke('facebook-oauth-callback', {
        body: {
          code,
          state,
          redirect_uri: redirectUri
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log('✅ [FB-CONN] Sucesso! Resposta:', data);
      toast.success('Facebook conectado com sucesso!', { id: 'fb-connecting' });

      // Limpar URL se houver query params (janela principal apenas)
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      const integrationData = await checkConnection();
      if (integrationData) {
        setTimeout(() => fetchLeadForms(integrationData), 500);
      }
    } catch (err: any) {
      console.error('❌ [FB-CONN] Erro no callback:', err);
      toast.error(`Erro: ${err.message}`, { id: 'fb-connecting' });
      window.history.replaceState({}, '', window.location.pathname);
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    try {
      setCheckingTokens(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Usar função mascarada que não retorna tokens
      const { data, error } = await supabase.rpc('get_facebook_integrations_masked');

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Facebook connection:', error);
        return null;
      }

      const integrationData = data?.find((item: any) => item.organization_id === organizationId) || data?.[0];

      if (integrationData && integrationData.page_id) {
        setIsConnected(true);
        setIntegration(integrationData);

        // Verificar integridade dos tokens
        if (organizationId) {
          const { data: tokenCheck } = await supabase.rpc('get_facebook_tokens_secure', {
            p_organization_id: organizationId
          });

          // Se não há tokens na tabela segura E o token principal é placeholder, precisa reconectar
          const hasSecureTokens = tokenCheck && tokenCheck.length > 0 && tokenCheck[0].encrypted_access_token;

          if (!hasSecureTokens) {
            // Verificar se tem token legado válido
            const { data: legacyCheck } = await supabase
              .from('facebook_integrations')
              .select('access_token')
              .eq('organization_id', organizationId)
              .single();

            if (!legacyCheck?.access_token || legacyCheck.access_token === 'ENCRYPTED_IN_TOKENS_TABLE') {
              setNeedsReconnect(true);
            }
          }
        }
        return integrationData;
      } else if (integrationData) {
        setIsConnected(false);
        setIntegration(integrationData);
        return integrationData;
      }
      return null;
    } catch (error) {
      console.error('Error:', error);
      return null;
    } finally {
      setCheckingTokens(false);
    }
  };

  const handleConnect = async () => {
    if (loading) return;

    setLoading(true);
    try {
      if (!organizationId) {
        toast.error('O ID da organização ainda não foi carregado. Aguarde um momento.');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Você precisa estar autenticado');
        setLoading(false);
        return;
      }

      // Em produção, deixamos a Edge Function decidir o redirect_uri (padrão whitelisted)
      // No localhost, enviamos explicitamente para permitir desenv local.
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      console.log('🚀 [FB-CONN] Iniciando fluxo para org:', organizationId, isLocalhost ? '(Local)' : '(Produção)');

      // Call edge function to initiate OAuth
      const { data, error } = await supabase.functions.invoke('facebook-oauth-initiate', {
        body: {
          user_id: user.id,
          organization_id: organizationId,
          origin: window.location.origin,
          redirect_uri: isLocalhost ? `${window.location.origin}${window.location.pathname}` : undefined
        },
      });

      if (error) {
        console.error('❌ [FB-CONN] Erro na Edge Function:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.auth_url) {
        console.log('✅ [FB-CONN] Abrindo popup do Facebook...');

        // Abrir popup em vez de redirecionar a página inteira
        const width = 600;
        const height = 750;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          data.auth_url,
          'FacebookLoginPopup',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
        );

        if (!popup) {
          toast.error('O bloqueador de popups impediu a conexão. Por favor, habilite popups para este site.');
          // Fallback para redirecionamento direto se o popup falhar
          window.location.href = data.auth_url;
          return;
        }

        // Timer para resetar o status de loading se o usuário fechar a janela manualmente sem completar
        const checkPopup = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopup);
            // Sete timeout pequeno para não conflitar com sucesso
            setTimeout(() => setLoading(false), 2000);
          }
        }, 1000);

        // O listener de 'message' cuidará do resto

      } else {
        throw new Error('URL de autenticação não recebida do servidor.');
      }

    } catch (error) {
      console.error('❌ [FB-CONN] Erro ao iniciar:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar com Facebook');
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

  const fetchLeadForms = async (integrationData?: any) => {
    const activeIntegration = integrationData || integration;

    if (!activeIntegration) {
      toast.error('Integração não encontrada. Reconecte ao Facebook.');
      return;
    }

    if (!activeIntegration.page_id) {
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

      if (!organizationId) {
        toast.error('Organização não identificada');
        return;
      }

      // Enviar apenas organization_id - tokens serão buscados de forma segura no servidor
      const { data, error } = await supabase.functions.invoke('facebook-list-lead-forms', {
        body: {
          organization_id: organizationId,
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

      if (!organizationId) {
        toast.error('Organização não identificada');
        return;
      }

      const { error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          form_id: form.id,
          form_name: form.name,
          integration_id: integration.id,
          organization_id: organizationId,
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

  if (typeof window !== 'undefined' && window.opener && (window.location.search.includes('code=') || window.location.search.includes('facebook='))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold">Conectando ao Facebook</h2>
        <p className="text-muted-foreground mt-2">Sincronizando dados com a sua conta... Esta janela fechará automaticamente em instantes.</p>
      </div>
    );
  }

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
                    className="w-full p-4 border rounded-lg hover:bg-muted hover:border-primary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{form.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">ID: {form.id}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${form.status === 'ACTIVE'
                            ? "bg-green-500/20 text-green-600 dark:text-green-400"
                            : "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                            }`}>
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