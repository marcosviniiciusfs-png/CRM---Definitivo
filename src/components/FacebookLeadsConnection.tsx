import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Facebook, CheckCircle, AlertCircle, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const FacebookLeadsConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    checkConnection();
    
    // Check if returning from successful OAuth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('facebook') === 'success') {
      setShowSuccess(true);
      toast.success('Facebook conectado com sucesso!');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('facebook_integrations')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Facebook connection:', error);
        return;
      }

      if (data) {
        setIsConnected(true);
        setIntegration(data);
      }
    } catch (error) {
      console.error('Error:', error);
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
          <Facebook className="h-5 w-5 text-primary" />
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
              <strong>Conexão estabelecida!</strong> Agora configure o webhook no Facebook para começar a receber leads.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">Status da Conexão</p>
              <p className="text-sm text-muted-foreground">
                {isConnected ? `Conectado - ${integration?.page_name || 'Página configurada'}` : 'Não conectado'}
              </p>
            </div>
          </div>
          {isConnected ? (
            <Button variant="destructive" onClick={handleDisconnect}>
              Desconectar
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={loading} className="gap-2">
              <Facebook className="h-4 w-4" />
              {loading ? 'Conectando...' : 'Conectar ao Facebook'}
            </Button>
          )}
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

        {isConnected && integration && (
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-primary/5 space-y-3">
              <p className="font-medium text-sm">📋 Passo 1: Configuração do Webhook no Facebook</p>
              
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <strong>URL do Webhook:</strong>
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-xs break-all">
                    https://uvwanpztskkhzdqifbai.supabase.co/functions/v1/facebook-leads-webhook
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => copyToClipboard('https://uvwanpztskkhzdqifbai.supabase.co/functions/v1/facebook-leads-webhook', 'webhook')}
                  >
                    {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <strong>Token de Verificação:</strong>
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-xs">
                    kairoz_webhook_verify_token
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => copyToClipboard('kairoz_webhook_verify_token', 'token')}
                  >
                    {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
              <p className="font-medium text-sm">📝 Passo 2: Configurar no Facebook</p>
              <ol className="text-xs text-muted-foreground space-y-2 ml-4 list-decimal">
                <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Facebook Developers</a></li>
                <li>Vá em <strong>Produtos → Webhooks</strong></li>
                <li>Selecione <strong>Página</strong> como objeto</li>
                <li>Clique em <strong>Assinar este objeto</strong></li>
                <li>Cole a URL do Webhook e o Token de Verificação</li>
                <li>Marque o campo <strong>leadgen</strong></li>
                <li>Clique em <strong>Verificar e Salvar</strong></li>
              </ol>
            </div>

            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
              <p className="font-medium text-sm text-green-800 dark:text-green-200">✅ Pronto!</p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Após configurar, todos os leads dos seus formulários do Facebook aparecerão automaticamente nas seções <strong>Leads</strong> e <strong>Pipeline</strong> com a fonte "Facebook Leads".
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};