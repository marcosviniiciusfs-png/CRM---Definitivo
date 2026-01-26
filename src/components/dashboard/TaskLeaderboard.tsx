import React, { useMemo } from "react";
import { Trophy, Medal, Award, CheckSquare, Clock, Star, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import profileFrameGold from "@/assets/profile-frame-gold.gif";

export interface LeaderboardData {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  // Métricas de vendas
  won_leads?: number;
  total_leads?: number;
  total_revenue?: number;
  target?: number;
  // Métricas de tarefas
  task_points?: number;
  tasks_completed?: number;
  tasks_on_time?: number;
  // Equipes do colaborador
  teams?: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}

interface TaskLeaderboardProps {
  data: LeaderboardData[];
  isLoading?: boolean;
  sortBy?: "revenue" | "won_leads" | "percentage" | "task_points";
  type?: "sales" | "tasks";
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
// ANIMATED GOLD FRAME - 1st Place with GIF
// ============================================
const AnimatedGoldFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative" style={{ width: 140, height: 140 }}>
    <div 
      className="absolute z-[1] flex items-center justify-center"
      style={{ 
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {children}
    </div>
    <img 
      src={profileFrameGold}
      alt="Gold Frame"
      className="absolute inset-0 w-full h-full z-[10] pointer-events-none"
      style={{ objectFit: 'contain' }}
    />
  </div>
);

// ============================================
// SIMPLE FRAME - 2nd and 3rd Place
// ============================================
const SimpleFrame = ({ children, color }: { children: React.ReactNode; color: "silver" | "bronze" }) => {
  const styles = {
    silver: {
      gradient: "from-gray-200 via-gray-400 to-gray-300",
      shadow: "0 0 15px rgba(192, 192, 192, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.2)",
    },
    bronze: {
      gradient: "from-orange-300 via-orange-500 to-orange-400",
      shadow: "0 0 15px rgba(205, 127, 50, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.2)",
    },
  };

  return (
    <div 
      className={cn("p-1 rounded-full bg-gradient-to-br", styles[color].gradient)}
      style={{ boxShadow: styles[color].shadow }}
    >
      {children}
    </div>
  );
};

// ============================================
// TOP 3 SECTION - Avatars with Frames
// ============================================
const Top3Section = ({ top3, type }: { top3: LeaderboardData[]; type: "sales" | "tasks" }) => {
  if (top3.length === 0) return null;

  const [first, second, third] = [top3[0], top3[1] || null, top3[2] || null];

  const positionConfig = {
    1: {
      size: 81,
      gradientBg: "from-yellow-400 to-yellow-600",
      icon: Trophy,
      iconColor: "text-yellow-400",
    },
    2: {
      size: 80,
      gradientBg: "from-gray-300 to-gray-500",
      icon: Medal,
      iconColor: "text-gray-300",
    },
    3: {
      size: 80,
      gradientBg: "from-orange-400 to-orange-600",
      icon: Award,
      iconColor: "text-orange-400",
    },
  };

  const orderedPositions = [
    { rep: second, position: 2 as const },
    { rep: first, position: 1 as const },
    { rep: third, position: 3 as const },
  ];

  const renderAvatar = (rep: LeaderboardData, position: 1 | 2 | 3) => {
    const config = positionConfig[position];
    
    const avatar = (
      <Avatar
        className="border-2 border-background"
        style={{
          width: config.size,
          height: config.size,
        }}
      >
        <AvatarImage src={rep.avatar_url || undefined} />
        <AvatarFallback className={cn("font-bold text-white bg-gradient-to-br text-xl", config.gradientBg)}>
          {getInitials(rep.full_name)}
        </AvatarFallback>
      </Avatar>
    );

    if (position === 1) {
      return <AnimatedGoldFrame>{avatar}</AnimatedGoldFrame>;
    }
    
    return (
      <SimpleFrame color={position === 2 ? "silver" : "bronze"}>
        {avatar}
      </SimpleFrame>
    );
  };

  const getMetricDisplay = (rep: LeaderboardData) => {
    if (type === "tasks") {
      return `${rep.task_points || 0} pts`;
    }
    return formatCurrency(rep.total_revenue || 0);
  };

  return (
    <div className="flex items-end justify-center gap-8 py-6">
      {orderedPositions.map(({ rep, position }) => {
        if (!rep) return <div key={position} className="w-24" />;
        
        const config = positionConfig[position];
        const Icon = config.icon;

        return (
          <div 
            key={rep.user_id} 
            className={cn(
              "flex flex-col items-center gap-2",
              position === 1 ? "mb-6" : "mb-0"
            )}
          >
            <Icon className={cn("h-6 w-6", config.iconColor)} />
            {renderAvatar(rep, position)}

            <span className="font-bold text-foreground text-sm text-center truncate max-w-[100px]">
              {rep.full_name || "Colaborador"}
            </span>

            <span className="text-xs text-muted-foreground">
              {getMetricDisplay(rep)}
            </span>

            {type === "tasks" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3" />
                <span>{rep.tasks_completed || 0} tarefas</span>
              </div>
            )}

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
  type,
}: {
  rep: LeaderboardData;
  position: number;
  type: "sales" | "tasks";
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
      className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border hover:border-primary/40 transition-all max-w-lg"
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
      <Avatar className="h-9 w-9 border border-border shrink-0">
        <AvatarImage src={rep.avatar_url || undefined} />
        <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-bold">
          {getInitials(rep.full_name)}
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-foreground font-medium text-xs truncate">
          {rep.full_name || "Colaborador"}
        </p>
        {type === "tasks" ? (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{rep.tasks_completed || 0} tarefas</span>
            <span className="text-muted-foreground/50">•</span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {rep.tasks_on_time || 0} no prazo
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>Mês {rep.won_leads || 0}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>Vendas {rep.total_leads || 0}</span>
          </div>
        )}
      </div>

      {/* Teams Badges */}
      {rep.teams && rep.teams.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {rep.teams.slice(0, 3).map(team => (
            <div 
              key={team.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium"
              style={{ 
                borderColor: team.color || 'hsl(var(--border))',
                color: team.color || 'hsl(var(--muted-foreground))',
                backgroundColor: team.color ? `${team.color}15` : 'transparent'
              }}
            >
              <Users className="h-2.5 w-2.5" />
              <span className="truncate max-w-[60px]">{team.name}</span>
            </div>
          ))}
          {rep.teams.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{rep.teams.length - 3}</span>
          )}
        </div>
      )}

      {/* Stats Badge */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
              {type === "tasks" ? (
                <>
                  <Star className="h-2.5 w-2.5 text-yellow-400" />
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-300 font-medium">
                    {rep.task_points || 0} pts
                  </span>
                </>
              ) : (
                <>
                  <Trophy className="h-2.5 w-2.5 text-yellow-400" />
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-300 font-medium">
                    {formatCurrency(rep.total_revenue || 0)}
                  </span>
                </>
              )}
            </div>
          </TooltipTrigger>
          {type === "tasks" && (
            <TooltipContent>
              <div className="text-xs space-y-1">
                <p className="font-semibold">Sistema de Pontuação:</p>
                <p>• Tarefa concluída: 2 pts</p>
                <p>• Dentro do prazo: +1 pt</p>
                <p>• Dentro do timer: +3 pts</p>
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

// ============================================
// LOADING SKELETON
// ============================================
const LeaderboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-end justify-center gap-8 py-8">
      <Skeleton className="w-28 h-36 bg-muted rounded-lg" />
      <Skeleton className="w-36 h-44 bg-muted rounded-lg" />
      <Skeleton className="w-28 h-36 bg-muted rounded-lg" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 bg-muted rounded-xl" />
      ))}
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
export function TaskLeaderboard({
  data,
  isLoading = false,
  sortBy = "task_points",
  type = "tasks",
}: TaskLeaderboardProps) {
  const sortedData = useMemo(() => {
    const sorted = [...data];
    switch (sortBy) {
      case "task_points":
        return sorted.sort((a, b) => (b.task_points || 0) - (a.task_points || 0));
      case "revenue":
        return sorted.sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
      case "won_leads":
        return sorted.sort((a, b) => (b.won_leads || 0) - (a.won_leads || 0));
      case "percentage":
        const getPercentage = (r: LeaderboardData) => (r.target || 0) > 0 ? ((r.won_leads || 0) / (r.target || 1)) * 100 : 0;
        return sorted.sort((a, b) => getPercentage(b) - getPercentage(a));
      default:
        return sorted;
    }
  }, [data, sortBy]);

  const top3 = sortedData.slice(0, 3);

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        {type === "tasks" ? (
          <>
            <CheckSquare className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-lg">Nenhuma tarefa concluída neste período</p>
            <p className="text-muted-foreground/60 text-sm mt-1">Conclua tarefas para aparecer no ranking</p>
          </>
        ) : (
          <>
            <Trophy className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-lg">Nenhum dado de vendas disponível</p>
            <p className="text-muted-foreground/60 text-sm mt-1">Realize vendas para aparecer no ranking</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
      {/* Left - Podium */}
      <div className="flex items-center justify-center">
        <Top3Section top3={top3} type={type} />
      </div>

      {/* Right - Complete Collaborators List */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground px-2 flex items-center gap-2">
          {type === "tasks" ? (
            <>
              <CheckSquare className="h-4 w-4" />
              Ranking de Tarefas
            </>
          ) : (
            <>
              <Trophy className="h-4 w-4" />
              Lista de Colaboradores
            </>
          )}
        </h3>
        
        <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2">
          {sortedData.map((rep, index) => (
            <RankingCard key={rep.user_id} rep={rep} position={index + 1} type={type} />
          ))}
        </div>

        {/* Bottom Info */}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground/60 pt-2">
          <span>© Ranking Kairoz em tempo real</span>
        </div>
      </div>
    </div>
  );
}
