import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Facebook, CheckCircle, AlertCircle, Copy, Check, Loader2, X } from "lucide-react";
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
  // Track which form IDs already have a funnel_source_mapping configured
  const [configuredFormIds, setConfiguredFormIds] = useState<Set<string>>(new Set());
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

        const popupRedirectUri = `${window.location.origin}${window.location.pathname}`;

        const payload = hasOAuthParams
          ? { code, state, redirect_uri: popupRedirectUri }
          : { facebook: fbStatus, message: urlParams.get('message') };

        try {
          window.opener.postMessage({
            type: 'FACEBOOK_OAUTH_RESPONSE',
            payload
          }, window.location.origin);

          if (hasFbStatus) {
            setTimeout(() => window.close(), 1000);
          }
        } catch (e) {
          console.error('❌ [FB-CONN] Erro ao enviar mensagem para opener:', e);
          if (hasOAuthParams) {
            handleOauthCallback(code!, state!, popupRedirectUri);
          }
        }
        return;
      }

      if (code && state && !isPopup) {
        const directRedirectUri = `${window.location.origin}${window.location.pathname}`;
        handleOauthCallback(code, state, directRedirectUri);
        return;
      }

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

          checkConnection().then(data => {
            if (data && data.page_id) {
              console.log('🔄 [FB-CONN] Dados sincronizados. Abrindo seletor...');
              setTimeout(() => {
                fetchLeadForms(data);
                toast.info("Carregando seus formulários...");
              }, 1000);
            } else {
              console.warn('⚠️ [FB-CONN] Dados não encontrados imediatamente. Re-tentando...');
              setTimeout(() => {
                checkConnection().then(retryData => {
                  if (retryData) fetchLeadForms(retryData);
                });
              }, 2000);
            }
          });
        } else if (code && state) {
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

      if (!organizationId) return null;

      // Usar a RPC get_facebook_integrations_masked que:
      // 1. Já computa needs_reconnect server-side (acessa token table com service_role)
      // 2. Filtra pela org do usuário autenticado (RLS segura)
      // 3. Evita leitura direta de facebook_integration_tokens (pode ter RLS restrita)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_facebook_integrations_masked');

      if (rpcError) {
        console.warn('⚠️ [FB-CONN] RPC get_facebook_integrations_masked falhou, tentando query direta:', rpcError.message);
        // Fallback: query direta na tabela principal (sem verificação de token)
        const { data: directData } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (directData?.page_id) {
          setIsConnected(true);
          setIntegration(directData);
          // Sem acesso ao campo needs_reconnect, assumir que token está OK
          setNeedsReconnect(false);
          return directData;
        }
        return null;
      }

      // Filtrar pela org correta na resposta da RPC
      const integrationRow = (rpcData || []).find(
        (r: any) => r.organization_id === organizationId
      ) || rpcData?.[0];

      if (integrationRow?.page_id) {
        setIsConnected(true);
        // Buscar detalhes completos (a RPC retorna campos mascarados)
        const { data: fullData } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        const intData = fullData || integrationRow;
        setIntegration(intData);
        // needs_reconnect vem do servidor — fonte mais confiável
        setNeedsReconnect(!!integrationRow.needs_reconnect);
        return intData;
      } else if (integrationRow) {
        setIsConnected(false);
        setIntegration(integrationRow);
        return integrationRow;
      }

      return null;
    } catch (error) {
      console.error('Error in checkConnection:', error);
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

      const frontendRedirectUri = `${window.location.origin}/integrations`;
      console.log('🚀 [FB-CONN] Iniciando fluxo para org:', organizationId);

      setOauthRedirectUri(frontendRedirectUri);

      const { data, error } = await supabase.functions.invoke('facebook-oauth-initiate', {
        body: {
          user_id: user.id,
          organization_id: organizationId,
          origin: window.location.origin,
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
          window.location.href = data.auth_url;
          return;
        }

        const checkPopup = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopup);
            setTimeout(() => setLoading(false), 2000);
          }
        }, 1000);

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
      setNeedsReconnect(false);
      setConfiguredFormIds(new Set());
      toast.success('Facebook desconectado com sucesso');
    } catch (error) {
      console.error('Error disconnecting Facebook:', error);
      toast.error('Erro ao desconectar Facebook');
    }
  };

  const fetchLeadForms = async (integrationData?: any | null) => {
    let activeIntegration = integrationData || integration;

    if (!activeIntegration || !activeIntegration.page_id) {
      console.log('🔄 [FB-CONN] Dados incompletos no fetch. Tentando re-sincronizar...');
      activeIntegration = await checkConnection();
    }

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
      if (!organizationId) {
        toast.error('Organização não identificada');
        return;
      }

      console.log('Fetching forms for integration:', activeIntegration.id, 'page:', activeIntegration.page_id);

      const { data, error } = await supabase.functions.invoke('facebook-list-lead-forms', {
        body: {
          organization_id: organizationId,
          integration_id: activeIntegration.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const forms: LeadForm[] = data.forms || [];
      setLeadForms(forms);
      setShowFormSelector(true);

      // Garantir que o webhook de página está subscrito (uma vez apenas)
      if (activeIntegration && !activeIntegration.webhook_verified) {
        subscribePageWebhook();
      }

      // Carregar quais formulários já têm mapeamento de funil configurado
      // Filtra apenas source_identifier não-nulo para contar só mapeamentos de formulários reais
      if (forms.length > 0 && organizationId) {
        const formIds = forms.map((f: LeadForm) => f.id);
        const { data: orgFunnels } = await supabase
          .from('sales_funnels')
          .select('id')
          .eq('organization_id', organizationId);
        const funnelIds = (orgFunnels || []).map((f: any) => f.id);
        if (funnelIds.length > 0) {
          const { data: mappings } = await supabase
            .from('funnel_source_mappings')
            .select('source_identifier')
            .eq('source_type', 'facebook')
            .not('source_identifier', 'is', null)
            .in('source_identifier', formIds)
            .in('funnel_id', funnelIds);
          const configured = new Set((mappings || []).map((m: any) => m.source_identifier as string));
          setConfiguredFormIds(configured);
        }
      }
    } catch (error) {
      console.error('Error fetching lead forms:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar formulários de lead');
    } finally {
      setLoadingForms(false);
    }
  };

  // Subscribes the PAGE-level webhook (needed only once per connection).
  const subscribePageWebhook = async () => {
    if (!integration || !organizationId) return;
    setSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          integration_id: integration.id,
          organization_id: organizationId,
        },
      });
      if (error) throw new Error('O servidor demorou a responder. Verifique sua conexão e tente novamente.');
      if (data?.error) throw new Error(data.error);
    } catch (error) {
      console.error('Error subscribing page webhook:', error);
      toast.error('Erro ao ativar webhook da página');
    } finally {
      setSubscribing(false);
    }
  };

  // Called when user configures a funnel for a form — marks it as configured
  const handleFormConfigured = (formId: string) => {
    setConfiguredFormIds(prev => new Set([...prev, formId]));
  };

  // Called when user removes a funnel mapping for a form
  const handleFormRemoved = (formId: string) => {
    setConfiguredFormIds(prev => {
      const next = new Set(prev);
      next.delete(formId);
      return next;
    });
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
              <strong>Conexão estabelecida!</strong> Configure o funil de destino para cada formulário abaixo.
            </AlertDescription>
          </Alert>
        )}

        {needsReconnect && (
          <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
              <span>
                <strong>Reconexão necessária.</strong> O token de acesso expirou.
                Desconecte e reconecte para restaurar o acesso.
              </span>
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
                    ? `Conectado — ${integration?.page_name || 'Página configurada'}`
                    : 'Não conectado'}
              </p>
              {isConnected && configuredFormIds.size > 0 && !needsReconnect && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {configuredFormIds.size} formulário{configuredFormIds.size !== 1 ? 's' : ''} ativo{configuredFormIds.size !== 1 ? 's' : ''} no CRM
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {/* Mostrar "Gerenciar" mesmo quando needsReconnect = true para facilitar diagnóstico */}
            {isConnected && (
              <Button
                onClick={() => fetchLeadForms()}
                disabled={loadingForms}
                variant="outline"
              >
                {loadingForms ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...</>
                ) : 'Gerenciar Formulários'}
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
              <li>Configure um funil de destino para cada formulário desejado</li>
              <li>Múltiplos formulários podem receber leads simultaneamente</li>
              <li>Cada lead virá com a fonte "Facebook Leads"</li>
            </ul>
          </div>
        )}

        {isConnected && integration && configuredFormIds.size > 0 && !needsReconnect && (
          <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <p className="font-medium text-sm text-green-800 dark:text-green-200">✅ Tudo Configurado!</p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              {configuredFormIds.size} formulário{configuredFormIds.size !== 1 ? 's' : ''} ativo{configuredFormIds.size !== 1 ? 's' : ''} — os leads aparecerão automaticamente nas seções <strong>Leads</strong> e <strong>Pipeline</strong>.
            </p>
          </div>
        )}
      </CardContent>

      {/* Form Selection Dialog */}
      <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formulários de Lead</DialogTitle>
            <DialogDescription>
              Configure um funil de destino para cada formulário. Formulários configurados receberão leads automaticamente.
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
            <>
              {/* Resumo: ativos no CRM vs total na página */}
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>
                    <strong className="text-foreground">{configuredFormIds.size}</strong> ativo{configuredFormIds.size !== 1 ? 's' : ''} no CRM
                    {' '}·{' '}
                    <strong className="text-foreground">{leadForms.length}</strong> formulário{leadForms.length !== 1 ? 's' : ''} na página do Facebook
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {leadForms.map((form) => {
                  const isConfigured = configuredFormIds.has(form.id);

                  return (
                    <div
                      key={form.id}
                      className={cn(
                        "w-full p-4 border rounded-lg transition-all",
                        isConfigured
                          ? "border-green-400 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{form.name}</p>
                            {isConfigured && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                                <CheckCircle className="h-3 w-3" />
                                Ativo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">ID: {form.id}</p>
                          <div className="flex items-center gap-4 mt-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${form.status === 'ACTIVE'
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
                      </div>

                      {/* FunnelSelector com suporte a remoção */}
                      <div className="mt-3 pt-3 border-t border-dashed">
                        <FunnelSelector
                          sourceType="facebook"
                          sourceIdentifier={form.id}
                          organizationId={organizationId}
                          className="mt-0 bg-transparent border-none p-0"
                          onMappingChange={() => handleFormConfigured(form.id)}
                          onMappingRemoved={() => handleFormRemoved(form.id)}
                        />
                        {!isConfigured && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                            Selecione um funil acima para ativar o recebimento de leads deste formulário.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
