import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, Flag, Calendar, Trophy, Users, TrendingUp, Target, Edit2, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, startOfWeek, endOfWeek } from "date-fns";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

type PeriodType = "week" | "month" | "quarter" | "year";

interface RacerData {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  appointments_count: number;
}

interface AppointmentRaceTabProps {
  organizationId: string;
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

const getDateRange = (periodType: PeriodType) => {
  const now = new Date();
  switch (periodType) {
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
  }
};

// ============================================
// RACE TRACK COMPONENT
// ============================================
const RaceTrack = ({ 
  racer, 
  position, 
  maxProgress, 
  isLeader,
  index,
  goalTarget
}: { 
  racer: RacerData; 
  position: number;
  maxProgress: number; 
  isLeader: boolean;
  index: number;
  goalTarget: number;
}) => {
  // Calculate position percentage based on goal or max appointments
  const baseForProgress = goalTarget > 0 ? goalTarget : maxProgress;
  const progressPercent = baseForProgress > 0 
    ? Math.min((racer.appointments_count / baseForProgress) * 85, 85) 
    : 0;

  // Alternating track colors for visual distinction
  const trackColors = [
    "bg-gradient-to-r from-blue-500/10 to-blue-500/5",
    "bg-gradient-to-r from-purple-500/10 to-purple-500/5",
    "bg-gradient-to-r from-green-500/10 to-green-500/5",
    "bg-gradient-to-r from-orange-500/10 to-orange-500/5",
    "bg-gradient-to-r from-pink-500/10 to-pink-500/5",
  ];

  return (
    <div className="relative">
      {/* Track Lane - increased height to accommodate crown */}
      <div 
        className={cn(
          "relative h-24 rounded-lg border border-border/50",
          trackColors[index % trackColors.length]
        )}
      >
        {/* Track lines (dashed center line) */}
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-dashed border-muted-foreground/20" />
        </div>

        {/* Start line */}
        <div className="absolute left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-green-500 to-green-600 rounded-full" />
        
        {/* Finish line flag */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground/60">
          <Flag className="h-4 w-4" />
        </div>

        {/* Animated Avatar Runner */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 z-10"
          initial={{ left: "5%" }}
          animate={{ left: `calc(5% + ${progressPercent}%)` }}
          transition={{ 
            type: "spring", 
            stiffness: 50, 
            damping: 15,
            delay: index * 0.15
          }}
        >
          <div className="relative">
            {/* Crown for leader - positioned above and centered */}
            {isLeader && racer.appointments_count > 0 && (
              <motion.div 
                className="absolute -top-7 left-1/2 z-20"
                style={{ transform: 'translateX(-50%)' }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.5 + index * 0.15, type: "spring" }}
              >
                <Crown className="h-6 w-6 text-yellow-500 fill-yellow-400 drop-shadow-lg" />
              </motion.div>
            )}
            
            {/* Avatar with subtle pulse animation */}
            <motion.div
              animate={{ 
                scale: [1, 1.05, 1],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Avatar className={cn(
                "h-12 w-12 border-2 shadow-lg",
                isLeader ? "border-yellow-500 ring-2 ring-yellow-400/50" : "border-primary/50"
              )}>
                <AvatarImage src={racer.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold">
                  {getInitials(racer.full_name)}
                </AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Count badge */}
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border border-background">
              {racer.appointments_count}
            </div>
          </div>
        </motion.div>

        {/* Racer info overlay */}
        <div className="absolute left-16 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/70">
            {position}º
          </span>
          <span className="text-sm text-muted-foreground truncate max-w-[120px]">
            {racer.full_name || "Colaborador"}
          </span>
        </div>

        {/* Appointments count on right */}
        <div className="absolute right-12 top-1/2 -translate-y-1/2 text-right">
          <span className="text-xs text-muted-foreground">
            {racer.appointments_count} agendamento{racer.appointments_count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// GOAL EDITOR COMPONENT
// ============================================
const GoalEditor = ({ 
  currentGoal, 
  onSave, 
  canEdit 
}: { 
  currentGoal: number; 
  onSave: (value: number) => Promise<void>;
  canEdit: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentGoal.toString());
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) {
      toast.error("Meta deve ser um número maior que zero");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(numValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(currentGoal.toString());
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-muted-foreground">Meta:</span>
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 h-8 text-sm"
          min={1}
          autoFocus
        />
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-7 w-7" 
          onClick={handleSave}
          disabled={isSaving}
        >
          <Check className="h-4 w-4 text-green-500" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-7 w-7" 
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Target className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-muted-foreground">
        Meta: <span className="text-foreground font-bold">{currentGoal}</span> agendamentos
      </span>
      {canEdit && (
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-7 w-7" 
          onClick={() => setIsEditing(true)}
        >
          <Edit2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
};

// ============================================
// STATS CARD
// ============================================
const StatsCard = ({ racers, period, goalTarget }: { racers: RacerData[]; period: string; goalTarget: number }) => {
  const totalAppointments = racers.reduce((sum, r) => sum + r.appointments_count, 0);
  
  // Calculate average based only on members who have at least 1 appointment
  const activeRacers = racers.filter(r => r.appointments_count > 0);
  const avgAppointments = activeRacers.length > 0 
    ? (totalAppointments / activeRacers.length).toFixed(1) 
    : "0";
  
  const leader = racers.length > 0 ? racers[0] : null;

  const periodLabels: Record<string, string> = {
    week: "Esta Semana",
    month: "Este Mês",
    quarter: "Este Trimestre",
    year: "Este Ano",
  };

  // Calculate goal progress percentage
  const goalProgress = goalTarget > 0 ? Math.min((totalAppointments / goalTarget) * 100, 100) : 0;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Estatísticas - {periodLabels[period] || "Período"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">{totalAppointments}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Total de Agendamentos
            </p>
            {goalTarget > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progresso da meta</span>
                  <span className="font-medium">{goalProgress.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-primary to-primary/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${goalProgress}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">{avgAppointments}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Média por Colaborador
            </p>
            <p className="text-[10px] text-muted-foreground/70 italic">
              (apenas ativos)
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-2xl font-bold text-foreground">{racers.length}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Participantes
            </p>
          </div>
          
          <div className="space-y-1 flex items-center gap-3">
            {leader && leader.appointments_count > 0 ? (
              <>
                <Avatar className="h-10 w-10 border-2 border-yellow-500">
                  <AvatarImage src={leader.avatar_url || undefined} />
                  <AvatarFallback className="bg-yellow-500 text-white font-bold text-xs">
                    {getInitials(leader.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[100px]">
                    {leader.full_name || "Líder"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-yellow-500" />
                    {leader.appointments_count} agend.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum líder ainda</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================
// LOADING SKELETON
// ============================================
const RaceSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Skeleton key={i} className="h-24 w-full rounded-lg" />
    ))}
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
export function AppointmentRaceTab({ organizationId }: AppointmentRaceTabProps) {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [racers, setRacers] = useState<RacerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [goalTarget, setGoalTarget] = useState(10);
  const { permissions } = useOrganization();

  const canEditGoal = permissions.role === 'owner' || permissions.role === 'admin';

  const loadRaceData = async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const { start, end } = getDateRange(period);
      const now = new Date();

      // Load goal for current month (only relevant when period is "month")
      if (period === "month") {
        const { data: goalData } = await supabase
          .from('appointment_goals')
          .select('target_value')
          .eq('organization_id', organizationId)
          .eq('month', now.getMonth() + 1)
          .eq('year', now.getFullYear())
          .maybeSingle();

        if (goalData) {
          setGoalTarget(goalData.target_value);
        } else {
          setGoalTarget(10); // Default goal
        }
      }

      // Get organization members
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);

      const userIds = (members || []).map(m => m.user_id).filter(Boolean);

      if (userIds.length === 0) {
        setRacers([]);
        setIsLoading(false);
        return;
      }

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      // Get leads with calendar_event_id (appointments) within period
      const { data: leads } = await supabase
        .from('leads')
        .select('responsavel_user_id, calendar_event_id, created_at')
        .eq('organization_id', organizationId)
        .not('calendar_event_id', 'is', null)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .in('responsavel_user_id', userIds);

      // Count appointments per user
      const appointmentsByUser = new Map<string, number>();
      for (const lead of leads || []) {
        if (lead.responsavel_user_id) {
          const current = appointmentsByUser.get(lead.responsavel_user_id) || 0;
          appointmentsByUser.set(lead.responsavel_user_id, current + 1);
        }
      }

      // Build racer data
      const racerData: RacerData[] = userIds.map(userId => {
        const profile = (profiles || []).find(p => p.user_id === userId);
        return {
          user_id: userId,
          full_name: profile?.full_name || null,
          avatar_url: profile?.avatar_url || null,
          appointments_count: appointmentsByUser.get(userId) || 0,
        };
      });

      // Sort by appointments count (descending)
      racerData.sort((a, b) => b.appointments_count - a.appointments_count);

      setRacers(racerData);
    } catch (error) {
      console.error('Erro ao carregar dados da corrida:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGoal = async (value: number) => {
    const now = new Date();
    
    const { error } = await supabase
      .from('appointment_goals')
      .upsert({
        organization_id: organizationId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        target_value: value,
      }, {
        onConflict: 'organization_id,month,year'
      });

    if (error) {
      console.error('Erro ao salvar meta:', error);
      toast.error("Erro ao salvar meta de agendamentos");
      throw error;
    }

    setGoalTarget(value);
    toast.success("Meta de agendamentos atualizada!");
  };

  useEffect(() => {
    loadRaceData();
  }, [organizationId, period]);

  const maxAppointments = useMemo(() => {
    return Math.max(...racers.map(r => r.appointments_count), 1);
  }, [racers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg">
            <Flag className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Corrida de Agendamentos</h2>
            <p className="text-sm text-muted-foreground">Veja quem está na frente!</p>
          </div>
        </div>

        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Esta Semana</SelectItem>
            <SelectItem value="month">Este Mês</SelectItem>
            <SelectItem value="quarter">Este Trimestre</SelectItem>
            <SelectItem value="year">Este Ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Goal Editor - Only shown for month period */}
      {period === "month" && (
        <Card className="p-4">
          <GoalEditor 
            currentGoal={goalTarget} 
            onSave={handleSaveGoal} 
            canEdit={canEditGoal}
          />
        </Card>
      )}

      {/* Race Track Container */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span>START</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>FINISH</span>
            <Flag className="h-4 w-4" />
          </div>
        </div>

        {isLoading ? (
          <RaceSkeleton />
        ) : racers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-lg">Nenhum participante ainda</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              Agende reuniões para competir na corrida!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {racers.map((racer, index) => (
              <RaceTrack
                key={racer.user_id}
                racer={racer}
                position={index + 1}
                maxProgress={maxAppointments}
                isLeader={index === 0 && racer.appointments_count > 0}
                index={index}
                goalTarget={period === "month" ? goalTarget : 0}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Stats */}
      {!isLoading && racers.length > 0 && (
        <StatsCard racers={racers} period={period} goalTarget={period === "month" ? goalTarget : 0} />
      )}
    </div>
  );
}
