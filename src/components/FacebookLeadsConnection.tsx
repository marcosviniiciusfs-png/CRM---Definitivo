import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Facebook, CheckCircle, AlertCircle, Loader2, Megaphone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { FunnelSelector } from "@/components/FunnelSelector";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useFacebookConnection } from "@/hooks/useFacebookConnection";
import { useFacebookOAuth } from "@/hooks/useFacebookOAuth";
import { useFacebookForms, LeadForm } from "@/hooks/useFacebookForms";

interface FacebookLeadsConnectionProps {
  organizationId?: string;
}

export const FacebookLeadsConnection = ({ organizationId }: FacebookLeadsConnectionProps) => {
  const [showSuccess, setShowSuccess] = useState(false);

  // Connection hook
  const {
    isConnected,
    activeIntegration,
    needsReconnect,
    checkingTokens,
    checkConnection,
    handleDisconnect,
  } = useFacebookConnection(organizationId);

  // Forms hook
  const {
    leadForms,
    loadingForms,
    showFormSelector,
    configuredFormIds,
    subscribing,
    fetchLeadForms,
    handleFormConfigured,
    handleFormRemoved,
    setShowFormSelector,
    subscribePageWebhook,
    resetConfiguredForms,
  } = useFacebookForms(organizationId);

  // Callback for successful OAuth connection
  const handleConnectionSuccess = useCallback((integrationData: any) => {
    setShowSuccess(true);
    if (integrationData) {
      setTimeout(() => fetchLeadForms(integrationData), 500);
    } else {
      // Re-check connection and then fetch forms
      checkConnection().then(data => {
        if (data) {
          setTimeout(() => fetchLeadForms(data), 500);
        }
      });
    }
  }, [checkConnection, fetchLeadForms]);

  // OAuth hook
  const {
    loading,
    availablePages,
    showPageSelector,
    switchingPage,
    handleConnect,
    handlePageSelect,
    setShowPageSelector: setOAuthPageSelector,
  } = useFacebookOAuth(organizationId, handleConnectionSuccess);

  // Handle disconnect with form reset
  const onDisconnect = async () => {
    await handleDisconnect();
    setShowSuccess(false);
    resetConfiguredForms();
  };

  // Initialize - check for OAuth callback and existing connection
  useEffect(() => {
    const init = async () => {
      // Check if we are inside a popup
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
        logger.log('[FB-CONN] Detectado ambiente de popup. Enviando mensagem ao pai...');

        const popupRedirectUri = `${window.location.origin}${window.location.pathname}`;

        const payload = hasOAuthParams
          ? { code, state, redirect_uri: popupRedirectUri }
          : { facebook: fbStatus, message: urlParams.get('message') };

        try {
          window.opener.postMessage({
            type: 'FACEBOOK_OAUTH_RESPONSE',
            payload
          }, window.location.origin);

          // Fechar popup após enviar mensagem (tanto para OAuth quanto para status)
          setTimeout(() => {
            logger.log('[FB-CONN] Fechando popup...');
            window.close();
          }, 500);
        } catch (e) {
          logger.error('[FB-CONN] Erro ao enviar mensagem para opener:', e);
        }
        return;
      }

      // Direct callback (not in popup)
      if (code && state && !isPopup) {
        // This will be handled by the useFacebookOAuth hook's message listener
        // or we can call it directly here for non-popup flows
        return;
      }

      // Check existing connection
      const integrationData = await checkConnection();

      // Auto-subscribe webhook when integration exists but webhook is not verified
      // This ensures leads start flowing even if user never opens "Gerenciar Formulários"
      if (integrationData && !integrationData.webhook_verified) {
        subscribePageWebhook(integrationData);
      }

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

    init();
  }, [organizationId, checkConnection, fetchLeadForms, subscribePageWebhook]);

  // Sync page selector state between hooks
  useEffect(() => {
    if (showPageSelector) {
      // When OAuth page selector is shown, check connection after dismissal
      const checkAndLoad = async () => {
        const data = await checkConnection();
        if (data) {
          setTimeout(() => fetchLeadForms(data), 500);
        }
      };
      // Return cleanup that will be called when dialog closes without selection
      return () => {
        if (!showPageSelector && availablePages.length > 0) {
          checkAndLoad();
        }
      };
    }
  }, [showPageSelector, checkConnection, fetchLeadForms, availablePages.length]);

  // Handle page selector close
  const handlePageSelectorClose = (open: boolean) => {
    setOAuthPageSelector(open);
    if (!open) {
      // If user dismisses without selecting, still load forms with default page
      checkConnection().then(data => {
        if (data) setTimeout(() => fetchLeadForms(data), 500);
      });
    }
  };

  // Popup detection for render
  if (typeof window !== 'undefined' && window.opener && (window.location.search.includes('code=') || window.location.search.includes('facebook='))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold">Conectando ao Facebook</h2>
        <p className="text-muted-foreground mt-2">Sincronizando dados com a sua conta... Esta janela fechara automaticamente em instantes.</p>
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
          Conecte sua conta do Facebook para receber leads automaticamente das suas campanhas de anuncios
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSuccess && isConnected && !needsReconnect && (
          <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-sm text-green-800 dark:text-green-200">
              <strong>Conexao estabelecida!</strong> Configure o funil de destino para cada formulario abaixo.
            </AlertDescription>
          </Alert>
        )}

        {needsReconnect && (
          <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
              <span>
                <strong>Reconexao necessaria.</strong> O token de acesso expirou.
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
              <p className="font-medium">Status da Conexao</p>
              <p className="text-sm text-muted-foreground">
                {needsReconnect
                  ? 'Reconexao necessaria'
                  : isConnected
                    ? `Conectado - ${activeIntegration?.page_name || 'Pagina configurada'}`
                    : 'Nao conectado'}
              </p>
              {isConnected && configuredFormIds.size > 0 && !needsReconnect && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {configuredFormIds.size} formulario{configuredFormIds.size !== 1 ? 's' : ''} ativo{configuredFormIds.size !== 1 ? 's' : ''} no CRM
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {/* Botao para ativar/reativar webhook - sempre visivel quando conectado */}
            {isConnected && !needsReconnect && activeIntegration && (
              <Button
                onClick={() => subscribePageWebhook(activeIntegration)}
                disabled={subscribing}
                variant={activeIntegration.webhook_verified ? 'ghost' : 'outline'}
                size="sm"
              >
                {subscribing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ativando...</>
                ) : activeIntegration.webhook_verified ? 'Webhook OK' : 'Ativar Webhook'}
              </Button>
            )}
            {/* Mostrar "Gerenciar" mesmo quando needsReconnect = true para facilitar diagnostico */}
            {isConnected && (
              <Button
                onClick={() => fetchLeadForms(activeIntegration)}
                disabled={loadingForms}
                variant="outline"
              >
                {loadingForms ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...</>
                ) : 'Gerenciar Formularios'}
              </Button>
            )}
            {isConnected ? (
              <Button variant="destructive" onClick={onDisconnect}>
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

        {/* Seção de Contas de Anúncios */}
        {isConnected && !needsReconnect && activeIntegration && (
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-orange-500" />
                <p className="font-medium text-sm">Contas de Anúncios</p>
              </div>
              <a
                href="/metrics?tab=campaigns"
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Ver métricas
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {activeIntegration.ad_accounts && Array.isArray(activeIntegration.ad_accounts) && activeIntegration.ad_accounts.length > 0 ? (
              <div className="space-y-2">
                {activeIntegration.ad_accounts.map((account: any) => (
                  <div
                    key={account.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded border text-sm",
                      account.id === activeIntegration.ad_account_id || `act_${account.id}` === activeIntegration.ad_account_id
                        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                        : "bg-background border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {(account.id === activeIntegration.ad_account_id || `act_${account.id}` === activeIntegration.ad_account_id) && (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      )}
                      <span className="font-medium">{account.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        account.status === 1
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      )}>
                        {account.status === 1 ? 'Ativa' : 'Pausada'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ID: {account.id?.replace('act_', '')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-3 bg-amber-50 dark:bg-amber-950 rounded border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 inline mr-2 text-amber-500" />
                Nenhuma conta de anúncios configurada. Acesse a aba <a href="/metrics?tab=campaigns" className="text-blue-600 hover:underline">Campanhas</a> para configurar.
              </div>
            )}
          </div>
        )}

        {!isConnected && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">Como funciona:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Conecte sua conta do Facebook Business</li>
              <li>Configure um funil de destino para cada formulario desejado</li>
              <li>Multiplos formularios podem receber leads simultaneamente</li>
              <li>Cada lead vira com a fonte "Facebook Leads"</li>
            </ul>
          </div>
        )}

        {isConnected && activeIntegration && configuredFormIds.size > 0 && !needsReconnect && (
          <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <p className="font-medium text-sm text-green-800 dark:text-green-200">Tudo Configurado!</p>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              {configuredFormIds.size} formulario{configuredFormIds.size !== 1 ? 's' : ''} ativo{configuredFormIds.size !== 1 ? 's' : ''} - os leads aparecerar automaticamente nas secoes <strong>Leads</strong> e <strong>Pipeline</strong>.
            </p>
          </div>
        )}
      </CardContent>

      {/* Page Selection Dialog - shown when multiple Facebook pages are available */}
      <Dialog open={showPageSelector} onOpenChange={handlePageSelectorClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecione a Pagina do Facebook</DialogTitle>
            <DialogDescription>
              Sua conta gerencia multiplas paginas. Escolha qual pagina sera usada para receber leads nesta organizacao.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {availablePages.map((page) => (
              <Button
                key={page.id}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                disabled={switchingPage}
                onClick={() => handlePageSelect(page.id)}
              >
                <Facebook className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
                {switchingPage && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Selection Dialog */}
      <Dialog open={showFormSelector} onOpenChange={setShowFormSelector}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formularios de Lead</DialogTitle>
            <DialogDescription>
              Configure um funil de destino para cada formulario. Formularios configurados receberao leads automaticamente.
            </DialogDescription>
          </DialogHeader>

          {loadingForms ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : leadForms.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>Nenhum formulario de lead encontrado nesta pagina.</p>
              <p className="text-sm mt-2">Crie um formulario no Facebook Ads Manager primeiro.</p>
            </div>
          ) : (
            <>
              {/* Resumo: ativos no CRM vs total na pagina */}
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>
                    <strong className="text-foreground">{configuredFormIds.size}</strong> ativo{configuredFormIds.size !== 1 ? 's' : ''} no CRM
                    {' '} - {' '}
                    <strong className="text-foreground">{leadForms.length}</strong> formulario{leadForms.length !== 1 ? 's' : ''} na pagina do Facebook
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {leadForms.map((form: LeadForm) => {
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

                      {/* FunnelSelector com suporte a remocao */}
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
                            Selecione um funil acima para ativar o recebimento de leads deste formulario.
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
