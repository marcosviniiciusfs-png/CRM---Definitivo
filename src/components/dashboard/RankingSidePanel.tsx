import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  BarChart3, 
  Trophy, 
  Zap, 
  Clock, 
  Flame, 
  DollarSign, 
  Target, 
  TrendingUp,
  Users,
  Award,
  Percent
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaderboardData } from "./TaskLeaderboard";

type SortType = "revenue" | "won_leads" | "percentage" | "task_points";

interface RankingSidePanelProps {
  data: LeaderboardData[];
  sortBy: SortType;
  type: "sales" | "tasks";
  period: string;
}

const getInitials = (name: string | null) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const getPeriodLabel = (period: string) => {
  switch (period) {
    case "week": return "Esta Semana";
    case "month": return "Este Mês";
    case "quarter": return "Este Trimestre";
    case "year": return "Este Ano";
    default: return "Período";
  }
};

// ============================================
// STATISTICS CALCULATION
// ============================================
function calculateStats(data: LeaderboardData[], sortBy: SortType) {
  if (data.length === 0) return null;

  switch (sortBy) {
    case "task_points": {
      const totalPoints = data.reduce((sum, d) => sum + (d.task_points || 0), 0);
      const totalTasks = data.reduce((sum, d) => sum + (d.tasks_completed || 0), 0);
      const totalOnTime = data.reduce((sum, d) => sum + (d.tasks_on_time || 0), 0);
      return {
        items: [
          { label: "Total de Pontos", value: `${totalPoints} pts`, icon: Zap },
          { label: "Tarefas Concluídas", value: `${totalTasks}`, icon: Trophy },
          { label: "Taxa de Pontualidade", value: `${totalTasks > 0 ? Math.round((totalOnTime / totalTasks) * 100) : 0}%`, icon: Clock },
          { label: "Média por Membro", value: `${data.length > 0 ? Math.round(totalPoints / data.length) : 0} pts`, icon: Users },
        ]
      };
    }
    
    case "revenue": {
      const totalRevenue = data.reduce((sum, d) => sum + (d.total_revenue || 0), 0);
      const totalSales = data.reduce((sum, d) => sum + (d.won_leads || 0), 0);
      return {
        items: [
          { label: "Faturamento Total", value: formatCurrency(totalRevenue), icon: DollarSign },
          { label: "Ticket Médio", value: formatCurrency(totalSales > 0 ? totalRevenue / totalSales : 0), icon: Target },
          { label: "Total de Vendas", value: `${totalSales}`, icon: Trophy },
          { label: "Média por Vendedor", value: formatCurrency(data.length > 0 ? totalRevenue / data.length : 0), icon: Users },
        ]
      };
    }
    
    case "won_leads": {
      const totalWon = data.reduce((sum, d) => sum + (d.won_leads || 0), 0);
      const totalLeads = data.reduce((sum, d) => sum + (d.total_leads || 0), 0);
      const conversionRate = totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0;
      return {
        items: [
          { label: "Vendas Fechadas", value: `${totalWon}`, icon: Trophy },
          { label: "Leads Trabalhados", value: `${totalLeads}`, icon: Users },
          { label: "Taxa de Conversão", value: `${conversionRate}%`, icon: TrendingUp },
          { label: "Média por Membro", value: `${data.length > 0 ? Math.round(totalWon / data.length) : 0}`, icon: Award },
        ]
      };
    }
    
    case "percentage": {
      const getPercentage = (d: LeaderboardData) => 
        (d.target || 0) > 0 ? ((d.won_leads || 0) / (d.target || 1)) * 100 : 0;
      
      const avgPercentage = data.length > 0 
        ? Math.round(data.reduce((sum, d) => sum + getPercentage(d), 0) / data.length) 
        : 0;
      const aboveTarget = data.filter(d => getPercentage(d) >= 100).length;
      const belowTarget = data.filter(d => getPercentage(d) < 100).length;
      const totalTarget = data.reduce((sum, d) => sum + (d.target || 0), 0);
      const totalRealized = data.reduce((sum, d) => sum + (d.won_leads || 0), 0);
      
      return {
        items: [
          { label: "Média de Atingimento", value: `${avgPercentage}%`, icon: Percent },
          { label: "Acima da Meta", value: `${aboveTarget} membros`, icon: TrendingUp },
          { label: "Abaixo da Meta", value: `${belowTarget} membros`, icon: Target },
          { label: "Realizado / Meta", value: `${totalRealized}/${totalTarget}`, icon: Award },
        ]
      };
    }
    
    default:
      return null;
  }
}

