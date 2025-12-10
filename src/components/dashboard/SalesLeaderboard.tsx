import React, { useMemo } from "react";
import { Trophy, Crown, Medal, Award, Star } from "lucide-react";
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

// Shield Badge for Podium with 3D perspective
const PodiumShield = ({
  rep,
  position,
}: {
  rep: SalesRepData;
  position: 1 | 2 | 3;
}) => {
  const styles = {
    1: {
      frameColor: "from-yellow-400 via-yellow-500 to-yellow-600",
      innerBg: "from-red-600 to-red-900",
      glowColor: "rgba(234, 179, 8, 0.6)",
      size: "w-40 h-48",
      avatarSize: "h-20 w-20",
      transform: "rotateX(8deg)",
    },
    2: {
      frameColor: "from-cyan-300 via-cyan-400 to-cyan-500",
      innerBg: "from-blue-600 to-blue-900",
      glowColor: "rgba(34, 211, 238, 0.5)",
      size: "w-32 h-40",
      avatarSize: "h-16 w-16",
      transform: "rotateX(6deg)",
    },
    3: {
      frameColor: "from-cyan-300 via-cyan-400 to-cyan-500",
      innerBg: "from-red-600 to-red-900",
      glowColor: "rgba(34, 211, 238, 0.5)",
      size: "w-32 h-40",
      avatarSize: "h-16 w-16",
      transform: "rotateX(6deg)",
    },
  };

  const style = styles[position];

  return (
    <div className="flex flex-col items-center relative">
      {/* Crown for 1st */}
      {position === 1 && (
        <Crown 
          className="absolute -top-10 h-12 w-12 text-yellow-400 z-10"
          style={{ filter: "drop-shadow(0 0 12px rgba(234, 179, 8, 0.9))" }}
        />
      )}
      
      {/* 3D Perspective Container */}
      <div 
        className="relative"
        style={{ 
          perspective: "800px",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Shield with 3D Transform */}
        <div 
          className={cn("relative", style.size)}
          style={{
            transform: style.transform,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Shadow/Depth layer */}
          <div 
            className="absolute inset-0 bg-black/40"
            style={{
              clipPath: "polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)",
              transform: "translateZ(-20px) translateY(8px)",
              filter: "blur(8px)",
            }}
          />

          {/* Main Shield */}
          <div 
            className={cn(
              "absolute inset-0 bg-gradient-to-b p-[3px]",
              style.frameColor
            )}
            style={{
              clipPath: "polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)",
              boxShadow: `
                0 8px 32px ${style.glowColor},
                0 4px 0 rgba(0,0,0,0.3),
                inset 0 1px 0 rgba(255,255,255,0.4)
              `,
            }}
          >
            {/* Inner Background */}
            <div 
              className={cn("w-full h-full flex flex-col items-center justify-center bg-gradient-to-b relative overflow-hidden", style.innerBg)}
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)",
              }}
            >
              {/* Highlight reflection */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 40%)",
                }}
              />

              {/* Side depth effect */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-3 pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, rgba(0,0,0,0.3), transparent)",
                }}
              />
              <div 
                className="absolute right-0 top-0 bottom-0 w-3 pointer-events-none"
                style={{
                  background: "linear-gradient(-90deg, rgba(0,0,0,0.3), transparent)",
                }}
              />

              {/* Decorative top elements */}
              <div className="absolute top-3 left-3 right-3 flex justify-between z-10">
                <Star className="h-3 w-3 text-yellow-400/80" />
                <Star className="h-3 w-3 text-yellow-400/80" />
              </div>
              
              {/* Position label */}
              <span className="text-[10px] text-white/70 mb-1 font-semibold tracking-wider uppercase z-10">
                {position}º Lugar
              </span>
              
              {/* Avatar with glow */}
              <div 
                className="relative z-10"
                style={{
                  filter: `drop-shadow(0 0 8px ${style.glowColor})`,
                }}
              >
                <Avatar className={cn(style.avatarSize, "border-2 border-white/40 ring-2 ring-white/10")}>
                  <AvatarImage src={rep.avatar_url || undefined} />
                  <AvatarFallback className="bg-purple-900 text-white font-bold text-lg">
                    {getInitials(rep.full_name)}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Decorative diamond */}
              <div 
                className="mt-3 w-4 h-4 rotate-45 bg-gradient-to-br from-yellow-400 to-yellow-600 z-10"
                style={{
                  boxShadow: "0 0 8px rgba(234, 179, 8, 0.6)",
                }}
              />
            </div>
          </div>

          {/* Bottom thickness effect */}
          <div 
            className={cn("absolute left-0 right-0 h-2 bg-gradient-to-b", style.frameColor)}
            style={{
              bottom: "-4px",
              clipPath: "polygon(0 0, 100% 0, 95% 100%, 5% 100%)",
              opacity: 0.6,
              filter: "brightness(0.7)",
            }}
          />
        </div>
      </div>

      {/* Name below shield */}
      <p className="mt-4 text-white font-semibold text-sm text-center max-w-[120px] truncate drop-shadow-lg">
        {rep.full_name || "Colaborador"}
      </p>
      
      {/* Revenue badge */}
      <div className="mt-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40">
        <span className="text-xs text-yellow-300 font-medium">{formatCurrency(rep.total_revenue)}</span>
      </div>
    </div>
  );
};

