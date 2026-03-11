import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Facebook, CheckCircle, AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
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

interface SelectedForm {
  id: string;
  form_id: string;
  form_name: string;
  integration_id: string;
}

interface FacebookLeadsConnectionProps {
  organizationId?: string;
}

export const FacebookLeadsConnection = ({ organizationId }: FacebookLeadsConnectionProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [checkingTokens, setCheckingTokens] = useState(false);
  const [selectedForms, setSelectedForms] = useState<SelectedForm[]>([]);
  const [loadingSelectedForms, setLoadingSelectedForms] = useState(false);
  const [removingFormId, setRemovingFormId] = useState<string | null>(null);
  // Store the redirect_uri used during OAuth initiation so the callback uses the exact same one
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);

  const loadSelectedForms = useCallback(async (integrationId: string) => {
    setLoadingSelectedForms(true);
    try {
      const { data, error } = await supabase
        .from("facebook_selected_forms")
        .select("id, form_id, form_name, integration_id")
        .eq("integration_id", integrationId)
        .order("created_at");

      if (error) throw error;
      setSelectedForms(data || []);
    } catch (err) {
      console.error("Error loading selected forms:", err);
    } finally {
      setLoadingSelectedForms(false);
    }
  }, []);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let { data, error } = await supabase.rpc('get_facebook_integrations_masked');

      if (error || !data || data.length === 0) {
        console.warn('⚠️ [FB-CONN] RPC falhou ou ausente, tentando query direta...');
        const { data: directData, error: directError } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!directError && directData) {
          data = [directData];
          error = null;
        }
      }

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Facebook connection:', error);
        return null;
      }

      const integrationData = data?.find((item: any) => item.organization_id === organizationId) || data?.[0];

      if (integrationData && integrationData.page_id) {
        setIsConnected(true);
        setIntegration(integrationData);

        // Load selected forms for this integration
        await loadSelectedForms(integrationData.id);

        if (organizationId) {
          const { data: tokenCheck, error: tokenError } = await (supabase.rpc as any)('get_facebook_token_by_integration', {
            p_integration_id: integrationData.id
          });

          let hasSecureTokens = tokenCheck && (tokenCheck as any[]).length > 0 && (tokenCheck as any[])[0].encrypted_access_token;

          if (tokenError || !hasSecureTokens) {
            const { data: directTokens } = await supabase
              .from('facebook_integration_tokens')
              .select('encrypted_access_token')
              .eq('integration_id', integrationData.id)
              .maybeSingle();

            hasSecureTokens = !!directTokens?.encrypted_access_token;
          }

          setNeedsReconnect(!hasSecureTokens);
        }
        return integrationData;
      } else if (integrationData) {
        setIsConnected(false);
        setIntegration(integrationData);
        return integrationData;
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
      setSelectedForms([]);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

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

      setLeadForms(data.forms || []);
      setShowFormSelector(true);
    } catch (error) {
      console.error('Error fetching lead forms:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar formulários de lead');
    } finally {
      setLoadingForms(false);
    }
  };

  const handleFormAdd = async (form: LeadForm) => {
    // Check if already added
    if (selectedForms.some(sf => sf.form_id === form.id)) {
      toast.info(`O formulário "${form.name}" já está adicionado.`);
      return;
    }

    setSubscribing(form.id);
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

      if (!integration) {
        toast.error('Nenhuma integração ativa encontrada.');
        return;
      }

      console.log('📡 [FB-CONN] Adicionando formulário:', form.name);

      const { data, error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          form_id: form.id,
          form_name: form.name,
          integration_id: integration.id,
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

      toast.success(`Formulário "${form.name}" adicionado!`);

      // Reload selected forms to reflect the new entry
      await loadSelectedForms(integration.id);
      await checkConnection();
    } catch (error) {
      console.error('Error adding form:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar formulário');
    } finally {
      setSubscribing(null);
    }
  };

  const handleFormRemove = async (selectedForm: SelectedForm) => {
    setRemovingFormId(selectedForm.form_id);
    try {
      const { error } = await supabase
        .from('facebook_selected_forms')
        .delete()
        .eq('id', selectedForm.id);

      if (error) throw error;

      // Also clean up funnel_source_mappings for this form
      await supabase
        .from('funnel_source_mappings')
        .delete()
        .eq('source_type', 'facebook')
        .eq('source_identifier', selectedForm.form_id);

      setSelectedForms(prev => prev.filter(sf => sf.form_id !== selectedForm.form_id));
      toast.success(`Formulário "${selectedForm.form_name}" removido.`);
    } catch (err) {
      console.error('Error removing form:', err);
      toast.error('Erro ao remover formulário');
    } finally {
      setRemovingFormId(null);
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
        {needsReconnect && (
          <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Reconexão necessária!</strong> Os tokens de acesso expiraram ou estão inválidos.
              Por favor, desconecte e reconecte sua conta do Facebook para restaurar a funcionalidade.
            </AlertDescription>
          </Alert>
        )}

        {/* Connection status row */}
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
              {isConnected && !needsReconnect && selectedForms.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedForms.length} formulário{selectedForms.length > 1 ? 's' : ''} ativo{selectedForms.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isConnected && !needsReconnect && (
              <Button
                onClick={() => fetchLeadForms()}
                disabled={loadingForms}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                {loadingForms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {selectedForms.length === 0 ? 'Selecionar Formulário' : 'Adicionar Formulário'}
              </Button>
            )}
            {isConnected ? (
              <Button variant="destructive" size="sm" onClick={handleDisconnect}>
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
              <li>Adicione um ou mais formulários de lead</li>
              <li>Leads serão automaticamente importados para as seções Leads e Pipeline</li>
              <li>Cada formulário pode direcionar para um funil diferente</li>
            </ul>
          </div>
        )}

        {/* Active forms list */}
        {isConnected && !needsReconnect && (
          <div className="space-y-3">
            {loadingSelectedForms ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando formulários...
              </div>
            ) : selectedForms.length === 0 ? (
              <div className="p-4 border border-dashed rounded-lg text-center text-sm text-muted-foreground">
                Nenhum formulário adicionado ainda.<br />
                Clique em <strong>Selecionar Formulário</strong> para começar a receber leads.
              </div>
            ) : (
              <>
                <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <p className="font-medium text-sm text-green-800 dark:text-green-200">✅ Tudo Configurado!</p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                    Os leads dos formulários abaixo aparecerão automaticamente nas seções <strong>Leads</strong> e <strong>Pipeline</strong> com a fonte "Facebook Leads".
                  </p>
                </div>

                <div className="space-y-3">
                  {selectedForms.map((sf) => (
                    <div
                      key={sf.form_id}
                      className="border rounded-lg p-3 bg-muted/30 space-y-1"
                    >
                      {/* Form header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm leading-tight truncate">{sf.form_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">ID: {sf.form_id}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={() => handleFormRemove(sf)}
                          disabled={removingFormId === sf.form_id}
                          title="Remover formulário"
                        >
                          {removingFormId === sf.form_id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>

                      {/* Per-form funnel selector */}
                      <FunnelSelector
                        sourceType="facebook"
                        sourceIdentifier={sf.form_id}
                        organizationId={organizationId}
                        className="mt-2 bg-transparent border-none p-0"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Add Form Dialog */}
      <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Formulário de Lead</DialogTitle>
            <DialogDescription>
              Selecione um ou mais formulários do Facebook para receber leads automaticamente. Cada formulário pode ser direcionado a um funil diferente.
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
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {leadForms.map((form) => {
                const isAlreadyAdded = selectedForms.some(sf => sf.form_id === form.id);
                const isSubscribing = subscribing === form.id;

                return (
                  <div
                    key={form.id}
                    className={cn(
                      "w-full p-4 border rounded-lg transition-all",
                      isAlreadyAdded
                        ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{form.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">ID: {form.id}</p>
                        <div className="flex items-center gap-3 mt-2">
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

                      {isAlreadyAdded ? (
                        <div className="flex items-center gap-1.5 ml-3 text-green-600 dark:text-green-400 text-xs font-medium flex-shrink-0">
                          <CheckCircle className="h-4 w-4" />
                          Adicionado
                        </div>
                      ) : (
                        <Button
                          onClick={() => handleFormAdd(form)}
                          disabled={isSubscribing || !!subscribing}
                          size="sm"
                          className="ml-3 gap-1.5 flex-shrink-0"
                        >
                          {isSubscribing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Plus className="h-3.5 w-3.5" />
                          }
                          Adicionar
                        </Button>
                      )}
                    </div>

                    {/* Funnel selector per form (shown inline in dialog too) */}
                    <div className="mt-3 pt-3 border-t border-dashed">
                      <FunnelSelector
                        sourceType="facebook"
                        sourceIdentifier={form.id}
                        organizationId={organizationId}
                        className="mt-0 bg-transparent border-none p-0"
                      />
                      {!isAlreadyAdded && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                          * Você pode configurar o funil antes ou depois de adicionar o formulário.
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
