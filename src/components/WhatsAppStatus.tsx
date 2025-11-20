import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";

export const WhatsAppStatus = () => {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [instanceName, setInstanceName] = useState<string>("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    getOrganizationId();
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    
    checkConnectionStatus();
    
    // Realtime updates
    const channel = supabase
      .channel('whatsapp-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances'
        },
        () => {
          checkConnectionStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const getOrganizationId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar organização:', error);
        setStatus('disconnected');
        return;
      }

      if (data?.organization_id) {
        setOrganizationId(data.organization_id);
      } else {
        console.warn('Usuário sem organização vinculada');
        setStatus('disconnected');
      }
    } catch (error) {
      console.error('Erro ao buscar organização:', error);
    }
  };

  const checkConnectionStatus = async () => {
    if (!organizationId) return;
    
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('status, instance_name')
        .eq('organization_id', organizationId)
        .eq('status', 'CONNECTED')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao verificar status:', error);
        setStatus('disconnected');
        return;
      }

      if (data) {
        setStatus('connected');
        setInstanceName(data.instance_name);
      } else {
        setStatus('disconnected');
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      setStatus('disconnected');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <img src={whatsappLogo} alt="WhatsApp" className="h-6 w-6" />
          Status da Conexão WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {status === 'loading' && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Verificando conexão...</span>
            </>
          )}
          {status === 'connected' && (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-foreground">WhatsApp Conectado</p>
                <p className="text-xs text-muted-foreground">Você pode enviar e receber mensagens normalmente</p>
              </div>
            </>
          )}
          {status === 'disconnected' && (
            <>
              <XCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-foreground">WhatsApp Desconectado</p>
                <p className="text-xs text-muted-foreground">Entre em contato com o administrador para conectar</p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
