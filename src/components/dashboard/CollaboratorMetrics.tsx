import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, Clock, Target, DollarSign, AlertCircle } from "lucide-react";

interface CollaboratorMetricsProps {
  collaborator: {
    user_id: string;
    full_name: string;
    avatar_url?: string;
    role?: string;
  };
  metrics: {
    leadsAssigned: number;
    salesMade: number;
    conversionRate: number;
    avgResponseTime: number; // in minutes
    pendingLeads: number;
    revenueGenerated: number;
  };
  isLoading?: boolean;
}

export function CollaboratorMetrics({ collaborator, metrics, isLoading }: CollaboratorMetricsProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatResponseTime = (minutes: number) => {
    if (minutes < 1) return "< 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) return `${hours}h ${mins}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  const getResponseTimeColor = (minutes: number) => {
    if (minutes <= 5) return "text-emerald-600 dark:text-emerald-400";
    if (minutes <= 15) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  if (isLoading) {
    return (
      <Card className="col-span-full bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const metricItems = [
    {
      label: "Leads Atribuídos",
      value: metrics.leadsAssigned,
      icon: Users,
      color: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Vendas Realizadas",
      value: metrics.salesMade,
      icon: TrendingUp,
      color: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Taxa de Conversão",
      value: `${metrics.conversionRate}%`,
      icon: Target,
      color: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Tempo Médio Resposta",
      value: formatResponseTime(metrics.avgResponseTime),
      icon: Clock,
      color: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: getResponseTimeColor(metrics.avgResponseTime),
    },
    {
      label: "Leads Pendentes",
      value: metrics.pendingLeads,
      icon: AlertCircle,
      color: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      label: "Receita Gerada",
      value: formatCurrency(metrics.revenueGenerated),
      icon: DollarSign,
      color: "bg-teal-100 dark:bg-teal-900/30",
      iconColor: "text-teal-600 dark:text-teal-400",
      isLarge: true,
    },
  ];

  return (
    <Card className="col-span-full bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
      <CardContent className="pt-6">
        {/* Header com avatar e nome */}
        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarImage src={collaborator.avatar_url} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {getInitials(collaborator.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-xl font-bold">{collaborator.full_name}</h3>
            <p className="text-sm text-muted-foreground capitalize">
              {collaborator.role || 'Colaborador'}
            </p>
          </div>
        </div>

        {/* Grid de métricas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metricItems.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center p-4 rounded-lg bg-card border"
            >
              <div className={`p-2 rounded-lg ${item.color} mb-2`}>
                <item.icon className={`h-5 w-5 ${item.iconColor}`} />
              </div>
              <span className={`text-lg font-bold ${item.isLarge ? 'text-base' : ''}`}>
                {item.value}
              </span>
              <span className="text-xs text-muted-foreground text-center mt-1">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
