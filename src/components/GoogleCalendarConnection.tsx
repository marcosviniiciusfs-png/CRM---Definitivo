import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface GoogleCalendarConnectionProps {
  onClose: () => void;
}

interface CalendarIntegration {
  id: string;
  is_active: boolean;
  calendar_id: string;
  created_at: string;
}

export const GoogleCalendarConnection = ({ onClose }: GoogleCalendarConnectionProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [integration, setIntegration] = useState<CalendarIntegration | null>(null);

  useEffect(() => {
    loadIntegration();
  }, []);

  const loadIntegration = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("google_calendar_integrations")
        .select("*")
        .eq("user_id", user?.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      setIntegration(data);
    } catch (error: any) {
      console.error("Erro ao carregar integração:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a integração",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-oauth-initiate", {
        body: { origin: window.location.origin },
      });

      if (error) throw error;

      if (data?.authUrl) {
        // Redirecionar para a página de autorização do Google
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      console.error("Erro ao iniciar conexão:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível iniciar a conexão",
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (!integration) return;

      const { error } = await supabase
        .from("google_calendar_integrations")
        .update({ is_active: false })
        .eq("id", integration.id);

      if (error) throw error;

      toast({
        title: "Desconectado",
        description: "Google Calendar desconectado com sucesso",
      });

      setIntegration(null);
    } catch (error: any) {
      console.error("Erro ao desconectar:", error);
      toast({
        title: "Erro",
        description: "Não foi possível desconectar",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Google Calendar
          </DialogTitle>
          <DialogDescription>
            Agende reuniões e eventos automaticamente com seus leads
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : integration ? (
          <div className="space-y-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Conectado</h3>
                      <p className="text-xs text-muted-foreground">
                        Calendário: {integration.calendar_id}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="bg-[#66ee78]">Ativo</Badge>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Recursos disponíveis:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Criar eventos a partir de leads</li>
                <li>• Agendar reuniões com um clique</li>
                <li>• Sincronizar disponibilidade</li>
                <li>• Lembretes automáticos</li>
              </ul>
            </div>

            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="w-full"
            >
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-muted">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm">Por que conectar?</h3>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Agende reuniões diretamente do lead</li>
                      <li>• Crie eventos com dados pré-preenchidos</li>
                      <li>• Envie convites automáticos por email</li>
                      <li>• Mantenha sua agenda sincronizada</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Conectar Google Calendar
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Você será redirecionado para autorizar o acesso ao seu Google Calendar
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};