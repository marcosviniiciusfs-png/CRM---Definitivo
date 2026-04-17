import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { LoadingAnimation } from "@/components/LoadingAnimation";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { refreshSubscription, user, loading } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (user) {
      refreshSubscription()
        .then(() => toast.success("Assinatura ativada com sucesso!"))
        .finally(() => setIsRefreshing(false));
    }
  }, [user, loading, refreshSubscription, navigate]);

  if (isRefreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Atualizando assinatura..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Pagamento Confirmado!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            Sua assinatura foi ativada com sucesso. Agora você tem acesso a todas as funcionalidades do seu plano.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Ir para Dashboard
            </Button>
            <Button onClick={() => navigate("/settings")} variant="outline" className="w-full">
              Ver Configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
