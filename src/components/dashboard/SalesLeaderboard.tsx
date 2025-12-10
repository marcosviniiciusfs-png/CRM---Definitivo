import React, { useMemo } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import podiumBase from "@/assets/podium-base.png";

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
// PODIUM SECTION - Image Based with Avatars
// ============================================
const PodiumSection = ({ top3 }: { top3: SalesRepData[] }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [top3[0], top3[1] || null, top3[2] || null];

  return (
    <div className="relative w-[420px]">
      {/* Podium Image as base */}
      <img 
        src={podiumBase} 
        alt="Podium"
        className="w-full h-auto object-contain"
      />

      {/* 1st Place Avatar - Center (on top of highest step) */}
      {first && (
        <div 
          className="absolute flex flex-col items-center"
          style={{ 
            left: "50%", 
            top: "8%", 
            transform: "translateX(-50%)" 
          }}
        >
          <Avatar
            className="border-4 border-yellow-400/90 shadow-xl"
            style={{
              width: 85,
              height: 85,
              boxShadow: "0 4px 25px rgba(255, 200, 0, 0.6)",
            }}
          >
            <AvatarImage src={first.avatar_url || undefined} />
            <AvatarFallback className="font-bold bg-gradient-to-br from-yellow-400 to-yellow-600 text-white text-xl">
              {getInitials(first.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="mt-1 font-bold text-foreground text-sm text-center truncate max-w-[100px] drop-shadow-lg">
            {first.full_name || "Colaborador"}
          </span>
        </div>
      )}

      {/* 2nd Place Avatar - Left (on second step) */}
      {second && (
        <div 
          className="absolute flex flex-col items-center"
          style={{ 
            left: "18%", 
            top: "28%", 
            transform: "translateX(-50%)" 
          }}
        >
          <Avatar
            className="border-3 border-white/90 shadow-xl"
            style={{
              width: 65,
              height: 65,
              boxShadow: "0 4px 20px rgba(192, 192, 192, 0.5)",
            }}
          >
            <AvatarImage src={second.avatar_url || undefined} />
            <AvatarFallback className="font-bold bg-gradient-to-br from-gray-400 to-gray-600 text-white text-lg">
              {getInitials(second.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="mt-1 font-bold text-foreground text-xs text-center truncate max-w-[80px] drop-shadow-lg">
            {second.full_name || "Colaborador"}
          </span>
        </div>
      )}

      {/* 3rd Place Avatar - Right (on third step) */}
      {third && (
        <div 
          className="absolute flex flex-col items-center"
          style={{ 
            right: "18%", 
            top: "38%", 
            transform: "translateX(50%)" 
          }}
        >
          <Avatar
            className="border-3 border-white/90 shadow-xl"
            style={{
              width: 65,
              height: 65,
              boxShadow: "0 4px 20px rgba(205, 127, 50, 0.5)",
            }}
          >
            <AvatarImage src={third.avatar_url || undefined} />
            <AvatarFallback className="font-bold bg-gradient-to-br from-orange-400 to-orange-600 text-white text-lg">
              {getInitials(third.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="mt-1 font-bold text-foreground text-xs text-center truncate max-w-[80px] drop-shadow-lg">
            {third.full_name || "Colaborador"}
          </span>
        </div>
      )}
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
        <PodiumSection top3={top3} />
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
