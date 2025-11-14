import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWhatsApp } from "@/contexts/WhatsAppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, Clock, LogOut, Trash2, RefreshCw } from "lucide-react";
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
  const { instances, loading: contextLoading, isConnected, refreshInstances, checkAndUpdateStatus } = useWhatsApp();
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [qrCodeErrors, setQrCodeErrors] = useState<Record<string, boolean>>({});
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);

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

      await refreshInstances();
    } catch (error: any) {
      console.error('Erro ao cancelar instância:', error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a instância",
        variant: "destructive",
      });
    }
  };

  const handleCloseDialog = async () => {
    if (selectedInstance && (selectedInstance.status === 'WAITING_QR' || selectedInstance.status === 'CREATING')) {
      await cancelInstance(selectedInstance.id);
    }
    setQrDialogOpen(false);
    setSelectedInstance(null);
  };

  const handleVerifyStatus = async () => {
    setVerifying(true);
    try {
      await checkAndUpdateStatus();
      toast({
        title: "Status atualizado",
        description: "O status da conexão foi verificado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível verificar o status",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  const createInstance = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-whatsapp-instance');

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao criar instância');
      }

      if (data.instance && data.instance.qrCode) {
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

      await refreshInstances();
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

      await refreshInstances();
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

      await refreshInstances();
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

  const openQrCode = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setQrDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONNECTED':
      case 'OPEN':
        return <Badge className="bg-success text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Conectado</Badge>;
      case 'WAITING_QR':
      case 'CREATING':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Aguardando</Badge>;
      case 'DISCONNECTED':
      case 'CLOSE':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderQrCode = () => {
    if (!selectedInstance || !selectedInstance.qr_code) return null;

    let qrData: QRCodeData | null = null;

    try {
      if (typeof selectedInstance.qr_code === 'string') {
        qrData = JSON.parse(selectedInstance.qr_code);
      } else {
        qrData = selectedInstance.qr_code;
      }
    } catch (error) {
      console.error('Erro ao processar QR code:', error);
      return (
        <div className="flex flex-col items-center gap-4 p-6">
          <XCircle className="h-16 w-16 text-destructive" />
          <p className="text-sm text-muted-foreground">Erro ao carregar QR Code</p>
        </div>
      );
    }

    if (!qrData || !qrData.base64) return null;

    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <img
          src={qrData.base64}
          alt="QR Code WhatsApp"
          className="w-64 h-64 border rounded-lg"
          onError={() => setQrCodeErrors({ ...qrCodeErrors, [selectedInstance.id]: true })}
        />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Escaneie com seu WhatsApp</p>
          <ol className="text-xs text-muted-foreground space-y-1">
            <li>1. Abra o WhatsApp no seu celular</li>
            <li>2. Toque em Mais opções → Aparelhos conectados</li>
            <li>3. Toque em Conectar um aparelho</li>
            <li>4. Aponte seu celular para esta tela</li>
          </ol>
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={whatsappLogo} alt="WhatsApp" className="h-8 w-8" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  Conexão WhatsApp
                  {isConnected && (
                    <Badge className="bg-success text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isConnected 
                    ? "Sua conta WhatsApp está conectada e pronta para uso"
                    : "Conecte sua conta WhatsApp para enviar e receber mensagens"}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyStatus}
              disabled={verifying || contextLoading}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Verificar Status
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {contextLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conexão WhatsApp configurada</p>
              <Button onClick={createInstance} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando Conexão...
                  </>
                ) : (
                  <>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Conectar WhatsApp
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance) => (
                <div
                  key={instance.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{instance.instance_name}</p>
                      {getStatusBadge(instance.status)}
                    </div>
                    {instance.phone_number && (
                      <p className="text-sm text-muted-foreground">
                        {instance.phone_number}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(instance.status === 'WAITING_QR' || instance.status === 'CREATING') && instance.qr_code && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openQrCode(instance)}
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        Ver QR Code
                      </Button>
                    )}
                    {(instance.status === 'CONNECTED' || instance.status === 'OPEN') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectInstance(instance.id)}
                        disabled={disconnecting === instance.id}
                      >
                        {disconnecting === instance.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="h-4 w-4 mr-2" />
                            Desconectar
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteInstance(instance.id)}
                      disabled={deleting === instance.id}
                    >
                      {deleting === instance.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code abaixo com seu WhatsApp para conectar
            </DialogDescription>
          </DialogHeader>
          {renderQrCode()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WhatsAppConnection;
