import { useState, useEffect, useRef, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Loader2, QrCode, CheckCircle2, XCircle, Clock, LogOut, Trash2 } from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-icon.png";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { FunnelSelector } from "@/components/FunnelSelector";

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
  const { user, loading: authLoading } = useAuth();
  const { organizationId } = useOrganization();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingStatus, setVerifyingStatus] = useState(false);
  const [creating, setCreating] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [qrCodeErrors, setQrCodeErrors] = useState<Record<string, boolean>>({});
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [fixingWebhook, setFixingWebhook] = useState(false);

  // CRÍTICO: useRef para manter referência atualizada no callback do Realtime
  const selectedInstanceRef = useRef<WhatsAppInstance | null>(null);
  const qrDialogOpenRef = useRef<boolean>(false);

  // Sincronizar refs com states
  useEffect(() => {
    selectedInstanceRef.current = selectedInstance;
    qrDialogOpenRef.current = qrDialogOpen;
  }, [selectedInstance, qrDialogOpen]);

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

  // Função para reconfigurar webhook
  const fixWebhookConfig = async () => {
    setFixingWebhook(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('fix-webhook-config', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Webhook Reconfigurado! ✅",
        description: "Agora você receberá mensagens do WhatsApp no CRM.",
      });

      console.log('✅ Webhook reconfigurado:', data);

      await loadInstances();
    } catch (error: any) {
      console.error('Erro ao reconfigurar webhook:', error);
      toast({
        title: "Erro ao reconfigurar",
        description: error.message || "Não foi possível reconfigurar o webhook",
        variant: "destructive",
      });
    } finally {
      setFixingWebhook(false);
    }
  };


  // Verificar status de todas as instâncias na Evolution API
  const checkAllInstancesStatus = async (includeConnected: boolean = false) => {
    if (!user) {
      console.warn('⚠️ checkAllInstancesStatus: usuário não autenticado');
      return;
    }

    setVerifyingStatus(true);
    try {
      // Buscar instâncias baseado no parâmetro
      let query = supabase
        .from('whatsapp_instances')
        .select('instance_name, status, id')
        .eq('user_id', user.id);

      // Se não incluir conectadas, filtrar apenas pendentes
      if (!includeConnected) {
        query = query.neq('status', 'CONNECTED');
      }

      const { data: instances } = await query;

      console.log(`🔍 Busca retornou ${instances?.length || 0} instâncias (includeConnected: ${includeConnected})`);

      if (!instances || instances.length === 0) {
        console.log('✅ Nenhuma instância pendente para verificar');
        setVerifyingStatus(false);
        return;
      }

      console.log('🔍 Verificando status de', instances.length, 'instâncias na Evolution API...');

      // Verificar o status de cada instância na Evolution API de forma paralela
      const statusChecks = instances.map(async (instance) => {
        try {
          console.log(`⏳ Verificando ${instance.instance_name} (status atual: ${instance.status})...`);
          const { data, error } = await supabase.functions.invoke('check-whatsapp-status', {
            body: { instance_name: instance.instance_name },
          });

          if (error) {
            console.warn(`⚠️  Não foi possível verificar status da instância ${instance.instance_name}:`, error);
            return null;
          }

          console.log(`✅ Status verificado para ${instance.instance_name}:`, data?.status);
          return data;
        } catch (err) {
          console.warn(`❌ Erro ao verificar instância ${instance.instance_name}:`, err);
          return null;
        }
      });

      // Aguardar todas as verificações (mesmo que algumas falhem)
      const results = await Promise.allSettled(statusChecks);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;

      console.log(`✨ Verificação concluída: ${successCount}/${instances.length} instâncias verificadas com sucesso`);

      // Aguardar um momento para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 500));

      // Recarregar as instâncias após verificar os status
      await loadInstances();
    } catch (error) {
      console.warn('Erro ao verificar status das instâncias:', error);
      // Verificação falhou, mas não impede o funcionamento da tela
    } finally {
      setVerifyingStatus(false);
    }
  };

  // Carregar instâncias do usuário
  const loadInstances = async () => {
    console.log('🔄 [loadInstances] Iniciando...');

    // Aguardar o usuário estar pronto
    if (authLoading) {
      console.log('⏳ [loadInstances] Aguardando autenticação...');
      return;
    }

    if (!user) {
      console.error('❌ [loadInstances] Usuário não autenticado');
      setInstances([]);
      setLoading(false);
      return;
    }

    try {
      console.log(`🔍 [loadInstances] Buscando instâncias para user_id: ${user.id} e org_id: ${organizationId}`);

      let query = supabase
        .from('whatsapp_instances')
        .select('*', { count: 'exact' });

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false });

      console.log(`📊 [loadInstances] Query executada. Count: ${count}, Error:`, error);
      console.log(`📊 [loadInstances] Data recebida (raw):`, data);

      if (error) {
        console.error('❌ [loadInstances] Erro Supabase:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ [loadInstances] Nenhuma instância encontrada no banco! Verificar RLS policies?');
      } else {
        console.log('✅ [loadInstances] Instâncias encontradas:', data.map(i => ({
          id: i.id,
          name: i.instance_name,
          status: i.status,
          user_id: i.user_id,
          hasQrCode: !!i.qr_code
        })));
      }

      setInstances(data || []);
    } catch (error: any) {
      console.error('❌ [loadInstances] Exception:', {
        error,
        message: error?.message,
        stack: error?.stack
      });
      toast({
        title: "Erro",
        description: "Não foi possível carregar as instâncias WhatsApp",
        variant: "destructive",
      });
      setInstances([]);
    } finally {
      setLoading(false);
      console.log('🏁 [loadInstances] Finalizado');
    }
  };

  // Criar nova instância
  const createInstance = async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar autenticado para criar uma instância",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // CRÍTICO: Limpeza síncrona de instâncias pendentes ANTES de criar nova
      console.log('🧹 Iniciando limpeza de instâncias pendentes...');
      const pendingInstances = instances.filter(
        instance => instance.status === 'CREATING' || instance.status === 'WAITING_QR'
      );

      for (const instance of pendingInstances) {
        console.log(`🗑️ Removendo instância pendente: ${instance.id} (${instance.status})`);
        await cancelInstance(instance.id);
      }

      if (pendingInstances.length > 0) {
        console.log(`✅ ${pendingInstances.length} instância(s) pendente(s) removida(s)`);
      }

      // Mostrar toast informando sobre criação
      toast({
        title: "Criando conexão",
        description: "Gerando QR Code...",
      });

      // CRÍTICO: Garantir sessão válida antes de chamar a Edge Function
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!session || sessionError) {
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }

      const { data, error } = await supabase.functions.invoke('create-whatsapp-instance', {
        body: {},
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao criar instância');
      }

      console.log('✅ Instância criada com sucesso:', data);

      // OTIMIZAÇÃO: Usar QR da resposta imediatamente se disponível
      // A Evolution API retorna o QR code na resposta de criação
      const initialQrCode = data.instance?.qrCode || data.evolutionData?.qrcode?.base64 || null;

      if (initialQrCode) {
        console.log('🚀 QR Code disponível na resposta inicial! Exibindo imediatamente.');
      } else {
        console.log('📦 QR Code não disponível na resposta. Será recebido via polling/webhook.');
      }

      // Criar objeto de instância para exibir no dialog
      // OTIMIZAÇÃO: Usar QR da resposta se disponível para exibição imediata
      const tempInstance: WhatsAppInstance = {
        id: data.instance?.id || '',
        instance_name: data.instance?.instanceName || '',
        status: initialQrCode ? 'WAITING_QR' : 'CREATING',
        qr_code: initialQrCode, // OTIMIZAÇÃO: Usar QR da resposta inicial
        phone_number: null,
        created_at: new Date().toISOString(),
        connected_at: null,
      };

      // SEMPRE abrir o dialog - mostrar QR imediatamente se disponível
      setSelectedInstance(tempInstance);
      setQrDialogOpen(true);

      toast({
        title: initialQrCode ? "QR Code pronto!" : "Gerando QR Code...",
        description: initialQrCode ? "Escaneie o QR Code com seu WhatsApp." : "O QR Code será exibido em alguns segundos. Aguarde.",
      });

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

  // Desconectar e deletar instância
  const disconnectInstance = async (instanceId: string) => {
    setDisconnecting(instanceId);
    try {
      const { data, error } = await supabase.functions.invoke('disconnect-whatsapp-instance', {
        body: { instanceId },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao deletar instância');
      }

      toast({
        title: "WhatsApp deletado",
        description: "A instância foi deletada com sucesso. Você pode criar uma nova conexão.",
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

  // Ref para manter referência atualizada das instâncias sem causar re-renders
  const instancesRef = useRef<WhatsAppInstance[]>([]);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  // Polling periódico para verificar status de TODAS instâncias
  useEffect(() => {
    // CRÍTICO: Usar um intervalo fixo que não depende de instances.length
    const pollInterval = setInterval(() => {
      // Verificar se há instâncias usando a ref
      if (instancesRef.current.length === 0) {
        return;
      }

      console.log('🔄 Polling periódico: verificando status de todas as instâncias...');
      checkAllInstancesStatus(true); // true = incluir instâncias CONNECTED
    }, 30000); // A cada 30 segundos

    return () => clearInterval(pollInterval);
  }, []); // CRÍTICO: Array vazio - interval é criado apenas uma vez

  // Configurar Realtime para atualizar automaticamente
  useEffect(() => {
    // Só inicializar quando o usuário estiver pronto
    if (authLoading || !user) {
      console.log('⏳ [MOUNT] Aguardando usuário estar pronto... authLoading:', authLoading, 'user:', !!user);
      return;
    }

    console.log('🚀 [MOUNT] Inicializando WhatsAppConnection para user:', user.id);

    const initializeInstances = async () => {
      console.log('📥 [MOUNT] Chamando loadInstances inicial...');
      await loadInstances();
      console.log('✅ [MOUNT] Instâncias iniciais carregadas. Status será atualizado via webhook e polling periódico.');
    };

    initializeInstances();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('whatsapp_instances_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
        },
        (payload) => {
          // 🛑 CRÍTICO: Early Return - Verificar payload válido ANTES de qualquer processamento
          if (!payload.new || !payload.new.id) {
            console.warn('⚠️ Realtime payload inválido ou sem ID. Abortando.');
            return;
          }

          console.log('🔔 Realtime UPDATE recebido:', {
            eventType: payload.eventType,
            oldStatus: payload.old?.status,
            newStatus: payload.new?.status,
            instanceId: payload.new?.id,
            qrDialogOpen: qrDialogOpenRef.current,
            selectedInstanceId: selectedInstanceRef.current?.id
          });

          // CRÍTICO: Usar ref para acessar valor atualizado
          const currentSelectedInstance = selectedInstanceRef.current;
          const isDialogOpen = qrDialogOpenRef.current;

          // CRÍTICO: Verificar se a instância conectou
          if (payload.new && payload.new.status === 'CONNECTED') {
            console.log('✅ Status CONNECTED detectado na instância:', payload.new.id);

            // Se for a instância que está no modal E o modal está aberto, fechar IMEDIATAMENTE
            if (isDialogOpen && currentSelectedInstance && payload.new.id === currentSelectedInstance.id) {
              console.log('🎉 É a instância do modal aberto! Fechando IMEDIATAMENTE...');

              // CRÍTICO: Fechar de forma síncrona e garantida
              requestAnimationFrame(() => {
                setQrDialogOpen(false);
                setSelectedInstance(null);
                toast({
                  title: "WhatsApp conectado!",
                  description: "Conectado com sucesso! Os leads aparecerão automaticamente quando receberem mensagens.",
                });

                // Recarregar após fechar
                setTimeout(() => loadInstances(), 100);
              });

              return; // Não recarregar antes de fechar o modal
            } else {
              console.log('ℹ️ Modal não está aberto ou é outra instância');
            }
          }

          // Recarregar instâncias após qualquer update (exceto quando fechando modal)
          // CRÍTICO: Não chamar loadInstances aqui se estamos fechando o modal
          // pois loadInstances estava chamando checkAllInstancesStatus que sobrescrevia CONNECTED
          if (!(payload.new && payload.new.status === 'CONNECTED' && isDialogOpen && currentSelectedInstance && payload.new.id === currentSelectedInstance.id)) {
            loadInstances();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    return () => {
      console.log('🔌 [UNMOUNT] Removendo canal Realtime');
      supabase.removeChannel(channel);
    };
  }, [user, authLoading]); // CRITICAL FIX: Removido toast das dependências para evitar loop infinito

  // GARANTIA ADICIONAL: Monitor direto do selectedInstance para fechar modal se conectar
  useEffect(() => {
    if (!selectedInstance || !qrDialogOpen) return;

    console.log('👀 Monitoring selected instance status:', {
      id: selectedInstance.id,
      status: selectedInstance.status,
      dialogOpen: qrDialogOpen
    });

    // Se a instância selecionada mudar para CONNECTED, fechar modal imediatamente
    if (selectedInstance.status === 'CONNECTED') {
      console.log('🚀 GARANTIA: Selected instance is CONNECTED, forcing modal close!');
      setQrDialogOpen(false);
      setSelectedInstance(null);
      toast({
        title: "WhatsApp conectado!",
        description: "Conexão estabelecida com sucesso!",
      });
    }
  }, [selectedInstance, qrDialogOpen]); // CRÍTICO: Removido toast das dependências

  // CRÍTICO: Polling automático para verificar status E buscar QR Code quando modal está aberto
  // Isso garante que o modal recebe o QR mesmo se o Realtime falhar
  useEffect(() => {
    // 🛑 CRÍTICO: Early Return - Verificar se selectedInstance existe e tem ID antes de continuar
    if (!selectedInstance || !selectedInstance.id || !qrDialogOpen || selectedInstance.status === 'CONNECTED') {
      return;
    }

    console.log('⏰ Iniciando polling de status/QR para instância:', selectedInstance.instance_name);

    // Verificar status a cada 3 segundos enquanto o modal está aberto
    const pollInterval = setInterval(async () => {
      try {
        console.log('🔍 Polling: Verificando status e QR da instância...');

        // PRIMEIRO: Buscar QR atualizado do banco de dados
        const { data: instanceFromDb, error: dbError } = await supabase
          .from('whatsapp_instances')
          .select('id, qr_code, status')
          .eq('id', selectedInstance.id)
          .limit(1)
          .single();

        if (dbError) {
          console.warn('⚠️ Erro ao buscar instância do banco:', dbError);
        } else if (instanceFromDb) {
          // CRÍTICO: SEMPRE sincronizar QR code do banco - o banco é a fonte da verdade
          // Não comparar com valor local, sempre usar o valor do banco
          if (instanceFromDb.qr_code) {
            console.log('✅ QR Code encontrado no banco! Sincronizando com valor mais recente...');
            setSelectedInstance(prev => {
              // Só atualizar se o QR mudou (evitar re-renders desnecessários)
              if (prev && prev.qr_code !== instanceFromDb.qr_code) {
                console.log('🔄 QR Code atualizado - banco tinha valor diferente');
                return {
                  ...prev,
                  qr_code: instanceFromDb.qr_code,
                  status: instanceFromDb.status || prev.status
                };
              }
              // Atualizar status mesmo se QR não mudou
              if (prev && prev.status !== instanceFromDb.status) {
                return { ...prev, status: instanceFromDb.status || prev.status };
              }
              return prev;
            });
          }

          // Verificar se conectou via banco
          if (instanceFromDb.status === 'CONNECTED') {
            console.log('✅ Polling detectou CONNECTED no banco!');
            setQrDialogOpen(false);
            setSelectedInstance(null);
            toast({
              title: "WhatsApp conectado!",
              description: "Conectado com sucesso!",
            });
            loadInstances();
            return;
          }
        }

        // SEGUNDO: Verificar status na Evolution API (backup)
        const { data, error } = await supabase.functions.invoke('check-whatsapp-status', {
          body: { instance_name: selectedInstance.instance_name }
        });

        if (error) {
          console.error('❌ Erro no polling:', error);
          return;
        }

        console.log('📊 Polling result:', data);

        // Se conectou, o banco será atualizado e o Realtime vai notificar
        if (data?.status === 'CONNECTED') {
          console.log('✅ Polling detectou CONNECTED na API!');
          setTimeout(() => {
            if (qrDialogOpenRef.current) {
              setQrDialogOpen(false);
              setSelectedInstance(null);
              toast({
                title: "WhatsApp conectado!",
                description: "Conectado com sucesso! Os leads aparecerão automaticamente quando receberem mensagens.",
              });
              loadInstances();
            }
          }, 500);
        }
      } catch (error) {
        console.error('❌ Erro ao verificar status no polling:', error);
      }
    }, 1500); // OTIMIZAÇÃO: Verificar a cada 1.5 segundos para resposta mais rápida

    // Limpar interval quando o modal fechar ou a instância mudar
    return () => {
      console.log('⏰ Parando polling de status/QR');
      clearInterval(pollInterval);
    };
  }, [selectedInstance?.id, qrDialogOpen]); // Depender apenas do ID para evitar loops

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

  if (loading || authLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Você precisa estar autenticado para acessar esta funcionalidade.</p>
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
        hasQrCode: !!instance.qr_code
      });

      // Verificação inicial: QR Code null, undefined ou vazio
      if (!instance.qr_code) {
        console.warn('⚠️ QR Code é null ou undefined');
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Aguardando QR Code...</p>
          </div>
        );
      }

      let rawBase64 = '';

      // CASO 1: String direta (formato ideal)
      if (typeof instance.qr_code === 'string') {
        rawBase64 = instance.qr_code;
        console.log('✅ QR Code é string direta, comprimento:', rawBase64.length);
      }
      // CASO 2: Objeto (pode vir do Supabase/Postgres ou Evolution API)
      else if (typeof instance.qr_code === 'object' && !Array.isArray(instance.qr_code)) {
        const qrData: any = instance.qr_code;

        // Verificar se é um objeto válido e não-nulo
        if (qrData && typeof qrData === 'object') {
          console.log('📦 QR Code é objeto, estrutura:', Object.keys(qrData));

          // Formato Evolution API: { base64: "data:image...", code: "...", pairingCode: null }
          if (qrData.base64) {
            rawBase64 = qrData.base64;
            console.log('✅ Extraído de .base64, comprimento:', rawBase64.length);
          }
          // Formato Evolution API alternativo: { code: "data:image..." }
          else if (qrData.code) {
            rawBase64 = qrData.code;
            console.log('✅ Extraído de .code, comprimento:', rawBase64.length);
          }
          // Supabase às vezes retorna { _type: "String", value: "..." }
          else if (qrData._type === 'String' && qrData.value) {
            rawBase64 = qrData.value;
            console.log('✅ Extraído de _type/value, comprimento:', rawBase64.length);
          }
          // Fallback: tentar acessar .value diretamente
          else if (qrData.value) {
            rawBase64 = qrData.value;
            console.log('✅ Extraído de .value, comprimento:', rawBase64.length);
          }
        }
      }

      // Validação: QR Code vazio após extração
      if (!rawBase64 || rawBase64.trim().length === 0) {
        console.error('❌ QR Code vazio após extração');
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Aguardando QR Code...</p>
          </div>
        );
      }

      // CRÍTICO: Remover aspas duplas literais se existirem
      // Isso acontece quando o valor vem como "\"base64string\""
      if (rawBase64.startsWith('"') && rawBase64.endsWith('"')) {
        rawBase64 = rawBase64.slice(1, -1);
        console.log('⚙️ Aspas duplas removidas, novo comprimento:', rawBase64.length);
      }

      // Limpeza: remover prefixo data:image se já existir
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/i, '');

      // Validação: comprimento mínimo
      if (cleanBase64.length < 100) {
        console.error('❌ Base64 muito curto:', cleanBase64.length, 'caracteres');
        return (
          <div className="text-center py-8 text-destructive">
            <XCircle className="h-8 w-8 mx-auto mb-2" />
            <p>QR Code inválido. Tente criar uma nova conexão.</p>
          </div>
        );
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
          <div className="bg-card p-4 rounded-lg border">
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
      return (
        <div className="text-center py-8 text-destructive">
          <XCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Erro ao processar QR Code. Tente novamente.</p>
        </div>
      );
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

      <Card className={`border-muted ${instances.some(i => i.status === 'CONNECTED') ? 'border-green-500/40 bg-green-500/5' : ''}`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Status dot indicator */}
              <div className="relative flex-shrink-0">
                <img src={whatsappLogo} alt="WhatsApp" className="h-7 w-7" />
                {instances.some(i => i.status === 'CONNECTED') && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  WhatsApp
                </h3>
                <p className={`text-xs truncate ${instances.some(i => i.status === 'CONNECTED') ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                  {instances.some(i => i.status === 'CONNECTED')
                    ? `✓ Conectado${instances.find(i => i.status === 'CONNECTED')?.phone_number ? ': ' + instances.find(i => i.status === 'CONNECTED')?.phone_number : ''}`
                    : 'Conecte seu número'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {instances.some(i => i.status === 'CONNECTED') && (
                <Badge variant="default" className="bg-green-500 hover:bg-green-500 text-white text-xs font-semibold px-2">● Ativo</Badge>
              )}
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : instances.some(instance => instance.status === 'CONNECTED') ? (
                instances
                  .filter(instance => instance.status === 'CONNECTED')
                  .map((instance) => (
                    <Button
                      key={instance.id}
                      onClick={() => disconnectInstance(instance.id)}
                      disabled={disconnecting === instance.id}
                      variant="destructive"
                      size="sm"
                    >
                      {disconnecting === instance.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Desconectando
                        </>
                      ) : (
                        <>
                          <LogOut className="h-3 w-3 mr-1" />
                          Desconectar
                        </>
                      )}
                    </Button>
                  ))
              ) : (
                <Button
                  onClick={createInstance}
                  disabled={creating}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Criando
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Conectar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Funnel Selector - only show when connected */}
          {instances.some(i => i.status === 'CONNECTED') && (
            <FunnelSelector sourceType="whatsapp" className="mt-3" />
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default memo(WhatsAppConnection);
