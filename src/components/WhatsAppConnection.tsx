import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWhatsApp } from "@/contexts/WhatsAppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.png";

interface QRCodeData {
  instance: string;
  pairingCode: string | null;
  code: string;
  base64: string;
}

const WhatsAppConnection = () => {
  const { toast } = useToast();
  const { instances, loading: contextLoading, isConnected, refreshInstances, checkAndUpdateStatus } = useWhatsApp();
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeError, setQrCodeError] = useState(false);

  // Pegar a instância principal (primeira conectada ou a primeira disponível)
  const mainInstance = instances.find(i => i.status === 'CONNECTED' || i.status === 'OPEN') || instances[0];

  const handleCloseDialog = async () => {
    if (mainInstance && (mainInstance.status === 'WAITING_QR' || mainInstance.status === 'CREATING')) {
      try {
        await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', mainInstance.id);
        
        await refreshInstances();
      } catch (error) {
        console.error('Erro ao cancelar instância:', error);
      }
    }
    setQrDialogOpen(false);
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

  const handleConnect = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-whatsapp-instance');

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao criar instância');
      }

      if (data.instance && data.instance.qrCode) {
        setQrDialogOpen(true);
        
        toast({
          title: "QR Code pronto!",
          description: "Escaneie o código para conectar seu WhatsApp.",
        });
      } else {
        toast({
          title: "Conexão iniciada!",
          description: "O QR Code será exibido em alguns segundos.",
        });
      }

      await refreshInstances();
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a conexão",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!mainInstance) return;
    
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('disconnect-whatsapp-instance', {
        body: { instanceId: mainInstance.id },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao desconectar instância');
      }

      toast({
        title: "WhatsApp desconectado",
        description: "Sua conexão foi desconectada com sucesso.",
      });

      await refreshInstances();
    } catch (error: any) {
      console.error('Erro ao desconectar instância:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível desconectar",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const renderQrCode = () => {
    if (!mainInstance || !mainInstance.qr_code) return null;

    let qrData: QRCodeData | null = null;

    try {
      if (typeof mainInstance.qr_code === 'string') {
        qrData = JSON.parse(mainInstance.qr_code);
      } else {
        qrData = mainInstance.qr_code;
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
          onError={() => setQrCodeError(true)}
        />
        {qrCodeError && (
          <p className="text-sm text-destructive">Erro ao carregar imagem</p>
        )}
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

  // Verificar se está aguardando QR code
  const isWaitingQr = mainInstance && (mainInstance.status === 'WAITING_QR' || mainInstance.status === 'CREATING') && mainInstance.qr_code;

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
            {isConnected && (
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
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {contextLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              {mainInstance?.phone_number && (
                <div className="text-center mb-2">
                  <p className="text-sm text-muted-foreground">Número conectado</p>
                  <p className="text-lg font-semibold">{mainInstance.phone_number}</p>
                </div>
              )}
              
              {isWaitingQr && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setQrDialogOpen(true)}
                  className="w-full max-w-md"
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  Ver QR Code para Conectar
                </Button>
              )}

              {isConnected ? (
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="w-full max-w-md"
                >
                  {disconnecting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Desconectando...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-5 w-5" />
                      Desconectar WhatsApp
                    </>
                  )}
                </Button>
              ) : !isWaitingQr && (
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleConnect}
                  disabled={creating}
                  className="w-full max-w-md bg-success hover:bg-success/90"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="mr-2 h-5 w-5" />
                      Conectar WhatsApp
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
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
