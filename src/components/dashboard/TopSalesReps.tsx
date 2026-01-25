import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SalesRep {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
  target: number;
}

interface TopSalesRepsProps {
  reps: SalesRep[];
  isLoading?: boolean;
}

export function TopSalesReps({ reps, isLoading }: TopSalesRepsProps) {
  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 100) return "text-emerald-600 dark:text-emerald-400";
    if (percentage >= 80) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return "bg-emerald-500";
    if (percentage >= 80) return "bg-amber-500";
    return "bg-red-500";
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Vendedores vs Meta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-2 w-full bg-muted rounded" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Top Vendedores vs Meta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
        ) : (
          reps.slice(0, 5).map((rep, index) => {
            const percentage = rep.target > 0 ? Math.round((rep.total_revenue / rep.target) * 100) : 0;
            return (
              <div key={rep.user_id} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-5 text-xs font-bold text-muted-foreground">
                  {index + 1}
                </div>
                <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                  <AvatarImage src={rep.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    {getInitials(rep.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{rep.full_name || "Sem nome"}</span>
                    <span className={cn("text-sm font-bold", getPercentageColor(percentage))}>
                      {percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all", getProgressColor(percentage))}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
