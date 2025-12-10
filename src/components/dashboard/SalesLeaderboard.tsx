import React, { useMemo } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SalesRepData {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  won_leads: number;
  total_leads: number;
  total_revenue: number;
  target: number;
}

interface SalesLeaderboardProps {
  reps: SalesRepData[];
  isLoading?: boolean;
  title?: string;
  sortBy?: "revenue" | "won_leads" | "percentage";
  listType?: "cards" | "rows";
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

// ============================================
// TOP 3 SECTION - Avatars Only
// ============================================
const Top3Section = ({ top3 }: { top3: SalesRepData[] }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [top3[0], top3[1] || null, top3[2] || null];

  const positionConfig = {
    1: {
      size: 100,
      borderColor: "border-yellow-400",
      glowColor: "0 0 30px rgba(250, 204, 21, 0.5)",
      gradientBg: "from-yellow-400 to-yellow-600",
      icon: Trophy,
      iconColor: "text-yellow-400",
    },
    2: {
      size: 80,
      borderColor: "border-gray-300",
      glowColor: "0 0 20px rgba(192, 192, 192, 0.4)",
      gradientBg: "from-gray-300 to-gray-500",
      icon: Medal,
      iconColor: "text-gray-300",
    },
    3: {
      size: 80,
      borderColor: "border-orange-400",
      glowColor: "0 0 20px rgba(251, 146, 60, 0.4)",
      gradientBg: "from-orange-400 to-orange-600",
      icon: Award,
      iconColor: "text-orange-400",
    },
  };

  // Order: 2nd, 1st, 3rd for visual podium effect
  const orderedPositions = [
    { rep: second, position: 2 as const },
    { rep: first, position: 1 as const },
    { rep: third, position: 3 as const },
  ];

  return (
    <div className="flex items-end justify-center gap-6 py-6">
      {orderedPositions.map(({ rep, position }) => {
        if (!rep) return <div key={position} className="w-24" />;
        
        const config = positionConfig[position];
        const Icon = config.icon;

        return (
          <div 
            key={rep.user_id} 
            className={cn(
              "flex flex-col items-center gap-2",
              position === 1 ? "mb-4" : "mb-0"
            )}
          >
            {/* Position Icon */}
            <Icon className={cn("h-6 w-6", config.iconColor)} />
            
            {/* Avatar */}
            <Avatar
              className={cn("border-4", config.borderColor)}
              style={{
                width: config.size,
                height: config.size,
                boxShadow: config.glowColor,
              }}
            >
              <AvatarImage src={rep.avatar_url || undefined} />
              <AvatarFallback className={cn("font-bold text-white bg-gradient-to-br text-xl", config.gradientBg)}>
                {getInitials(rep.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Name */}
            <span className="font-bold text-foreground text-sm text-center truncate max-w-[100px]">
              {rep.full_name || "Colaborador"}
            </span>

            {/* Revenue */}
            <span className="text-xs text-muted-foreground">
              {formatCurrency(rep.total_revenue)}
            </span>

            {/* Position Badge */}
            <div className={cn(
              "px-3 py-1 rounded-full text-white text-xs font-bold bg-gradient-to-r",
              config.gradientBg
            )}>
              {position}º
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// RANKING CARD - List Item
// ============================================
const RankingCard = ({
  rep,
  position,
}: {
  rep: SalesRepData;
  position: number;
}) => {
  const getBadgeColor = (pos: number) => {
    if (pos <= 3) return "from-yellow-400 to-yellow-600";
    if (pos <= 6) return "from-purple-400 to-purple-600";
    return "from-blue-400 to-blue-600";
  };

  const getBadgeIcon = (pos: number) => {
    if (pos === 1) return <Trophy className="h-3 w-3" />;
    if (pos === 2) return <Medal className="h-3 w-3" />;
    if (pos === 3) return <Award className="h-3 w-3" />;
    return null;
  };

  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg bg-indigo-950/80 border border-indigo-500/20 hover:border-indigo-400/40 transition-all w-full"
      style={{
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Position Badge */}
      <div 
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br font-bold text-white text-xs shrink-0",
          getBadgeColor(position)
        )}
      >
        {getBadgeIcon(position) || position}
      </div>

      {/* Avatar */}
      <Avatar className="h-9 w-9 border border-indigo-500/30 shrink-0">
        <AvatarImage src={rep.avatar_url || undefined} />
        <AvatarFallback className="bg-indigo-900 text-indigo-200 text-[10px] font-bold">
          {getInitials(rep.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-xs truncate">
          {rep.full_name || "Colaborador"}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-indigo-300/80">
          <span>Mês {rep.won_leads}</span>
          <span className="text-indigo-500">•</span>
          <span>Vendas {rep.total_leads}</span>
        </div>
      </div>

      {/* Stats Badge */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
        <Trophy className="h-2.5 w-2.5 text-yellow-400" />
        <span className="text-[10px] text-yellow-300 font-medium">{formatCurrency(rep.total_revenue)}</span>
      </div>
    </div>
  );
};

// ============================================
// LOADING SKELETON
// ============================================
const LeaderboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-end justify-center gap-8 py-8">
      <Skeleton className="w-28 h-36 bg-indigo-800/50 rounded-lg" />
      <Skeleton className="w-36 h-44 bg-indigo-800/50 rounded-lg" />
      <Skeleton className="w-28 h-36 bg-indigo-800/50 rounded-lg" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 bg-indigo-800/50 rounded-xl" />
      ))}
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
export function SalesLeaderboard({
  reps,
  isLoading = false,
  sortBy = "revenue",
  listType = "cards",
}: SalesLeaderboardProps) {
  const sortedReps = useMemo(() => {
    const sorted = [...reps];
    switch (sortBy) {
      case "revenue":
        return sorted.sort((a, b) => b.total_revenue - a.total_revenue);
      case "won_leads":
        return sorted.sort((a, b) => b.won_leads - a.won_leads);
      case "percentage":
        const getPercentage = (r: SalesRepData) => r.target > 0 ? (r.won_leads / r.target) * 100 : 0;
        return sorted.sort((a, b) => getPercentage(b) - getPercentage(a));
      default:
        return sorted;
    }
  }, [reps, sortBy]);

  const top3 = sortedReps.slice(0, 3);

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  if (reps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Trophy className="h-16 w-16 text-indigo-400/40 mb-4" />
        <p className="text-indigo-300/60 text-lg">Nenhum dado de vendas disponível</p>
        <p className="text-indigo-400/40 text-sm mt-1">Realize vendas para aparecer no ranking</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
      {/* Left - Podium */}
      <div className="flex items-center justify-center">
        <Top3Section top3={top3} />
      </div>

      {/* Right - Complete Collaborators List */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-indigo-300/60 px-2 flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          Lista de Colaboradores
        </h3>
        
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
          {sortedReps.map((rep, index) => (
            <RankingCard key={rep.user_id} rep={rep} position={index + 1} />
          ))}
        </div>

        {/* Bottom Info */}
        <div className="flex items-center justify-end gap-2 text-xs text-indigo-400/40 pt-2">
          <span>© Ranking Kairoz em tempo real</span>
        </div>
      </div>
    </div>
  );
}
