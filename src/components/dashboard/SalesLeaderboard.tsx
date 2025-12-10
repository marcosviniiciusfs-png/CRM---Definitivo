import React, { useMemo } from "react";
import { Trophy, Crown, Medal, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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

// Shield Badge Component for Podium
const ShieldBadge = ({
  rep,
  position,
  size = "large",
}: {
  rep: SalesRepData;
  position: 1 | 2 | 3;
  size?: "large" | "medium";
}) => {
  const shieldStyles = {
    1: {
      gradient: "from-yellow-300 via-yellow-500 to-yellow-700",
      border: "border-yellow-400",
      glow: "shadow-[0_0_30px_rgba(250,204,21,0.5),0_0_60px_rgba(250,204,21,0.3)]",
      iconColor: "text-yellow-300",
      bgInner: "bg-gradient-to-b from-yellow-900/50 to-yellow-950/80",
    },
    2: {
      gradient: "from-gray-200 via-gray-400 to-gray-600",
      border: "border-gray-300",
      glow: "shadow-[0_0_25px_rgba(156,163,175,0.4),0_0_50px_rgba(156,163,175,0.2)]",
      iconColor: "text-gray-300",
      bgInner: "bg-gradient-to-b from-gray-800/50 to-gray-900/80",
    },
    3: {
      gradient: "from-orange-400 via-orange-600 to-orange-800",
      border: "border-orange-500",
      glow: "shadow-[0_0_25px_rgba(249,115,22,0.4),0_0_50px_rgba(249,115,22,0.2)]",
      iconColor: "text-orange-400",
      bgInner: "bg-gradient-to-b from-orange-900/50 to-orange-950/80",
    },
  };

  const style = shieldStyles[position];
  const isLarge = size === "large";

  return (
    <div className="relative flex flex-col items-center animate-fade-in">
      {/* Crown for 1st place */}
      {position === 1 && (
        <Crown
          className={cn(
            "absolute -top-6 text-yellow-400 animate-pulse",
            isLarge ? "h-10 w-10" : "h-8 w-8"
          )}
          style={{
            filter: "drop-shadow(0 0 10px rgba(250, 204, 21, 0.8))",
          }}
        />
      )}

      {/* Shield Container */}
      <div
        className={cn(
          "relative",
          isLarge ? "w-28 h-32" : "w-24 h-28"
        )}
      >
        {/* Shield Shape with Gradient Border */}
        <div
          className={cn(
            "absolute inset-0 rounded-t-full",
            "bg-gradient-to-b",
            style.gradient,
            style.glow,
            "transition-all duration-300 hover:scale-105"
          )}
          style={{
            clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)",
          }}
        >
          {/* Inner Shield */}
          <div
            className={cn(
              "absolute inset-1 flex flex-col items-center justify-center",
              style.bgInner
            )}
            style={{
              clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)",
            }}
          >
            {/* Avatar */}
            <Avatar
              className={cn(
                "border-2",
                style.border,
                isLarge ? "h-14 w-14" : "h-12 w-12"
              )}
            >
              <AvatarImage src={rep.avatar_url || undefined} />
              <AvatarFallback className="bg-[#0a0a2a] text-cyan-400 font-bold">
                {getInitials(rep.full_name)}
              </AvatarFallback>
            </Avatar>

            {/* Position Number */}
            <span
              className={cn(
                "font-bold mt-1",
                style.iconColor,
                isLarge ? "text-lg" : "text-base"
              )}
            >
              #{position}
            </span>
          </div>
        </div>
      </div>

      {/* Name */}
      <p
        className={cn(
          "text-white font-semibold text-center mt-2 truncate max-w-[120px]",
          isLarge ? "text-sm" : "text-xs"
        )}
      >
        {rep.full_name || "Sem nome"}
      </p>

      {/* Stats */}
      <div className="flex items-center gap-3 mt-1 text-xs text-cyan-300">
        <span>Mês: {rep.won_leads}</span>
        <span className="text-gray-500">|</span>
        <span>R$ {rep.total_revenue.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
};

// Podium Section Component
const PodiumSection = ({ top3 }: { top3: SalesRepData[] }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [
    top3[0],
    top3[1] || null,
    top3[2] || null,
  ];

  return (
    <div className="relative mb-8">
      {/* Neon Glow Background Effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0, 245, 255, 0.3) 0%, transparent 70%)",
        }}
      />

      {/* Podium Layout */}
      <div className="relative flex items-end justify-center gap-4 md:gap-8 pt-8 pb-4">
        {/* 2nd Place - Left */}
        {second && (
          <div className="flex flex-col items-center">
            <ShieldBadge rep={second} position={2} size="medium" />
            <div
              className="w-20 md:w-24 h-20 mt-4 rounded-t-lg bg-gradient-to-b from-gray-600 to-gray-800"
              style={{
                boxShadow: "0 0 20px rgba(156, 163, 175, 0.3)",
              }}
            >
              <div className="h-full flex items-center justify-center">
                <Medal className="h-8 w-8 text-gray-300" />
              </div>
            </div>
          </div>
        )}

        {/* 1st Place - Center */}
        {first && (
          <div className="flex flex-col items-center -mt-4">
            <ShieldBadge rep={first} position={1} size="large" />
            <div
              className="w-24 md:w-28 h-28 mt-4 rounded-t-lg bg-gradient-to-b from-yellow-500 to-yellow-700"
              style={{
                boxShadow: "0 0 30px rgba(250, 204, 21, 0.4)",
              }}
            >
              <div className="h-full flex items-center justify-center">
                <Trophy className="h-10 w-10 text-yellow-200" />
              </div>
            </div>
          </div>
        )}

        {/* 3rd Place - Right */}
        {third && (
          <div className="flex flex-col items-center">
            <ShieldBadge rep={third} position={3} size="medium" />
            <div
              className="w-20 md:w-24 h-16 mt-4 rounded-t-lg bg-gradient-to-b from-orange-500 to-orange-700"
              style={{
                boxShadow: "0 0 20px rgba(249, 115, 22, 0.3)",
              }}
            >
              <div className="h-full flex items-center justify-center">
                <Award className="h-7 w-7 text-orange-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Podium Base with Neon Edge */}
      <div
        className="h-2 bg-gradient-to-r from-transparent via-cyan-500 to-transparent mx-auto max-w-md"
        style={{
          boxShadow: "0 0 20px rgba(0, 245, 255, 0.6)",
        }}
      />
    </div>
  );
};

// Ranking Row Component
const RankingRow = ({
  rep,
  position,
}: {
  rep: SalesRepData;
  position: number;
}) => {
  const percentage = rep.target > 0 ? Math.min((rep.won_leads / rep.target) * 100, 100) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        "bg-[#0f0f35]/80 border border-cyan-900/30",
        "hover:border-cyan-500/50 hover:bg-[#151550]/80",
        "transition-all duration-200 group"
      )}
      style={{
        boxShadow: "inset 0 1px 0 rgba(0, 245, 255, 0.05)",
      }}
    >
      {/* Position */}
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full",
          "bg-gradient-to-br from-cyan-900/50 to-purple-900/50",
          "border border-cyan-700/30 text-cyan-300 font-bold text-sm"
        )}
      >
        {position}
      </div>

      {/* Avatar */}
      <Avatar className="h-10 w-10 border-2 border-cyan-800/50 group-hover:border-cyan-500/50 transition-colors">
        <AvatarImage src={rep.avatar_url || undefined} />
        <AvatarFallback className="bg-[#0a0a2a] text-cyan-400 text-xs font-bold">
          {getInitials(rep.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">
          {rep.full_name || "Sem nome"}
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
          <span>
            Mês: <span className="text-cyan-400 font-medium">{rep.won_leads}</span>
          </span>
          <span>
            Feitas: <span className="text-purple-400 font-medium">{rep.total_leads}</span>
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-24 md:w-32">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Meta</span>
          <span className="text-cyan-400 font-medium">{Math.round(percentage)}%</span>
        </div>
        <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500"
            style={{
              width: `${percentage}%`,
              boxShadow: percentage > 0 ? "0 0 10px rgba(0, 245, 255, 0.5)" : "none",
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Loading Skeleton
const LeaderboardSkeleton = () => (
  <div className="space-y-6">
    {/* Podium Skeleton */}
    <div className="flex items-end justify-center gap-8 py-8">
      <Skeleton className="w-24 h-40 bg-gray-800" />
      <Skeleton className="w-28 h-52 bg-gray-800" />
      <Skeleton className="w-24 h-36 bg-gray-800" />
    </div>
    {/* List Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 bg-gray-800 rounded-lg" />
      ))}
    </div>
  </div>
);

// Main Component
export function SalesLeaderboard({
  reps,
  isLoading = false,
  title = "Ranking de Vendas",
}: SalesLeaderboardProps) {
  const sortedReps = useMemo(
    () => [...reps].sort((a, b) => b.total_revenue - a.total_revenue),
    [reps]
  );

  const top3 = sortedReps.slice(0, 3);
  const restRanking = sortedReps.slice(3);

  // Split into two columns
  const leftColumn = restRanking.filter((_, i) => i % 2 === 0);
  const rightColumn = restRanking.filter((_, i) => i % 2 === 1);

  if (isLoading) {
    return (
      <div className="rounded-xl p-6 bg-[#0a0a2a]">
        <LeaderboardSkeleton />
      </div>
    );
  }

  if (reps.length === 0) {
    return (
      <div className="rounded-xl p-8 bg-[#0a0a2a] text-center">
        <Trophy className="h-12 w-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Nenhum dado de vendas disponível</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-6 overflow-hidden relative"
      style={{
        background: "linear-gradient(180deg, #0a0a2a 0%, #050515 100%)",
        boxShadow:
          "0 0 40px rgba(0, 245, 255, 0.1), inset 0 1px 0 rgba(0, 245, 255, 0.1)",
      }}
    >
      {/* Background Grid Effect */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 245, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 255, 0.1) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <Trophy
            className="h-8 w-8 text-yellow-400"
            style={{
              filter: "drop-shadow(0 0 10px rgba(250, 204, 21, 0.6))",
            }}
          />
          <h2
            className="text-2xl font-bold text-white"
            style={{
              textShadow: "0 0 20px rgba(0, 245, 255, 0.3)",
            }}
          >
            {title}
          </h2>
          <Trophy
            className="h-8 w-8 text-yellow-400"
            style={{
              filter: "drop-shadow(0 0 10px rgba(250, 204, 21, 0.6))",
            }}
          />
        </div>

        {/* Podium */}
        <PodiumSection top3={top3} />

        {/* Ranking List - Two Columns */}
        {restRanking.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
            <div className="space-y-2">
              {leftColumn.map((rep, i) => (
                <RankingRow
                  key={rep.user_id}
                  rep={rep}
                  position={4 + i * 2}
                />
              ))}
            </div>
            <div className="space-y-2">
              {rightColumn.map((rep, i) => (
                <RankingRow
                  key={rep.user_id}
                  rep={rep}
                  position={5 + i * 2}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