// Podium Section
const PodiumSection = ({ top3 }: { top3: SalesRepData[] }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [top3[0], top3[1] || null, top3[2] || null];

  return (
    <div className="relative py-8">
      {/* Glow effect behind podium */}
      <div 
        className="absolute inset-0 opacity-40"
        style={{
          background: "radial-gradient(ellipse at center bottom, rgba(34, 211, 238, 0.4) 0%, transparent 60%)",
        }}
      />

      {/* Podium Layout - 2nd, 1st, 3rd */}
      <div className="relative flex items-end justify-center gap-6 md:gap-12">
        {/* 2nd Place */}
        {second && (
          <div className="flex flex-col items-center pb-4">
            <PodiumShield rep={second} position={2} />
          </div>
        )}

        {/* 1st Place - Elevated */}
        {first && (
          <div className="flex flex-col items-center -mt-8">
            <PodiumShield rep={first} position={1} />
          </div>
        )}

        {/* 3rd Place */}
        {third && (
          <div className="flex flex-col items-center pb-4">
            <PodiumShield rep={third} position={3} />
          </div>
        )}
      </div>

      {/* Platform Base */}
      <div className="flex justify-center mt-4">
        <div 
          className="w-96 h-6 rounded-t-lg"
          style={{
            background: "linear-gradient(to bottom, rgba(34, 211, 238, 0.3), rgba(34, 211, 238, 0.1))",
            boxShadow: "0 0 30px rgba(34, 211, 238, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        />
      </div>
    </div>
  );
};

// Ranking Card for list
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
      className="flex items-center gap-3 p-3 rounded-xl bg-indigo-950/80 border border-indigo-500/20 hover:border-indigo-400/40 transition-all"
      style={{
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Position Badge */}
      <div 
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br font-bold text-white text-sm",
          getBadgeColor(position)
        )}
      >
        {getBadgeIcon(position) || position}
      </div>

      {/* Avatar */}
      <Avatar className="h-10 w-10 border-2 border-indigo-500/30">
        <AvatarImage src={rep.avatar_url || undefined} />
        <AvatarFallback className="bg-indigo-900 text-indigo-200 text-xs font-bold">
          {getInitials(rep.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">
          {rep.full_name || "Colaborador"}
        </p>
        <div className="flex items-center gap-3 text-xs text-indigo-300/80">
          <span>Mês {rep.won_leads}</span>
          <span className="text-indigo-500">•</span>
          <span>Vendas {rep.total_leads}</span>
        </div>
      </div>

      {/* Stats Badge */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
        <Trophy className="h-3 w-3 text-yellow-400" />
        <span className="text-xs text-yellow-300 font-medium">{formatCurrency(rep.total_revenue)}</span>
      </div>
    </div>
  );
};

// Loading Skeleton
const LeaderboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-end justify-center gap-8 py-8">
      <Skeleton className="w-32 h-44 bg-indigo-800/50 rounded-lg" />
      <Skeleton className="w-36 h-52 bg-indigo-800/50 rounded-lg" />
      <Skeleton className="w-32 h-44 bg-indigo-800/50 rounded-lg" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 bg-indigo-800/50 rounded-xl" />
      ))}
    </div>
  </div>
);

// Main Component
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

  // Full list with all collaborators split into two columns
  const leftColumn: { rep: SalesRepData; position: number }[] = [];
  const rightColumn: { rep: SalesRepData; position: number }[] = [];
  
  sortedReps.forEach((rep, index) => {
    const position = index + 1;
    if (index % 2 === 0) {
      leftColumn.push({ rep, position });
    } else {
      rightColumn.push({ rep, position });
    }
  });

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
