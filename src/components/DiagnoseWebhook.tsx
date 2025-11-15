import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const DiagnoseWebhook = () => {
  const { toast } = useToast();
  const [diagnosing, setDiagnosing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState<any>(null);

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
        <div className="flex gap-2">
          <Button
            onClick={diagnoseWebhook}
            disabled={diagnosing || fixing}
            variant="outline"
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
            disabled={diagnosing || fixing}
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
            disabled={diagnosing || fixing}
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
