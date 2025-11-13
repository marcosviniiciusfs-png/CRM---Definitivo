import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, Clock, LogOut, Trash2 } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";

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

  // Verificar status de todas as instâncias na Evolution API
  const checkAllInstancesStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: instances } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('user_id', user.id);

      if (!instances || instances.length === 0) return;

      console.log('Verificando status de', instances.length, 'instâncias...');

      // Verificar o status de cada instância na Evolution API
      for (const instance of instances) {
        try {
          const { data, error } = await supabase.functions.invoke('check-whatsapp-status', {
            body: { instance_name: instance.instance_name },
          });

          if (error) {
            console.error(`Erro ao verificar status da instância ${instance.instance_name}:`, error);
          } else {
            console.log(`Status verificado para ${instance.instance_name}:`, data);
          }
        } catch (err) {
          console.error(`Erro ao verificar instância ${instance.instance_name}:`, err);
          // Continuar verificando outras instâncias mesmo se uma falhar
        }
      }

      // Recarregar as instâncias após verificar os status
      await loadInstances();
    } catch (error) {
      console.error('Erro ao verificar status das instâncias:', error);
      // Não mostrar toast de erro aqui, pois é uma verificação em background
    }
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

      console.log('✅ Instância criada com sucesso:', data);

      // CRÍTICO: Se a resposta contém o QR Code, abrir dialog IMEDIATAMENTE
      if (data.instance && data.instance.qrCode) {
        console.log('🚀 QR Code recebido na resposta, abrindo dialog imediatamente');
        
        // Criar objeto de instância temporário para exibir no dialog
        const tempInstance: WhatsAppInstance = {
          id: data.instance.id,
          instance_name: data.instance.instanceName,
          status: data.instance.status || 'WAITING_QR',
          qr_code: data.instance.qrCode,
          phone_number: null,
          created_at: new Date().toISOString(),
          connected_at: null,
        };
        
        setSelectedInstance(tempInstance);
        setQrDialogOpen(true);
        
        toast({
          title: "QR Code pronto!",
          description: "Escaneie o código para conectar seu WhatsApp.",
        });
      } else {
        toast({
          title: "Instância criada!",
          description: "O QR Code será exibido em alguns segundos.",
        });
      }

      // Recarregar instâncias (o realtime também fará isso)
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
    const initializeInstances = async () => {
      await loadInstances();
      // Verificar status de todas as instâncias na Evolution API após carregar
      await checkAllInstancesStatus();
    };

    initializeInstances();

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

      <Card className="border-muted max-w-xl mx-auto">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <img src={whatsappLogo} alt="WhatsApp" className="h-8 w-8" />
            WhatsApp Business/Pessoal
          </CardTitle>
          <CardDescription className="text-xs text-center pt-1">
            Conecte seu WhatsApp para enviar e receber mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-2">
        <div className="text-center py-2">
          {/* Verificar se existe instância conectada */}
          {instances.some(instance => instance.status === 'CONNECTED') ? (
            /* Botão Desconectar - exibido apenas quando há instância conectada */
            instances
              .filter(instance => instance.status === 'CONNECTED')
              .map((instance) => (
                <Button
                  key={instance.id}
                  onClick={() => disconnectInstance(instance.id)}
                  disabled={disconnecting === instance.id}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  size="sm"
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
              ))
          ) : (
            /* Botão Conectar - exibido quando não há instância conectada */
            <Button
              onClick={createInstance}
              disabled={creating}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              {creating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Criando instância...
                </>
              ) : (
                <>
                  <MessageSquare className="h-3 w-3 mr-2" />
                  Conectar WhatsApp
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
};

export default WhatsAppConnection;