// ============================================
// HIGHLIGHTS CALCULATION
// ============================================
interface Highlight {
  icon: typeof Zap;
  label: string;
  user: LeaderboardData;
  value: string;
  color: string;
}

function calculateHighlights(data: LeaderboardData[], sortBy: SortType): Highlight[] {
  if (data.length === 0) return [];

  switch (sortBy) {
    case "task_points": {
      const sorted = [...data];
      const topProducer = sorted.sort((a, b) => (b.task_points || 0) - (a.task_points || 0))[0];
      
      const mostPunctual = [...data].sort((a, b) => {
        const rateA = (a.tasks_completed || 0) > 0 ? (a.tasks_on_time || 0) / a.tasks_completed! : 0;
        const rateB = (b.tasks_completed || 0) > 0 ? (b.tasks_on_time || 0) / b.tasks_completed! : 0;
        return rateB - rateA;
      })[0];
      
      const highestVolume = [...data].sort((a, b) => (b.tasks_completed || 0) - (a.tasks_completed || 0))[0];
      
      const punctualRate = mostPunctual && (mostPunctual.tasks_completed || 0) > 0 
        ? Math.round(((mostPunctual.tasks_on_time || 0) / mostPunctual.tasks_completed!) * 100) 
        : 0;
      
      return [
        { icon: Zap, label: "Mais Produtivo", user: topProducer, value: `${topProducer?.task_points || 0} pts`, color: "text-yellow-500" },
        { icon: Clock, label: "Mais Pontual", user: mostPunctual, value: `${punctualRate}% no prazo`, color: "text-blue-500" },
        { icon: Flame, label: "Maior Volume", user: highestVolume, value: `${highestVolume?.tasks_completed || 0} tarefas`, color: "text-orange-500" },
      ].filter(h => h.user);
    }
    
    case "revenue": {
      const topRevenue = [...data].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0];
      
      const bestTicket = [...data].sort((a, b) => {
        const ticketA = (a.won_leads || 0) > 0 ? (a.total_revenue || 0) / a.won_leads! : 0;
        const ticketB = (b.won_leads || 0) > 0 ? (b.total_revenue || 0) / b.won_leads! : 0;
        return ticketB - ticketA;
      })[0];
      
      const mostConsistent = [...data].sort((a, b) => (b.won_leads || 0) - (a.won_leads || 0))[0];
      
      const ticket = bestTicket && (bestTicket.won_leads || 0) > 0 
        ? (bestTicket.total_revenue || 0) / bestTicket.won_leads! 
        : 0;
      
      return [
        { icon: DollarSign, label: "Maior Faturamento", user: topRevenue, value: formatCurrency(topRevenue?.total_revenue || 0), color: "text-green-500" },
        { icon: Target, label: "Melhor Ticket", user: bestTicket, value: formatCurrency(ticket), color: "text-purple-500" },
        { icon: TrendingUp, label: "Mais Consistente", user: mostConsistent, value: `${mostConsistent?.won_leads || 0} vendas`, color: "text-blue-500" },
      ].filter(h => h.user);
    }
    
    case "won_leads": {
      const topSales = [...data].sort((a, b) => (b.won_leads || 0) - (a.won_leads || 0))[0];
      
      const bestConversion = [...data].sort((a, b) => {
        const rateA = (a.total_leads || 0) > 0 ? (a.won_leads || 0) / a.total_leads! : 0;
        const rateB = (b.total_leads || 0) > 0 ? (b.won_leads || 0) / b.total_leads! : 0;
        return rateB - rateA;
      })[0];
      
      const highestVolume = [...data].sort((a, b) => (b.total_leads || 0) - (a.total_leads || 0))[0];
      
      const conversionRate = bestConversion && (bestConversion.total_leads || 0) > 0 
        ? Math.round(((bestConversion.won_leads || 0) / bestConversion.total_leads!) * 100) 
        : 0;
      
      return [
        { icon: Trophy, label: "Campeão de Vendas", user: topSales, value: `${topSales?.won_leads || 0} vendas`, color: "text-yellow-500" },
        { icon: Target, label: "Melhor Conversão", user: bestConversion, value: `${conversionRate}%`, color: "text-green-500" },
        { icon: Users, label: "Maior Volume", user: highestVolume, value: `${highestVolume?.total_leads || 0} leads`, color: "text-blue-500" },
      ].filter(h => h.user);
    }
    
    case "percentage": {
      const getPercentage = (d: LeaderboardData) => 
        (d.target || 0) > 0 ? ((d.won_leads || 0) / (d.target || 1)) * 100 : 0;
      
      const topPercentage = [...data].sort((a, b) => getPercentage(b) - getPercentage(a))[0];
      const aboveTarget = [...data].filter(d => getPercentage(d) >= 100);
      const closest = [...data]
        .filter(d => getPercentage(d) < 100)
        .sort((a, b) => getPercentage(b) - getPercentage(a))[0];
      
      const highlights: Highlight[] = [
        { icon: Award, label: "Superou a Meta", user: topPercentage, value: `${Math.round(getPercentage(topPercentage))}%`, color: "text-yellow-500" },
      ];
      
      if (closest) {
        highlights.push({ icon: TrendingUp, label: "Mais Próximo", user: closest, value: `${Math.round(getPercentage(closest))}%`, color: "text-blue-500" });
      }
      
      if (aboveTarget.length > 0) {
        const mostConsistent = aboveTarget.sort((a, b) => (b.won_leads || 0) - (a.won_leads || 0))[0];
        highlights.push({ icon: Flame, label: "Mais Consistente", user: mostConsistent, value: `${mostConsistent?.won_leads || 0} vendas`, color: "text-orange-500" });
      }
      
      return highlights.filter(h => h.user);
    }
    
    default:
      return [];
  }
}

