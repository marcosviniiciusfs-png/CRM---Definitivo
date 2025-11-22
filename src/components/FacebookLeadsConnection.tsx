import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Facebook, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const FacebookLeadsConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState<any>(null);

  useEffect(() => {
    checkConnection();
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
      toast.success('Facebook desconectado com sucesso');
    } catch (error) {
      console.error('Error disconnecting Facebook:', error);
      toast.error('Erro ao desconectar Facebook');
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
        
        <div className="text-sm text-muted-foreground space-y-2">
          <p className="font-medium">Como funciona:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Conecte sua conta do Facebook Business</li>
            <li>Selecione as páginas e formulários de lead</li>
            <li>Leads serão automaticamente importados para o CRM</li>
            <li>Receba notificações em tempo real de novos leads</li>
          </ul>
        </div>

        {isConnected && integration && (
          <div className="p-4 border rounded-lg bg-primary/5 space-y-2">
            <p className="font-medium text-sm">Configuração do Webhook:</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><strong>URL do Webhook:</strong></p>
              <code className="block p-2 bg-background rounded break-all">
                https://uvwanpztskkhzdqifbai.supabase.co/functions/v1/facebook-leads-webhook
              </code>
              <p className="mt-2"><strong>Token de Verificação:</strong></p>
              <code className="block p-2 bg-background rounded">
                kairoz_webhook_verify_token
              </code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};