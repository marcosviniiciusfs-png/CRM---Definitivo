import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, Clock } from "lucide-react";

interface QRCodeData {
  instance: string;
  pairingCode: string | null;
  code: string;
  base64: string;
}

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  qr_code: QRCodeData | string | null;
  phone_number: string | null;
  created_at: string;
  connected_at: string | null;
}

const WhatsAppConnection = () => {
  const { toast } = useToast();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [qrCodeErrors, setQrCodeErrors] = useState<Record<string, boolean>>({});

  // Carregar instâncias do usuário
  const loadInstances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('Usuário não autenticado');
        return;
      }

      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar instâncias:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as instâncias WhatsApp",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Criar nova instância
  const createInstance = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-whatsapp-instance', {
        body: {},
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao criar instância');
      }

      toast({
        title: "Instância criada!",
        description: "O QR Code será exibido em alguns segundos.",
      });

      // Recarregar instâncias
      await loadInstances();
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a instância",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // Configurar Realtime para atualizar automaticamente
  useEffect(() => {
    loadInstances();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('whatsapp_instances_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
        },
        (payload) => {
          console.log('Realtime update:', payload);
          loadInstances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'DISCONNECTED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'CREATING':
      case 'WAITING_QR':
      case 'CONNECTING':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      CONNECTED: { label: "Conectado", variant: "default" },
      DISCONNECTED: { label: "Desconectado", variant: "destructive" },
      CREATING: { label: "Criando...", variant: "secondary" },
      WAITING_QR: { label: "Aguardando QR Code", variant: "outline" },
      CONNECTING: { label: "Conectando...", variant: "secondary" },
    };

    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Conexão WhatsApp
        </CardTitle>
        <CardDescription>
          Conecte seu WhatsApp para enviar e receber mensagens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {instances.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
            <div>
              <p className="text-lg font-medium">Nenhuma instância conectada</p>
              <p className="text-sm text-muted-foreground">
                Clique no botão abaixo para conectar seu WhatsApp
              </p>
            </div>
            <Button onClick={createInstance} disabled={creating} size="lg">
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando instância...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Conectar WhatsApp
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="border rounded-lg p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(instance.status)}
                    <div>
                      <p className="font-medium">
                        {instance.phone_number || instance.instance_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Criado em {new Date(instance.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(instance.status)}
                </div>

                {/* Exibir QR Code quando disponível */}
                {(instance.status === 'WAITING_QR' || instance.status === 'CREATING' || instance.status === 'DISCONNECTED') && instance.qr_code && (() => {
                  // Extrair o base64 do QR code
                  let qrCodeBase64 = '';
                  
                  try {
                    if (typeof instance.qr_code === 'string') {
                      // Se for string, pode ser base64 puro ou já ter o prefixo
                      qrCodeBase64 = instance.qr_code.startsWith('data:image')
                        ? instance.qr_code
                        : `data:image/png;base64,${instance.qr_code}`;
                    } else if (typeof instance.qr_code === 'object') {
                      // Verificar se tem o formato aninhado { _type, value }
                      const qrData: any = instance.qr_code;
                      
                      if (qrData._type === 'String' && qrData.value) {
                        // Parse do JSON dentro de value
                        const parsed = JSON.parse(qrData.value);
                        qrCodeBase64 = parsed.base64 || '';
                      } else if (qrData.base64) {
                        // Formato direto com base64
                        qrCodeBase64 = qrData.base64;
                      } else if (qrData.value && typeof qrData.value === 'string') {
                        // Tentar parse direto do value
                        try {
                          const parsed = JSON.parse(qrData.value);
                          qrCodeBase64 = parsed.base64 || '';
                        } catch {
                          qrCodeBase64 = qrData.value;
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Erro ao processar QR Code:', error, instance.qr_code);
                  }

                  if (!qrCodeBase64) return null;

                  return (
                    <div className="bg-muted rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <QrCode className="h-4 w-4" />
                        Escaneie o QR Code no WhatsApp
                      </div>
                      {!qrCodeErrors[instance.id] ? (
                        <div className="flex justify-center bg-white p-4 rounded-lg">
                          <img
                            src={qrCodeBase64}
                            alt="QR Code WhatsApp"
                            className="w-64 h-64"
                            onError={(e) => {
                              console.error('Erro ao carregar QR Code:', qrCodeBase64.substring(0, 100));
                              setQrCodeErrors(prev => ({ ...prev, [instance.id]: true }));
                            }}
                            onLoad={() => {
                              console.log('QR Code carregado com sucesso');
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-center bg-white p-4 rounded-lg">
                          <div className="w-64 h-64 flex items-center justify-center">
                            <div className="text-center space-y-2">
                              <XCircle className="h-12 w-12 mx-auto text-destructive" />
                              <p className="text-sm text-muted-foreground">
                                Falha ao carregar a imagem
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setQrCodeErrors(prev => ({ ...prev, [instance.id]: false }));
                                  loadInstances();
                                }}
                              >
                                Tentar novamente
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-center text-muted-foreground">
                        Abra o WhatsApp no seu celular e escaneie este código
                      </p>
                    </div>
                  );
                })()}

                {/* Mostrar informações quando conectado */}
                {instance.status === 'CONNECTED' && instance.phone_number && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        WhatsApp conectado com sucesso!
                      </span>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                      Número: {instance.phone_number}
                    </p>
                    {instance.connected_at && (
                      <p className="text-xs text-green-600/70 dark:text-green-500/70 mt-1">
                        Conectado em {new Date(instance.connected_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}

                {/* Mostrar aviso quando desconectado */}
                {instance.status === 'DISCONNECTED' && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        WhatsApp desconectado
                      </span>
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-1">
                      Clique no botão abaixo para reconectar
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3"
                      onClick={createInstance}
                      disabled={creating}
                    >
                      {creating ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Reconectando...
                        </>
                      ) : (
                        'Reconectar'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {/* Botão para adicionar nova instância se todas estiverem conectadas */}
            {instances.every(i => i.status === 'CONNECTED') && (
              <Button 
                onClick={createInstance} 
                disabled={creating} 
                variant="outline"
                className="w-full"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando nova instância...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Adicionar nova instância
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppConnection;