// ============================================
// STAT ITEM COMPONENT
// ============================================
const StatItem = ({ 
  label, 
  value, 
  icon: Icon 
}: { 
  label: string; 
  value: string; 
  icon: typeof Zap;
}) => (
  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <span className="text-sm font-bold text-foreground">{value}</span>
  </div>
);

// ============================================
// HIGHLIGHT CARD COMPONENT
// ============================================
const HighlightCard = ({ highlight }: { highlight: Highlight }) => (
  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
    <div className={cn("p-1.5 rounded-md bg-background/80", highlight.color.replace("text-", "bg-").replace("500", "500/20"))}>
      <highlight.icon className={cn("h-4 w-4", highlight.color)} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{highlight.label}</p>
      <p className="text-sm font-medium text-foreground truncate">
        {highlight.user?.full_name || "Colaborador"}
      </p>
    </div>
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6 border border-border">
        <AvatarImage src={highlight.user?.avatar_url || undefined} />
        <AvatarFallback className="bg-muted text-muted-foreground text-[8px]">
          {getInitials(highlight.user?.full_name)}
        </AvatarFallback>
      </Avatar>
      <span className={cn("text-xs font-bold", highlight.color)}>{highlight.value}</span>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
export function RankingSidePanel({ data, sortBy, type, period }: RankingSidePanelProps) {
  const stats = useMemo(() => calculateStats(data, sortBy), [data, sortBy]);
  const highlights = useMemo(() => calculateHighlights(data, sortBy), [data, sortBy]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-4 w-full">
      {/* Statistics Card */}
      <Card className="p-4 flex-1">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3 text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          Resumo - {getPeriodLabel(period)}
        </h4>
        <div className="space-y-0.5">
          {stats?.items.map((item, index) => (
            <StatItem key={index} label={item.label} value={item.value} icon={item.icon} />
          ))}
        </div>
      </Card>

      {/* Highlights Card */}
      {highlights.length > 0 && (
        <Card className="p-4 flex-1">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3 text-foreground">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Destaques
          </h4>
          <div className="space-y-2">
            {highlights.map((highlight, index) => (
              <HighlightCard key={index} highlight={highlight} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
