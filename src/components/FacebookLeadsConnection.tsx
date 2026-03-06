import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Facebook, CheckCircle, AlertCircle, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FunnelSelector } from "@/components/FunnelSelector";
import { cn } from "@/lib/utils";
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
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [checkingTokens, setCheckingTokens] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  // Store the redirect_uri used during OAuth initiation so the callback uses the exact same one
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      // Check if we are inside a popup - more robust detection
      const hasOpener = !!window.opener;
      const isPopupByName = window.name === 'FacebookLoginPopup';
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const fbStatus = urlParams.get('facebook');
      const hasOAuthParams = !!(code && state);
      const hasFbStatus = !!fbStatus;

      const isPopup = hasOpener && (isPopupByName || hasOAuthParams || hasFbStatus);

      if (isPopup && (hasOAuthParams || hasFbStatus)) {
        console.log('🪟 [FB-CONN] Detectado ambiente de popup. Enviando mensagem ao pai...');

        // Build the redirect_uri that must match the one used during initiation.
        // The popup was opened pointing at the Facebook auth URL, which redirected back
        // to this same page URL (origin + pathname). We reconstruct it here.
        const popupRedirectUri = `${window.location.origin}${window.location.pathname}`;

        const payload = hasOAuthParams
          ? { code, state, redirect_uri: popupRedirectUri }
          : { facebook: fbStatus, message: urlParams.get('message') };

        try {
          // Send message to parent window
          window.opener.postMessage({
            type: 'FACEBOOK_OAUTH_RESPONSE',
            payload
          }, window.location.origin);

          // If backend already processed and redirected with ?facebook=success/error, close popup
          if (hasFbStatus) {
            setTimeout(() => window.close(), 1000);
          }
        } catch (e) {
          console.error('❌ [FB-CONN] Erro ao enviar mensagem para opener:', e);
          // Fallback: try to process locally if parent communication fails
          if (hasOAuthParams) {
            handleOauthCallback(code!, state!, popupRedirectUri);
          }
        }
        return;
      }

      // Se tivermos code/state e NÃO formos um popup, processamos normal (compatibilidade)
      if (code && state && !isPopup) {
        const directRedirectUri = `${window.location.origin}${window.location.pathname}`;
        handleOauthCallback(code, state, directRedirectUri);
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

    // Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'FACEBOOK_OAUTH_RESPONSE') {
        console.log('📬 [FB-CONN] Recebida resposta do popup:', event.data.payload);
        const { code, state, facebook, message, redirect_uri } = event.data.payload;

        if (facebook === 'success') {
          console.log('✅ [FB-CONN] Sucesso confirmado pelo popup. Sincronizando dados...');
          toast.success('Facebook conectado com sucesso!');

          // 1. Forçamos a verificação real dos dados que acabaram de ser salvos
          checkConnection().then(items => {
            if (items && items.length > 0) {
              console.log('🔄 [FB-CONN] Dados sincronizados. O usuário verá a lista atualizada.');
            } else {
              // Tentativa de segurança caso o banco demore a propagar (RLS/Cache)
              console.warn('⚠️ [FB-CONN] Dados não encontrados imediatamente. Re-tentando...');
              setTimeout(() => {
                checkConnection();
              }, 2000);
            }
          });
        } else if (code && state) {
          // Use the redirect_uri from the popup (which matches what Facebook received),
          // or fall back to the stored oauthRedirectUri from initiation
          const callbackRedirectUri = redirect_uri || oauthRedirectUri || `${window.location.origin}/integrations`;
          console.log('🔗 [FB-CONN] Usando redirect_uri para callback:', callbackRedirectUri);
          handleOauthCallback(code, state, callbackRedirectUri);
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

  const handleOauthCallback = async (code: string, state: string, redirectUri?: string) => {
    setLoading(true);
    console.log('🔄 [FB-CONN] Processando callback do Facebook...');
    toast.info('Finalizando conexão com Facebook...', { id: 'fb-connecting' });

    try {
      // CRITICAL: Use the same redirect_uri that was used in the OAuth initiation.
      // Priority: explicit parameter > stored from initiation > fallback to /integrations
      const finalRedirectUri = redirectUri || oauthRedirectUri || `${window.location.origin}/integrations`;
      console.log('🔗 [FB-CONN] Usando redirect_uri para troca:', finalRedirectUri);

      const { data, error } = await supabase.functions.invoke('facebook-oauth-callback', {
        body: {
          code,
          state,
          redirect_uri: finalRedirectUri
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log('✅ [FB-CONN] Sucesso! Resposta:', data);
      toast.success('Facebook conectado com sucesso!', { id: 'fb-connecting' });

      // Clean URL if there are query params (main window only)
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      const integrationData = await checkConnection();
      if (integrationData) {
        // Automatically show form selector after successful connection
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
      if (!user) return [];

      // 1. Tentar carregar dados das integrações
      let { data, error } = await supabase.rpc('get_facebook_integrations_masked');

      // Fallback: Se a RPC falhar ou não existir (404), tenta query direta na tabela
      if (error || !data || data.length === 0) {
        console.warn('⚠️ [FB-CONN] RPC falhou ou ausente, tentando query direta...');
        const { data: directData, error: directError } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId);

        if (!directError && directData) {
          data = directData;
          error = null;
        }
      }

      if (error) {
        console.error('Error checking Facebook connection:', error);
        return [];
      }

      // Filtrar integrações desta organização
      const orgIntegrations = data?.filter((item: any) => item.organization_id === organizationId) || [];

      if (orgIntegrations.length > 0) {
        setIsConnected(true);

        // Para cada integração, verificar separadamente se precisa de reconexão
        const integrationsWithStatus = await Promise.all(orgIntegrations.map(async (item: any) => {
          let needsReconnect = false;

          if (organizationId) {
            // Tentar buscar tokens seguros para esta integração específica
            const { data: tokenCheck } = await (supabase.rpc as any)('get_facebook_token_by_integration', {
              p_integration_id: item.id
            });

            let hasSecureTokens = tokenCheck && (tokenCheck as any[]).length > 0 && (tokenCheck as any[])[0].encrypted_access_token;

            // Fallback para query direta se a RPC falhar
            if (!hasSecureTokens) {
              const { data: directTokens } = await supabase
                .from('facebook_integration_tokens')
                .select('encrypted_access_token')
                .eq('integration_id', item.id)
                .maybeSingle();

              hasSecureTokens = !!directTokens?.encrypted_access_token;
            }

            needsReconnect = !hasSecureTokens;
          }

          return { ...item, needsReconnect };
        }));

        setIntegrations(integrationsWithStatus);
        return integrationsWithStatus;
      } else {
        setIsConnected(false);
        setIntegrations([]);
        return [];
      }
    } catch (error) {
      console.error('Error in checkConnection:', error);
      return [];
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

      // Let the Edge Function use the default Supabase callback URL as redirect_uri.
      // This is usually already whitelisted in the Facebook App.
      // We still store our frontend origin to handle the response later.
      const frontendRedirectUri = `${window.location.origin}/integrations`;
      console.log('🚀 [FB-CONN] Iniciando fluxo para org:', organizationId);

      setOauthRedirectUri(frontendRedirectUri);

      // Call edge function to initiate OAuth
      const { data, error } = await supabase.functions.invoke('facebook-oauth-initiate', {
        body: {
          user_id: user.id,
          organization_id: organizationId,
          origin: window.location.origin,
          // We don't send redirect_uri so the backend uses the default Supabase one
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

        // Open popup instead of redirecting the entire page
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
          // Fallback: redirect the page directly if popup is blocked
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

  const handleDisconnect = async (id: string) => {
    try {
      const { error } = await supabase
        .from('facebook_integrations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Facebook desconectado com sucesso');
      await checkConnection();
    } catch (error) {
      console.error('Error disconnecting Facebook:', error);
      toast.error('Erro ao desconectar Facebook');
    }
  };

  const fetchLeadForms = async (integrationObj: any) => {
    if (!integrationObj || !integrationObj.id || !integrationObj.page_id) {
      toast.error('Página não configurada corretamente. Por favor, reconecte ao Facebook.');
      return;
    }

    setSelectedIntegration(integrationObj);
    setLoadingForms(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      if (!organizationId) {
        toast.error('Organização não identificada');
        return;
      }

      console.log('Fetching forms for integration:', integrationObj.id, 'page:', integrationObj.page_id);

      // Enviar organization_id e integration_id
      const { data, error } = await supabase.functions.invoke('facebook-list-lead-forms', {
        body: {
          organization_id: organizationId,
          integration_id: integrationObj.id,
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

      console.log('📡 [FB-CONN] Inscrevendo webhook para:', form.name);

      const { data, error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          form_id: form.id,
          form_name: form.name,
          integration_id: selectedIntegration.id,
          organization_id: organizationId,
        },
      });

      if (error) {
        console.error('Invoke error:', error);
        throw new Error('O servidor de integração demorou a responder. Verifique sua conexão e tente novamente.');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

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
        {showSuccess && isConnected && (
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-sm text-green-800 dark:text-green-200">
              <strong>Conexão estabelecida!</strong> Agora escolha o formulário da página desejada abaixo.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end mb-2">
          <Button onClick={handleConnect} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Facebook className="h-4 w-4" />
            {loading ? 'Conectando...' : 'Conectar Nova Página'}
          </Button>
        </div>

        <div className="space-y-3">
          {checkingTokens && integrations.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : integrations.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
              <p className="text-muted-foreground italic">Nenhuma página do Facebook conectada.</p>
            </div>
          ) : (
            integrations.map((item) => (
              <div key={item.id} className="p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.needsReconnect ? (
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    <div>
                      <p className="font-semibold">{item.page_name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground">ID: {item.page_id}</p>
                      {item.needsReconnect ? (
                        <p className="text-xs text-amber-600 mt-1">Reconexão necessária</p>
                      ) : (
                        <p className="text-xs text-green-600 mt-1">Conectado e Ativo</p>
                      )}
                      {item.selected_form_name && (
                        <p className="text-xs font-medium text-blue-600 mt-1 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Form: {item.selected_form_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fetchLeadForms(item)}
                      disabled={loadingForms || item.needsReconnect}
                      className="text-xs h-8"
                    >
                      {item.selected_form_id ? 'Trocar Formulário' : 'Selecionar Formulário'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisconnect(item.id)}
                      className="text-xs h-8 text-destructive hover:bg-destructive/10"
                    >
                      Remover
                    </Button>
                  </div>
                </div>

                {item.selected_form_id && !item.needsReconnect && (
                  <div className="mt-4 pt-4 border-t border-dashed">
                    <FunnelSelector
                      sourceType="facebook"
                      sourceIdentifier={item.selected_form_id}
                      organizationId={organizationId}
                      className="bg-transparent border-none p-0 mt-0"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!isConnected && integrations.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2 mt-4 bg-muted/30 p-4 rounded-lg">
            <p className="font-medium">Como funciona:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Conecte sua conta do Facebook Business</li>
              <li>O sistema listará todas as páginas que você gerencia</li>
              <li>Para cada página, selecione o formulário que deseja monitorar</li>
              <li>Os leads serão importados automaticamente para o CRM</li>
            </ul>
          </div>
        )}
      </CardContent>

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
              {leadForms.map((form) => {
                const isSelected = selectedIntegration?.selected_form_id === form.id;

                return (
                  <div
                    key={form.id}
                    className={cn(
                      "w-full p-4 border rounded-lg transition-all",
                      isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted"
                    )}
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

                      {!isSelected ? (
                        <Button
                          onClick={() => handleFormSelect(form)}
                          disabled={subscribing}
                          size="sm"
                          className="ml-4"
                        >
                          {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Escolher"}
                        </Button>
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500 ml-4" />
                      )}
                    </div>

                    {/* Integrated Funnel Selector for the specific form */}
                    <div className="mt-4 pt-4 border-t border-dashed">
                      <FunnelSelector
                        sourceType="facebook"
                        sourceIdentifier={form.id}
                        organizationId={organizationId}
                        className="mt-0 bg-transparent border-none p-0"
                      />
                      {!isSelected && (
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                          * Configure o funil de destino antes ou depois de escolher o formulário.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};