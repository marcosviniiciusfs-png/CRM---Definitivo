import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface FacebookPage {
  id: string;
  name: string;
}

interface UseFacebookOAuthReturn {
  loading: boolean;
  oauthRedirectUri: string | null;
  availablePages: FacebookPage[];
  showPageSelector: boolean;
  pendingIntegrationId: string | null;
  switchingPage: boolean;
  handleConnect: () => Promise<void>;
  handleOauthCallback: (code: string, state: string, redirectUri?: string) => Promise<void>;
  handlePageSelect: (selectedPageId: string) => Promise<void>;
  setShowPageSelector: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useFacebookOAuth = (
  organizationId?: string,
  onConnectionSuccess?: (integrationData: any) => void
): UseFacebookOAuthReturn => {
  const [loading, setLoading] = useState(false);
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null);
  const [availablePages, setAvailablePages] = useState<FacebookPage[]>([]);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [pendingIntegrationId, setPendingIntegrationId] = useState<string | null>(null);
  const [switchingPage, setSwitchingPage] = useState(false);

  const handleOauthCallback = useCallback(async (code: string, state: string, redirectUri?: string) => {
    setLoading(true);
    logger.log('[FB-CONN] Processando callback do Facebook...');
    toast.info('Finalizando conexao com Facebook...', { id: 'fb-connecting' });

    try {
      const finalRedirectUri = redirectUri || oauthRedirectUri || `${window.location.origin}/integrations`;
      logger.log('[FB-CONN] Usando redirect_uri para troca:', finalRedirectUri);

      const { data, error } = await supabase.functions.invoke('facebook-oauth-callback', {
        body: {
          code,
          state,
          redirect_uri: finalRedirectUri
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      logger.log('[FB-CONN] Sucesso! Resposta:', data);
      toast.success('Facebook conectado com sucesso!', { id: 'fb-connecting' });

      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      // If multiple pages available, prompt user to select which one to use
      if (data?.available_pages && data.available_pages.length > 1) {
        logger.log('[FB-CONN] Multiple pages detected, showing page selector...');
        setPendingIntegrationId(data.integration_id);
        setAvailablePages(data.available_pages);
        setShowPageSelector(true);
      } else {
        // Notify parent of successful connection
        if (onConnectionSuccess) {
          onConnectionSuccess(data);
        }
      }
    } catch (err: any) {
      logger.error('[FB-CONN] Erro no callback:', err);
      toast.error(`Erro: ${err.message}`, { id: 'fb-connecting' });
      window.history.replaceState({}, '', window.location.pathname);
    } finally {
      setLoading(false);
    }
  }, [oauthRedirectUri, onConnectionSuccess]);

  const handleConnect = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    try {
      if (!organizationId) {
        toast.error('O ID da organizacao ainda nao foi carregado. Aguarde um momento.');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Voce precisa estar autenticado');
        setLoading(false);
        return;
      }

      const frontendRedirectUri = `${window.location.origin}/integrations`;
      logger.log('[FB-CONN] Iniciando fluxo para org:', organizationId);

      setOauthRedirectUri(frontendRedirectUri);

      const { data, error } = await supabase.functions.invoke('facebook-oauth-initiate', {
        body: {
          user_id: user.id,
          organization_id: organizationId,
          origin: window.location.origin,
        },
      });

      if (error) {
        logger.error('[FB-CONN] Erro na Edge Function:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.auth_url) {
        logger.log('[FB-CONN] Abrindo popup do Facebook...');

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
          toast.error('O bloqueador de popups impediu a conexao. Por favor, habilite popups para este site.');
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
        throw new Error('URL de autenticacao nao recebida do servidor.');
      }

    } catch (error) {
      logger.error('[FB-CONN] Erro ao iniciar:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao conectar com Facebook');
      setLoading(false);
    }
  }, [loading, organizationId]);

  const handlePageSelect = useCallback(async (selectedPageId: string) => {
    if (!pendingIntegrationId || !organizationId) return;
    setSwitchingPage(true);
    try {
      logger.log('[FB-CONN] Switching to page:', selectedPageId);
      const { data, error } = await supabase.functions.invoke('facebook-switch-page', {
        body: {
          integration_id: pendingIntegrationId,
          page_id: selectedPageId,
          organization_id: organizationId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      logger.log('[FB-CONN] Page switched to:', data.page_name);
      toast.success(`Pagina "${data.page_name}" selecionada!`);
      setShowPageSelector(false);
      setAvailablePages([]);
      setPendingIntegrationId(null);

      // Notify parent of successful page selection
      if (onConnectionSuccess) {
        onConnectionSuccess(data);
      }
    } catch (err: any) {
      logger.error('[FB-CONN] Error switching page:', err);
      toast.error(`Erro ao selecionar pagina: ${err.message}`);
    } finally {
      setSwitchingPage(false);
    }
  }, [pendingIntegrationId, organizationId, onConnectionSuccess]);

  // Setup message listener for popup communication
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'FACEBOOK_OAUTH_RESPONSE') {
        logger.log('[FB-CONN] Recebida resposta do popup:', event.data.payload);
        const { code, state, facebook, message, redirect_uri } = event.data.payload;

        if (facebook === 'success') {
          logger.log('[FB-CONN] Sucesso confirmado pelo popup. Sincronizando dados...');
          toast.success('Facebook conectado com sucesso!');

          if (onConnectionSuccess) {
            // Small delay to allow backend to sync
            setTimeout(() => {
              onConnectionSuccess(null);
            }, 1000);
          }
        } else if (code && state) {
          const callbackRedirectUri = redirect_uri || oauthRedirectUri || `${window.location.origin}/integrations`;
          logger.log('[FB-CONN] Usando redirect_uri para callback:', callbackRedirectUri);
          handleOauthCallback(code, state, callbackRedirectUri);
        } else if (facebook === 'error') {
          toast.error(message || 'Erro ao conectar com Facebook');
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [oauthRedirectUri, handleOauthCallback, onConnectionSuccess]);

  return {
    loading,
    oauthRedirectUri,
    availablePages,
    showPageSelector,
    pendingIntegrationId,
    switchingPage,
    handleConnect,
    handleOauthCallback,
    handlePageSelect,
    setShowPageSelector,
    setLoading,
  };
};
