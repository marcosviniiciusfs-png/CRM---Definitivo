import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OpenRequest {
  id: string;
  nome_lead: string;
  empresa: string | null;
  valor: number | null;
  created_at: string;
  stage_name?: string;
}

interface OpenRequestsProps {
  requests: OpenRequest[];
  isLoading?: boolean;
}

export function OpenRequests({ requests, isLoading }: OpenRequestsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Leads Pendentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse flex items-center justify-between py-2 border-b border-border">
              <div className="space-y-1">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-2 w-16 bg-muted rounded" />
              </div>
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Leads Pendentes</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {requests.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-auto max-h-[220px]">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum lead pendente</p>
        ) : (
          <div className="space-y-1">
            {requests.slice(0, 8).map((request) => (
              <div 
                key={request.id} 
                className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{request.nome_lead}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(request.created_at), "dd MMM", { locale: ptBR })}</span>
                    {request.empresa && (
                      <>
                        <span>•</span>
                        <span className="truncate">{request.empresa}</span>
                      </>
                    )}
                  </div>
                </div>
                {request.valor && request.valor > 0 && (
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-2">
                    {formatCurrency(request.valor)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
