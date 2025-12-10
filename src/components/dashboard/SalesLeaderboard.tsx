import React, { useMemo } from "react";
import { Trophy, Crown, Medal, Award } from "lucide-react";
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
// PODIUM SHIELD - Hexagonal Metallic Style
// ============================================
const PodiumShield = ({
  rep,
  position,
}: {
  rep: SalesRepData;
  position: 1 | 2 | 3;
}) => {
  const styles = {
    1: {
      // GOLD - 1st Place
      background: "linear-gradient(180deg, #ffc800 0%, #a88a00 100%)",
      border: "#ffd700",
      glow: "0 0 25px rgba(0, 200, 255, 0.8), inset 0 0 10px rgba(255, 255, 100, 0.5)",
      width: 140,
      height: 175,
      avatarSize: 70,
    },
    2: {
      // SILVER - 2nd Place
      background: "linear-gradient(180deg, #e0e0e0 0%, #808080 100%)",
      border: "#c0c0c0",
      glow: "0 0 15px rgba(0, 200, 255, 0.6)",
      width: 120,
      height: 150,
      avatarSize: 60,
    },
    3: {
      // BRONZE - 3rd Place
      background: "linear-gradient(180deg, #d38d3d 0%, #8f5315 100%)",
      border: "#cd7f32",
      glow: "0 0 10px rgba(0, 200, 255, 0.4)",
      width: 110,
      height: 135,
      avatarSize: 55,
    },
  };

  const style = styles[position];

  return (
    <div className="flex flex-col items-center">
      {/* Crown for 1st place */}
      {position === 1 && (
        <Crown 
          className="h-10 w-10 text-yellow-400 mb-2"
          style={{ filter: "drop-shadow(0 0 8px rgba(234, 179, 8, 0.8))" }}
        />
      )}

      {/* Shield with hexagonal clip-path */}
      <div
        className="relative flex flex-col items-center justify-center transition-transform duration-300 hover:scale-105"
        style={{
          width: style.width,
          height: style.height,
          background: style.background,
          border: `3px solid ${style.border}`,
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          boxShadow: style.glow,
        }}
      >
        {/* Profile Picture */}
        <Avatar
          className="border-2 border-white shadow-lg"
          style={{
            width: style.avatarSize,
            height: style.avatarSize,
          }}
        >
          <AvatarImage src={rep.avatar_url || undefined} />
          <AvatarFallback 
            className="font-bold"
            style={{
              background: "linear-gradient(135deg, #1a1a3a, #2a2a5a)",
              color: "white",
              fontSize: style.avatarSize * 0.3,
            }}
          >
            {getInitials(rep.full_name)}
          </AvatarFallback>
        </Avatar>

        {/* Name inside shield */}
        <span 
          className="mt-2 font-bold text-white text-center px-2 truncate w-full"
          style={{
            fontSize: position === 1 ? 14 : 12,
            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          {rep.full_name?.split(" ")[0] || "Colaborador"}
        </span>
      </div>

      {/* Position Base */}
      <div 
        className="mt-3 font-bold text-white text-center"
        style={{
          fontSize: position === 1 ? 24 : 20,
          textShadow: "0 0 10px rgba(0, 200, 255, 0.8)",
        }}
      >
        {position}º
      </div>

      {/* Revenue Badge */}
      <div 
        className="mt-1 px-3 py-1 rounded-full text-xs font-semibold"
        style={{
          background: "rgba(0, 200, 255, 0.2)",
          border: "1px solid rgba(0, 200, 255, 0.4)",
          color: "rgba(0, 200, 255, 1)",
        }}
      >
        {formatCurrency(rep.total_revenue)}
      </div>
    </div>
  );
};

// ============================================
// PODIUM SECTION - Container with Neon Floor
// ============================================
const PodiumSection = ({ top3 }: { top3: SalesRepData[] }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [top3[0], top3[1] || null, top3[2] || null];

  return (
    <div 
      className="relative overflow-hidden py-8 px-4"
      style={{
        minHeight: 380,
      }}
    >
      {/* Neon Floor Effect */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-0"
        style={{
          height: 50,
          background: "radial-gradient(circle at center, rgba(0, 200, 255, 0.3) 0%, rgba(0, 200, 255, 0) 70%)",
          boxShadow: "0 0 30px 10px rgba(0, 200, 255, 0.5)",
        }}
      />

      {/* Podium Layout - 2nd, 1st, 3rd aligned at bottom */}
      <div className="relative z-10 flex items-end justify-center gap-4 md:gap-8">
        {/* 2nd Place - 75% height offset */}
        {second && (
          <div style={{ marginTop: 50 }}>
            <PodiumShield rep={second} position={2} />
          </div>
        )}

        {/* 1st Place - Full height (no offset) */}
        {first && (
          <div>
            <PodiumShield rep={first} position={1} />
          </div>
        )}

        {/* 3rd Place - 60% height offset */}
        {third && (
          <div style={{ marginTop: 70 }}>
            <PodiumShield rep={third} position={3} />
          </div>
        )}
      </div>
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
      className="flex items-center gap-2 p-2 rounded-lg bg-indigo-950/80 border border-indigo-500/20 hover:border-indigo-400/40 transition-all max-w-sm"
      style={{
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Position Badge */}
      <div 
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br font-bold text-white text-xs",
          getBadgeColor(position)
        )}
      >
        {getBadgeIcon(position) || position}
      </div>

      {/* Avatar */}
      <Avatar className="h-8 w-8 border border-indigo-500/30">
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
