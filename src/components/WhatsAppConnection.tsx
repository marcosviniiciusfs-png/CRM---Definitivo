import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, Clock, LogOut, Trash2 } from "lucide-react";

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
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [qrCodeErrors, setQrCodeErrors] = useState<Record<string, boolean>>({});
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);

  // Função para cancelar/deletar instância
  const cancelInstance = async (instanceId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId);

      if (error) throw error;

      toast({
        title: "Conexão cancelada",
        description: "A instância WhatsApp foi removida",
      });

      await loadInstances();
    } catch (error: any) {
      console.error('Erro ao cancelar instância:', error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a instância",
        variant: "destructive",
      });
    }
  };

  // Função para fechar o dialog
  const handleCloseDialog = async () => {
    if (selectedInstance && (selectedInstance.status === 'WAITING_QR' || selectedInstance.status === 'CREATING')) {
      await cancelInstance(selectedInstance.id);
    }
    setQrDialogOpen(false);
    setSelectedInstance(null);
  };

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
      // Validar se credenciais estão configuradas
      const { data: config } = await supabase
        .from('app_config')
        .select('config_value')
        .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY']);

      const hasUrl = config?.some(c => c.config_value && c.config_value.trim().length > 0);
      const hasKey = config?.some(c => c.config_value && c.config_value.trim().length > 0);

      if (!hasUrl || !hasKey || (config && config.length < 2)) {
        toast({
          title: "Credenciais não configuradas",
          description: "As credenciais da Evolution API não estão configuradas. Entre em contato com o administrador do sistema.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

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

  // Desconectar instância
  const disconnectInstance = async (instanceId: string) => {
    setDisconnecting(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke('disconnect-whatsapp-instance', {
        body: { instanceId },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao desconectar instância');
      }

      toast({
        title: "WhatsApp desconectado",
        description: "A instância foi desconectada com sucesso.",
      });

      // Recarregar instâncias
      await loadInstances();
    } catch (error: any) {
      console.error('Erro ao desconectar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível desconectar a instância",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(null);
    }
  };

  // Deletar instância
  const deleteInstance = async (instanceId: string) => {
    setDeleting(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke('delete-whatsapp-instance', {
        body: { instanceId },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao deletar instância');
      }

      toast({
        title: "Instância removida",
        description: "A instância foi deletada com sucesso.",
      });

      // Recarregar instâncias
      await loadInstances();
    } catch (error: any) {
      console.error('Erro ao deletar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível deletar a instância",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
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

  // Abrir dialog automaticamente quando houver QR Code
  useEffect(() => {
    const instanceWithQR = instances.find(
      (i) => (i.status === 'WAITING_QR' || i.status === 'CREATING') && i.qr_code
    );
    
    if (instanceWithQR && !qrDialogOpen) {
      setSelectedInstance(instanceWithQR);
      setQrDialogOpen(true);
    }
  }, [instances, qrDialogOpen]);

  // Fechar dialog automaticamente quando a instância conectar
  useEffect(() => {
    if (qrDialogOpen && selectedInstance) {
      const currentInstance = instances.find(i => i.id === selectedInstance.id);
      if (currentInstance?.status === 'CONNECTED') {
        setQrDialogOpen(false);
        setSelectedInstance(null);
        toast({
          title: "WhatsApp conectado!",
          description: `Conectado com sucesso ao número ${currentInstance.phone_number || 'WhatsApp'}`,
        });
      }
    }
  }, [instances, qrDialogOpen, selectedInstance, toast]);

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

  const renderQRCode = (instance: WhatsAppInstance) => {
    try {
      console.log('🔍 Processando QR Code:', { 
        id: instance.id, 
        status: instance.status,
        qrCodeType: typeof instance.qr_code,
        qrCodePreview: instance.qr_code ? JSON.stringify(instance.qr_code).substring(0, 200) : 'null'
      });

      let rawBase64 = '';
      
      // CASO 1: String direta (formato ideal)
      if (typeof instance.qr_code === 'string') {
        rawBase64 = instance.qr_code;
        console.log('✅ QR Code é string direta, comprimento:', rawBase64.length);
      } 
      // CASO 2: Objeto (pode vir do Supabase/Postgres)
      else if (instance.qr_code && typeof instance.qr_code === 'object') {
        const qrData: any = instance.qr_code;
        console.log('📦 QR Code é objeto, estrutura:', Object.keys(qrData));
        
        // Supabase às vezes retorna { _type: "String", value: "..." }
        if (qrData._type === 'String' && qrData.value) {
          rawBase64 = qrData.value;
          console.log('✅ Extraído de _type/value, comprimento:', rawBase64.length);
        }
        // Formato Evolution API: { base64: "data:image...", code: "...", pairingCode: null }
        else if (qrData.base64) {
          rawBase64 = qrData.base64;
          console.log('✅ Extraído de .base64, comprimento:', rawBase64.length);
        }
        // Fallback: tentar acessar .value diretamente
        else if (qrData.value) {
          rawBase64 = qrData.value;
          console.log('✅ Extraído de .value, comprimento:', rawBase64.length);
        }
      }

      // Validação: QR Code vazio
      if (!rawBase64 || rawBase64.trim().length === 0) {
        console.error('❌ QR Code vazio após extração');
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Aguardando QR Code...</p>
          </div>
        );
      }

      // Limpeza: remover prefixo data:image se já existir
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/i, '');
      
      // Validação: comprimento mínimo
      if (cleanBase64.length < 100) {
        console.error('❌ Base64 muito curto:', cleanBase64.length, 'caracteres');
        console.error('Conteúdo:', cleanBase64.substring(0, 100));
        return null;
      }

      // Construir data URL final
      const finalDataUrl = `data:image/png;base64,${cleanBase64}`;
      
      console.log('✅ QR Code pronto!', {
        originalLength: rawBase64.length,
        cleanLength: cleanBase64.length,
        finalLength: finalDataUrl.length,
        preview: finalDataUrl.substring(0, 100) + '...'
      });

      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="bg-white p-4 rounded-lg">
            <img
              src={finalDataUrl}
              alt="QR Code WhatsApp"
              className="w-64 h-64"
              onError={(e) => {
                console.error('❌ ERRO ao renderizar imagem QR Code');
                console.error('Data URL que falhou:', finalDataUrl.substring(0, 200));
                setQrCodeErrors(prev => ({ ...prev, [instance.id]: true }));
                toast({
                  title: "Erro ao carregar QR Code",
                  description: "Falha ao renderizar a imagem. Tente criar uma nova instância.",
                  variant: "destructive",
                });
              }}
              onLoad={() => {
                console.log('✅ QR Code renderizado com sucesso!');
              }}
            />
          </div>
          <p className="text-sm text-center text-muted-foreground">
            Abra o WhatsApp no seu celular e escaneie este código
          </p>
        </div>
      );
    } catch (error) {
      console.error('❌ ERRO CRÍTICO ao processar QR Code:', error);
      console.error('Dados recebidos:', instance.qr_code);
      return null;
    }
  };

  return (
    <>
      <Dialog open={qrDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseDialog();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com seu WhatsApp para conectar. Fechar esta janela cancelará a conexão.
            </DialogDescription>
          </DialogHeader>
          {selectedInstance && renderQRCode(selectedInstance)}
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleCloseDialog}
            >
              Cancelar Conexão
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

                {/* Botão para abrir QR Code manualmente */}
                {(instance.status === 'WAITING_QR' || instance.status === 'CREATING') && instance.qr_code && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedInstance(instance);
                      setQrDialogOpen(true);
                    }}
                    className="w-full"
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    Ver QR Code
                  </Button>
                )}

                {/* Mostrar informações quando conectado */}
                {instance.status === 'CONNECTED' && instance.phone_number && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        WhatsApp conectado com sucesso!
                      </span>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      Número: {instance.phone_number}
                    </p>
                    {instance.connected_at && (
                      <p className="text-xs text-green-600/70 dark:text-green-500/70">
                        Conectado em {new Date(instance.connected_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectInstance(instance.id)}
                        disabled={disconnecting === instance.id || deleting === instance.id}
                        className="flex-1"
                      >
                        {disconnecting === instance.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Desconectando...
                          </>
                        ) : (
                          <>
                            <LogOut className="h-3 w-3 mr-2" />
                            Desconectar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteInstance(instance.id)}
                        disabled={disconnecting === instance.id || deleting === instance.id}
                        className="flex-1"
                      >
                        {deleting === instance.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Deletando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3 mr-2" />
                            Remover
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Mostrar aviso quando desconectado ou status desconhecido */}
                {(instance.status === 'DISCONNECTED' || instance.status === 'UNKNOWN') && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {instance.status === 'UNKNOWN' ? 'Status desconhecido' : 'WhatsApp desconectado'}
                      </span>
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-500">
                      {instance.status === 'UNKNOWN' 
                        ? 'Esta instância está em um estado desconhecido. Remova e crie uma nova conexão.'
                        : 'Clique no botão abaixo para reconectar ou remover esta instância'
                      }
                    </p>
                    <div className="flex gap-2">
                      {instance.status === 'DISCONNECTED' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={createInstance}
                          disabled={creating || deleting === instance.id}
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
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteInstance(instance.id)}
                        disabled={creating || deleting === instance.id}
                        className="flex-1"
                      >
                        {deleting === instance.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Removendo...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3 mr-2" />
                            Remover Instância
                          </>
                        )}
                      </Button>
                    </div>
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
    </>
  );
};

export default WhatsAppConnection;
