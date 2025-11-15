import { useState, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const DiagnoseWebhook = () => {
  const { toast } = useToast();
  const [diagnosing, setDiagnosing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [autoValidated, setAutoValidated] = useState(false);

  // Validação automática ao montar o componente - APENAS UMA VEZ
  useEffect(() => {
    // CRÍTICO: Usar sessionStorage para garantir que só execute uma vez por sessão
    const hasValidated = sessionStorage.getItem('whatsapp_auto_validated');
    if (hasValidated) {
      console.log('⏭️ Auto-validação já executada nesta sessão, pulando...');
      return;
    }
    
    const autoValidateInstances = async () => {
      try {
        console.log('🔍 Executando validação automática de instâncias...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('⚠️ Sem sessão, pulando validação');
          return;
        }

        const { data, error } = await supabase.functions.invoke('cleanup-invalid-instances', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) {
          console.error('❌ Erro na validação automática:', error);
          return;
        }

        // Marcar como validado ANTES de fazer qualquer ação
        sessionStorage.setItem('whatsapp_auto_validated', 'true');
        setAutoValidated(true);

        // Apenas notificar se houver instâncias inválidas removidas
        if (data.success && data.cleaned > 0) {
          console.log(`✅ ${data.cleaned} instância(s) inválida(s) removidas`);
          toast({
            title: "Instâncias limpas",
            description: `${data.cleaned} instância(s) inválida(s) foram removidas.`,
          });
          
          // NÃO RECARREGAR - deixar o Realtime atualizar naturalmente
        } else {
          console.log('✅ Nenhuma instância inválida encontrada');
        }
      } catch (error: any) {
        console.error('❌ Erro na validação automática:', error);
        // Marcar como validado mesmo em caso de erro para evitar loops
        sessionStorage.setItem('whatsapp_auto_validated', 'true');
      }
    };

    autoValidateInstances();
    
    // Cleanup: Limpar flag quando o componente desmontar
    return () => {
      console.log('🧹 Componente desmontado - mantendo flag de validação');
    };
  }, []); // CRÍTICO: Array vazio - executar apenas no mount

  const diagnoseWebhook = async () => {
    setDiagnosing(true);
    setResult(null);
    
    try {
      // Simular envio de mensagem para testar webhook
      const { data, error } = await supabase.functions.invoke('simulate-webhook-message');
      
      if (error) throw error;
      
      setResult(data);
      
      if (data.success) {
        toast({
          title: "Teste concluído ✅",
          description: "O webhook está funcionando corretamente!",
        });
      } else {
        toast({
          title: "Problema detectado ❌",
          description: "O webhook não está processando mensagens corretamente.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Erro ao diagnosticar:', error);
      toast({
        title: "Erro no diagnóstico",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDiagnosing(false);
    }
  };

  const cleanupInstances = async () => {
    setCleaning(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Não autenticado');
      }

      const { data, error } = await supabase.functions.invoke('cleanup-invalid-instances', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Limpeza concluída! ✅",
        description: data.message,
      });

      setResult(data);
      
      // NÃO RECARREGAR - deixar o Realtime atualizar naturalmente
      console.log('✅ Limpeza manual concluída. Realtime atualizará automaticamente.');
    } catch (error: any) {
      console.error('Erro ao limpar instâncias:', error);
      toast({
        title: "Erro na limpeza",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCleaning(false);
    }
  };

  const fixWebhook = async () => {
    setFixing(true);
    
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
        description: "Agora envie uma mensagem de teste no WhatsApp.",
      });

      setResult(data);
    } catch (error: any) {
      console.error('Erro ao corrigir webhook:', error);
      toast({
        title: "Erro ao reconfigurar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Diagnóstico do Webhook
        </CardTitle>
        <CardDescription>
          Teste se o webhook está recebendo mensagens da Evolution API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {autoValidated && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Validação automática concluída. Todas as instâncias estão sincronizadas.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              onClick={cleanupInstances}
              disabled={cleaning || diagnosing || fixing}
              variant="destructive"
              className="flex-1"
            >
              {cleaning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Limpando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Instâncias Inválidas
                </>
              )}
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={diagnoseWebhook}
              disabled={diagnosing || fixing || cleaning}
              variant="outline"
              className="flex-1"
            >
              {diagnosing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Testar Webhook
                </>
              )}
            </Button>

            <Button
              onClick={fixWebhook}
              disabled={diagnosing || fixing || cleaning}
              className="flex-1"
            >
              {fixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reconfigurando V1...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Fix V1
                </>
              )}
            </Button>

            <Button
              onClick={async () => {
                setFixing(true);
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) {
                    throw new Error('Não autenticado');
                  }

                  const { data, error } = await supabase.functions.invoke('fix-webhook-config-v2', {
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                    },
                  });

                  if (error) throw error;

                  toast({
                    title: "Webhook Reconfigurado! ✅",
                    description: `Versão: ${data.version}. Envie uma mensagem de teste.`,
                  });

                  setResult(data);
                } catch (error: any) {
                  console.error('Erro ao corrigir webhook:', error);
                  toast({
                    title: "Erro ao reconfigurar",
                    description: error.message,
                    variant: "destructive",
                  });
                } finally {
                  setFixing(false);
                }
              }}
              disabled={diagnosing || fixing || cleaning}
              className="flex-1"
            >
              {fixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reconfigurando V2...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Fix V2
                </>
              )}
            </Button>
          </div>
        </div>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5" />
              )}
              <div className="flex-1">
                <AlertDescription>
                  <div className="font-medium mb-2">{result.message}</div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Instruções:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Clique em "Reconfigurar Webhook" primeiro</li>
              <li>Aguarde a confirmação de sucesso</li>
              <li>Envie uma mensagem de TESTE no WhatsApp conectado</li>
              <li>Verifique se o lead aparece na sessão Leads/Chat</li>
            </ol>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default memo(DiagnoseWebhook);
