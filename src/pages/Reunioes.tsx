import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Crown,
  HelpCircle,
  RefreshCw,
  Search,
  Target,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import {
  addDays,
  addWeeks,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type MeetingStatus = "realizada" | "no_show" | "pendente";
type StatusFilter = "all" | MeetingStatus;

interface LeadActivityRow {
  id: string;
  lead_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
}

interface LeadRow {
  id: string;
  nome_lead: string;
  responsavel: string | null;
  responsavel_user_id: string | null;
  avatar_url: string | null;
  valor: number | null;
  stage: string | null;
  status_reuniao?: "realizada" | "no_show" | null;
}

interface MemberRow {
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface TeamRow {
  id: string;
  name: string;
  color: string | null;
}

interface TeamMemberRow {
  team_id: string;
  user_id: string;
}

interface Meeting {
  id: string;
  leadId: string;
  leadName: string;
  ownerId: string | null;
  ownerName: string;
  teamId: string | null;
  teamName: string;
  teamColor: string | null;
  avatarUrl: string | null;
  value: number;
  stage: string | null;
  status: MeetingStatus;
  scheduledAt: Date;
}

interface RankingRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  teamName: string;
  scheduled: number;
  attended: number;
  missed: number;
  pending: number;
  sales: number;
  revenue: number;
  attendanceRate: number;
  score: number;
}

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

const avatarStyles = [
  { emoji: "🚀", gradient: "from-sky-500 via-cyan-400 to-emerald-400" },
  { emoji: "⚡", gradient: "from-amber-400 via-orange-500 to-rose-500" },
  { emoji: "💎", gradient: "from-fuchsia-500 via-violet-500 to-indigo-500" },
  { emoji: "🎯", gradient: "from-emerald-500 via-lime-400 to-yellow-400" },
  { emoji: "🔥", gradient: "from-red-500 via-pink-500 to-purple-500" },
  { emoji: "🧠", gradient: "from-blue-500 via-indigo-500 to-slate-700" },
  { emoji: "🌟", gradient: "from-yellow-300 via-amber-500 to-orange-600" },
  { emoji: "🛡️", gradient: "from-slate-500 via-zinc-700 to-stone-900" },
];

const getAvatarStyle = (seed: string) => {
  const value = Array.from(seed || "?").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarStyles[value % avatarStyles.length];
};

const parseMeetingDate = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    const rawDate = String(parsed?.data || "").trim();
    const rawTime = String(parsed?.hora || "00:00").trim();
    if (!rawDate) return null;

    const normalizedTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return parseISO(`${rawDate}T${normalizedTime}`);

    const brDate = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (brDate) {
      const [, day, month, year] = brDate;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return parseISO(`${fullYear}-${month}-${day}T${normalizedTime}`);
    }
  } catch {
    return null;
  }
  return null;
};

const getStatusLabel = (status: MeetingStatus) => {
  if (status === "realizada") return "Veio";
  if (status === "no_show") return "Faltou";
  return "Pendente";
};

const statusClassName: Record<MeetingStatus, string> = {
  realizada: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  no_show: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  pendente: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
};

const metricTooltips = {
  topSales: "Responsavel com maior receita em vendas fechadas vinculadas a reunioes do mes atual.",
  topTeam: "Equipe com maior receita em vendas fechadas vinculadas a reunioes do mes atual.",
  biweeklyGoal: "Soma da receita mapeada no mes. A meta visual aparece aqui ate existir uma configuracao de meta persistida.",
  topScheduled: "Responsavel com maior quantidade de reunioes agendadas na semana filtrada.",
  topAttendance: "Responsavel com maior volume de reunioes marcadas como compareceu na semana filtrada.",
  total: "Total de reunioes agendadas dentro da semana e dos filtros selecionados.",
  attended: "Reunioes com status marcado como realizada, exibidas como Veio.",
  missed: "Reunioes com status marcado como no-show, exibidas como Faltou.",
  pending: "Reunioes agendadas sem status final de comparecimento ou falta.",
  rescheduled: "Reservado para reunioes remarcadas. Hoje fica zerado porque ainda nao ha fonte persistida de remarcacao.",
  attendanceRate: "Percentual de comparecimento: Vieram dividido por Vieram + Faltaram.",
  dayRate: "Percentual de comparecimento apenas deste dia: Vieram dividido por Vieram + Faltaram.",
  rankScheduled: "Quantidade de reunioes agendadas pelo responsavel no periodo filtrado.",
  rankAttended: "Quantidade de reunioes do responsavel marcadas como Veio.",
  rankMissed: "Quantidade de reunioes do responsavel marcadas como Faltou.",
  rankConversion: "Taxa de comparecimento do responsavel: Vieram dividido por Vieram + Faltaram.",
  rankScore: "Pontuacao: 10 por reuniao agendada, 20 por comparecimento, 50 por venda fechada e -5 por falta.",
  podiumScore: "Pontuacao calculada com base em agenda, comparecimento, vendas fechadas e faltas.",
};

const isClosedSale = (meeting: Meeting) => {
  const stage = meeting.stage?.toLowerCase() || "";
  return meeting.value > 0 && (stage.includes("ganho") || stage.includes("cliente") || stage.includes("fech"));
};

const MEETING_ACTIVITY_TYPES = ["Agendamento Reunião", "Agendamento Reuniao"];

const getNextBusinessDay = () => {
  const date = addDays(new Date(), 1);
  const day = date.getDay();
  if (day === 0) return addDays(date, 1);
  if (day === 6) return addDays(date, 2);
  return date;
};

const Reunioes = () => {
  const { organizationId, permissions } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [teamFilter, setTeamFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [hasAutoFocusedWeek, setHasAutoFocusedWeek] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const weekStart = startOfDay(weekAnchor);
  const weekEnd = endOfDay(addDays(weekStart, 6));
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const dashboardQuery = useQuery({
    queryKey: ["reunioes-dashboard", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");

      const [{ data: leadsData, error: leadsError }, { data: membersData }, { data: profilesData }, { data: teamsData }, { data: teamMembersData }] =
        await Promise.all([
          supabase
            .from("leads")
            .select("id, nome_lead, responsavel, responsavel_user_id, avatar_url, valor, stage, status_reuniao")
            .eq("organization_id", organizationId) as any,
          supabase.from("organization_members").select("user_id, display_name, email, role").eq("organization_id", organizationId).eq("is_active", true),
          supabase.from("profiles").select("user_id, full_name, avatar_url"),
          supabase.from("teams").select("id, name, color").eq("organization_id", organizationId),
          supabase.from("team_members").select("team_id, user_id"),
        ]);

      if (leadsError) throw leadsError;

      const leads = ((leadsData || []) as LeadRow[]);
      const leadIds = leads.map((lead) => lead.id);

      const { data: activities, error: activitiesError } = leadIds.length
        ? await supabase
            .from("lead_activities")
            .select("id, lead_id, user_id, content, created_at")
            .in("lead_id", leadIds)
            .in("activity_type", MEETING_ACTIVITY_TYPES)
            .order("created_at", { ascending: false })
        : { data: [], error: null };

      if (activitiesError) throw activitiesError;

      const parsedActivities = ((activities || []) as LeadActivityRow[])
        .map((activity) => {
          const scheduledAt = parseMeetingDate(activity.content);
          return scheduledAt ? { ...activity, scheduledAt } : null;
        })
        .filter((activity): activity is LeadActivityRow & { scheduledAt: Date } => Boolean(activity));
      const members = ((membersData || []) as MemberRow[]);
      const profiles = ((profilesData || []) as ProfileRow[]);
      const teams = ((teamsData || []) as TeamRow[]);
      const teamMembers = ((teamMembersData || []) as TeamMemberRow[]);

      const memberByUser = new Map(members.filter((member) => member.user_id).map((member) => [member.user_id as string, member]));
      const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
      const teamById = new Map(teams.map((team) => [team.id, team]));
      const teamIdByUser = new Map(teamMembers.map((member) => [member.user_id, member.team_id]));
      const leadById = new Map(leads.map((lead) => [lead.id, lead]));

      const meetings = parsedActivities
        .map((activity) => {
          const lead = leadById.get(activity.lead_id);
          if (!lead) return null;

          const ownerId = lead.responsavel_user_id || activity.user_id || null;
          const profile = ownerId ? profileByUser.get(ownerId) : null;
          const member = ownerId ? memberByUser.get(ownerId) : null;
          const teamId = ownerId ? teamIdByUser.get(ownerId) || null : null;
          const team = teamId ? teamById.get(teamId) : null;
          const status = lead.status_reuniao === "realizada" || lead.status_reuniao === "no_show" ? lead.status_reuniao : "pendente";

          return {
            id: activity.id,
            leadId: lead.id,
            leadName: lead.nome_lead,
            ownerId,
            ownerName: profile?.full_name || member?.display_name || lead.responsavel || "Sem responsavel",
            teamId,
            teamName: team?.name || "Sem equipe",
            teamColor: team?.color || null,
            avatarUrl: lead.avatar_url || profile?.avatar_url || null,
            value: Number(lead.valor || 0),
            stage: lead.stage,
            status,
            scheduledAt: activity.scheduledAt,
          } satisfies Meeting;
        })
        .filter((meeting): meeting is Meeting => Boolean(meeting));

      return { meetings, teams, members, profiles };
    },
  });

  const allMeetings = dashboardQuery.data?.meetings || [];
  const teams = dashboardQuery.data?.teams || [];

  const weekMeetings = useMemo(
    () => allMeetings.filter((meeting) => meeting.scheduledAt >= weekStart && meeting.scheduledAt <= weekEnd),
    [allMeetings, weekStart, weekEnd],
  );

  useEffect(() => {
    if (hasAutoFocusedWeek || dashboardQuery.isLoading || allMeetings.length === 0 || weekMeetings.length > 0) return;

    const today = startOfDay(new Date());
    const nextMeeting = [...allMeetings]
      .filter((meeting) => meeting.scheduledAt >= today)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
    const fallbackMeeting = [...allMeetings].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())[0];
    const targetMeeting = nextMeeting || fallbackMeeting;

    if (targetMeeting) {
      setWeekAnchor(startOfWeek(targetMeeting.scheduledAt, { weekStartsOn: 0 }));
      setHasAutoFocusedWeek(true);
    }
  }, [allMeetings, dashboardQuery.isLoading, hasAutoFocusedWeek, weekMeetings.length]);

  const filteredMeetings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return weekMeetings.filter((meeting) => {
      if (teamFilter !== "all" && meeting.teamId !== teamFilter) return false;
      if (ownerFilter !== "all" && meeting.ownerId !== ownerFilter) return false;
      if (statusFilter !== "all" && meeting.status !== statusFilter) return false;
      if (normalizedSearch && !meeting.leadName.toLowerCase().includes(normalizedSearch) && !meeting.ownerName.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [ownerFilter, search, statusFilter, teamFilter, weekMeetings]);

  const owners = useMemo(() => {
    const rows = new Map<string, string>();
    weekMeetings.forEach((meeting) => {
      if (meeting.ownerId) rows.set(meeting.ownerId, meeting.ownerName);
    });
    return Array.from(rows.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [weekMeetings]);

  const kpis = useMemo(() => {
    const total = filteredMeetings.length;
    const attended = filteredMeetings.filter((meeting) => meeting.status === "realizada").length;
    const missed = filteredMeetings.filter((meeting) => meeting.status === "no_show").length;
    const pending = filteredMeetings.filter((meeting) => meeting.status === "pendente").length;
    const attendanceBase = attended + missed;
    return {
      total,
      attended,
      missed,
      pending,
      rescheduled: 0,
      attendanceRate: attendanceBase ? Math.round((attended / attendanceBase) * 100) : 0,
    };
  }, [filteredMeetings]);

  const ranking = useMemo<RankingRow[]>(() => {
    const map = new Map<string, RankingRow>();
    filteredMeetings.forEach((meeting) => {
      const key = meeting.ownerId || "unassigned";
      const current =
        map.get(key) ||
        ({
          userId: key,
          name: meeting.ownerName,
          avatarUrl: meeting.avatarUrl,
          teamName: meeting.teamName,
          scheduled: 0,
          attended: 0,
          missed: 0,
          pending: 0,
          sales: 0,
          revenue: 0,
          attendanceRate: 0,
          score: 0,
        } satisfies RankingRow);

      current.scheduled += 1;
      if (meeting.status === "realizada") current.attended += 1;
      if (meeting.status === "no_show") current.missed += 1;
      if (meeting.status === "pendente") current.pending += 1;
      if (isClosedSale(meeting)) {
        current.sales += 1;
        current.revenue += meeting.value;
      }
      map.set(key, current);
    });

    return Array.from(map.values())
      .map((row) => {
        const attendanceBase = row.attended + row.missed;
        const attendanceRate = attendanceBase ? Math.round((row.attended / attendanceBase) * 100) : 0;
        const score = row.scheduled * 10 + row.attended * 20 + row.sales * 50 - row.missed * 5;
        return { ...row, attendanceRate, score };
      })
      .sort((a, b) => b.score - a.score || b.revenue - a.revenue || b.scheduled - a.scheduled);
  }, [filteredMeetings]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        const meetings = filteredMeetings
          .filter((meeting) => isSameDay(meeting.scheduledAt, date))
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
        const attended = meetings.filter((meeting) => meeting.status === "realizada").length;
        const missed = meetings.filter((meeting) => meeting.status === "no_show").length;
        const rate = attended + missed ? Math.round((attended / (attended + missed)) * 100) : 0;
        return { date, meetings, rate };
      }),
    [filteredMeetings, weekStart],
  );

  const highlights = useMemo(() => {
    const monthMeetings = allMeetings.filter((meeting) => meeting.scheduledAt >= monthStart && meeting.scheduledAt <= monthEnd);
    const monthRanking = new Map<string, RankingRow>();
    monthMeetings.forEach((meeting) => {
      const key = meeting.ownerId || "unassigned";
      const current =
        monthRanking.get(key) ||
        ({
          userId: key,
          name: meeting.ownerName,
          avatarUrl: meeting.avatarUrl,
          teamName: meeting.teamName,
          scheduled: 0,
          attended: 0,
          missed: 0,
          pending: 0,
          sales: 0,
          revenue: 0,
          attendanceRate: 0,
          score: 0,
        } satisfies RankingRow);
      current.scheduled += 1;
      if (meeting.status === "realizada") current.attended += 1;
      if (meeting.status === "no_show") current.missed += 1;
      if (isClosedSale(meeting)) {
        current.sales += 1;
        current.revenue += meeting.value;
      }
      monthRanking.set(key, current);
    });

    const monthRows = Array.from(monthRanking.values()).sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);
    const teamRows = Array.from(
      monthMeetings.reduce((map, meeting) => {
        const row = map.get(meeting.teamName) || { name: meeting.teamName, revenue: 0, sales: 0 };
        if (isClosedSale(meeting)) {
          row.revenue += meeting.value;
          row.sales += 1;
        }
        map.set(meeting.teamName, row);
        return map;
      }, new Map<string, { name: string; revenue: number; sales: number }>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);

    return {
      topSales: monthRows[0],
      topTeam: teamRows[0],
      topScheduled: [...ranking].sort((a, b) => b.scheduled - a.scheduled)[0],
      topAttendance: [...ranking].sort((a, b) => b.attended - a.attended || b.attendanceRate - a.attendanceRate)[0],
      monthRevenue: monthRows.reduce((sum, row) => sum + row.revenue, 0),
    };
  }, [allMeetings, monthEnd, monthStart, ranking]);

  const isLoading = dashboardQuery.isLoading;
  const dateRangeLabel = `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM", { locale: ptBR })}`;

  const logMeetingActivity = async (meeting: Meeting, activityType: string, content: Record<string, unknown>) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    await supabase.from("lead_activities").insert({
      lead_id: meeting.leadId,
      user_id: user.id,
      activity_type: activityType,
      content: JSON.stringify({
        origem: "dashboard_reunioes",
        lead: meeting.leadName,
        reuniao: meeting.scheduledAt.toISOString(),
        ...content,
      }),
    });
  };

  const refreshMeetingData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reunioes-dashboard", organizationId] });
    await queryClient.invalidateQueries({ queryKey: ["pipeline-leads"] });
  };

  const markMeetingStatus = async (meeting: Meeting, status: "realizada" | "no_show") => {
    const actionKey = `${meeting.id}-${status}`;
    setPendingAction(actionKey);

    try {
      const { error } = await (supabase.from("leads") as any)
        .update({ status_reuniao: status })
        .eq("id", meeting.leadId);

      if (error) throw error;

      await logMeetingActivity(meeting, status === "realizada" ? "Reunião Feita" : "No-show Reunião", {
        status_reuniao: status,
        observacao: status === "realizada" ? "Lead compareceu a reuniao." : "Lead nao compareceu a reuniao.",
      });

      await refreshMeetingData();
      toast.success(status === "realizada" ? "Reunião marcada como Veio" : "Reunião marcada como Faltou");
    } catch (error) {
      console.error("Erro ao atualizar status da reuniao:", error);
      toast.error("Erro ao atualizar status da reunião");
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaleAction = async (meeting: Meeting) => {
    const actionKey = `${meeting.id}-sale`;
    setPendingAction(actionKey);

    try {
      const { error } = await (supabase.from("leads") as any)
        .update({ status_reuniao: "realizada" })
        .eq("id", meeting.leadId);

      if (error) throw error;

      await logMeetingActivity(meeting, "Venda Pós-Reunião", {
        status_reuniao: "realizada",
        observacao: "Operador iniciou o registro de venda a partir do dashboard de reunioes.",
      });

      await refreshMeetingData();
      toast.success("Reunião marcada como realizada. Abrindo lead para registrar a venda.");
      navigate(`/leads/${meeting.leadId}`);
    } catch (error) {
      console.error("Erro ao iniciar venda pos-reuniao:", error);
      toast.error("Erro ao abrir venda do lead");
    } finally {
      setPendingAction(null);
    }
  };

  const handleReturnAction = async (meeting: Meeting) => {
    const actionKey = `${meeting.id}-return`;
    setPendingAction(actionKey);

    try {
      const returnDate = getNextBusinessDay();
      await logMeetingActivity(meeting, "Retorno Marcado", {
        data: format(returnDate, "yyyy-MM-dd"),
        hora: "09:00",
        observacao: "Retorno criado pelo dashboard de reunioes.",
      });

      await refreshMeetingData();
      toast.success(`Retorno marcado para ${format(returnDate, "dd/MM/yyyy", { locale: ptBR })} às 09:00`);
    } catch (error) {
      console.error("Erro ao marcar retorno:", error);
      toast.error("Erro ao marcar retorno");
    } finally {
      setPendingAction(null);
    }
  };

  if (!organizationId && !permissions.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Nenhuma organizacao ativa encontrada.
      </div>
    );
  }

  return (
    <div className="min-h-screen rounded-lg bg-background p-3 text-foreground sm:p-4 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
              <CalendarDays className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Reunioes</h1>
              <p className="text-sm text-muted-foreground">Agenda, ranking e comparecimento comercial</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekAnchor((value) => subWeeks(value, 1))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-10 min-w-[160px] items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground">
              {dateRangeLabel}
            </div>
            <Button variant="outline" size="icon" onClick={() => setWeekAnchor((value) => addWeeks(value, 1))}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => dashboardQuery.refetch()}>
              <RefreshCw className={cn("h-4 w-4", dashboardQuery.isFetching && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        <Tabs defaultValue="agenda" className="space-y-5">
          <TabsList className="w-full overflow-x-auto rounded-lg border border-border bg-card p-1 md:w-auto">
            <TabsTrigger value="agenda" className="gap-2 rounded-md border-0 px-4 py-2 data-[state=active]:bg-foreground data-[state=active]:text-background">
              <CalendarDays className="h-4 w-4" />
              Agenda
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-2 rounded-md border-0 px-4 py-2 data-[state=active]:bg-foreground data-[state=active]:text-background">
              <Trophy className="h-4 w-4" />
              Ranking
            </TabsTrigger>
          </TabsList>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <HighlightCard title="Top vendas mes" tooltip={metricTooltips.topSales} icon={Trophy} value={highlights.topSales ? money.format(highlights.topSales.revenue) : "R$ 0"} name={highlights.topSales?.name || "Sem vendas"} detail={`${highlights.topSales?.sales || 0} venda(s)`} tone="amber" loading={isLoading} />
            <HighlightCard title="Top equipe mes" tooltip={metricTooltips.topTeam} icon={Users} value={highlights.topTeam ? money.format(highlights.topTeam.revenue) : "R$ 0"} name={highlights.topTeam?.name || "Sem equipe"} detail={`${highlights.topTeam?.sales || 0} venda(s)`} tone="rose" loading={isLoading} />
            <HighlightCard title="Meta quinzena" tooltip={metricTooltips.biweeklyGoal} icon={Target} value={money.format(highlights.monthRevenue)} name="Receita mapeada" detail="Meta visual sem configuracao" tone="slate" loading={isLoading} />
            <HighlightCard title="Top agendou semana" tooltip={metricTooltips.topScheduled} icon={CalendarDays} value={`${highlights.topScheduled?.scheduled || 0}`} name={highlights.topScheduled?.name || "Sem agenda"} detail="reunioes agendadas" tone="blue" loading={isLoading} />
            <HighlightCard title="Top veio semana" tooltip={metricTooltips.topAttendance} icon={CheckCircle2} value={`${highlights.topAttendance?.attended || 0}`} name={highlights.topAttendance?.name || "Sem comparecimento"} detail={`${highlights.topAttendance?.attendanceRate || 0}% comparecimento`} tone="emerald" loading={isLoading} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <KpiCard label="Total" tooltip={metricTooltips.total} value={kpis.total} className="text-foreground" loading={isLoading} />
            <KpiCard label="Vieram" tooltip={metricTooltips.attended} value={kpis.attended} className="text-emerald-700 dark:text-emerald-300" loading={isLoading} />
            <KpiCard label="Faltaram" tooltip={metricTooltips.missed} value={kpis.missed} className="text-rose-700 dark:text-rose-300" loading={isLoading} />
            <KpiCard label="Pendentes" tooltip={metricTooltips.pending} value={kpis.pending} className="text-amber-700 dark:text-amber-300" loading={isLoading} />
            <KpiCard label="Remarcadas" tooltip={metricTooltips.rescheduled} value={kpis.rescheduled} className="text-violet-700 dark:text-violet-300" loading={isLoading} />
            <KpiCard label="Comparecimento" tooltip={metricTooltips.attendanceRate} value={`${kpis.attendanceRate}%`} className="text-cyan-700 dark:text-cyan-300" loading={isLoading} />
          </div>

          <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead ou responsavel" className="pl-9" />
            </div>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Responsavel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsaveis</SelectItem>
                {owners.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="realizada">Veio</SelectItem>
                <SelectItem value="no_show">Faltou</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="agenda" className="mt-0">
            {isLoading ? (
              <div className="grid gap-3 lg:grid-cols-7">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-80 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-7 lg:overflow-visible">
                {weekDays.map((day) => (
                  <DayColumn
                    key={day.date.toISOString()}
                    day={day}
                    pendingAction={pendingAction}
                    onMarkStatus={markMeetingStatus}
                    onSale={handleSaleAction}
                    onReturn={handleReturnAction}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ranking" className="mt-0">
              <RankingPanel rows={ranking} loading={isLoading} dateRangeLabel={dateRangeLabel} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const HighlightCard = ({
  title,
  tooltip,
  value,
  name,
  detail,
  icon: Icon,
  tone,
  loading,
}: {
  title: string;
  tooltip: string;
  value: string;
  name: string;
  detail: string;
  icon: typeof Trophy;
  tone: "amber" | "rose" | "slate" | "blue" | "emerald";
  loading: boolean;
}) => {
  const tones = {
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    slate: "border-border bg-muted/40 text-foreground",
    blue: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };

  return (
    <Card className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", tones[tone])}>
      <CardContent className="p-4">
        {loading ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
                <MetricHelp content={tooltip} />
              </div>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="mt-1 text-2xl font-black leading-none">{value}</p>
            </div>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const KpiCard = ({
  label,
  tooltip,
  value,
  className,
  loading,
}: {
  label: string;
  tooltip: string;
  value: number | string;
  className: string;
  loading: boolean;
}) => (
  <Card className="rounded-lg border border-border bg-card">
    <CardContent className="p-4">
      {loading ? (
        <Skeleton className="h-10" />
      ) : (
        <div className="flex items-baseline gap-3">
          <span className={cn("text-3xl font-black leading-none", className)}>{value}</span>
          <span className="flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
            {label}
            <MetricHelp content={tooltip} />
          </span>
        </div>
      )}
    </CardContent>
  </Card>
);

const MetricHelp = ({ content }: { content: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
      {content}
    </TooltipContent>
  </Tooltip>
);

const DayColumn = ({
  day,
  pendingAction,
  onMarkStatus,
  onSale,
  onReturn,
}: {
  day: { date: Date; meetings: Meeting[]; rate: number };
  pendingAction: string | null;
  onMarkStatus: (meeting: Meeting, status: "realizada" | "no_show") => void;
  onSale: (meeting: Meeting) => void;
  onReturn: (meeting: Meeting) => void;
}) => {
  const today = isSameDay(day.date, new Date());
  return (
    <div className={cn("min-w-[270px] rounded-lg border bg-card p-3 lg:min-w-0", today ? "border-foreground shadow-sm" : "border-border")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-md text-sm font-black", today ? "bg-foreground text-background" : "bg-muted text-foreground")}>
            {format(day.date, "dd")}
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-foreground">{format(day.date, "EEEE", { locale: ptBR })}</p>
            <p className="text-xs text-muted-foreground">{day.meetings.length} reuniao(s)</p>
          </div>
        </div>
        <div className="text-right">
          {today && <Badge className="mb-1 border-border bg-foreground text-background">Hoje</Badge>}
          <p className="flex items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
            {day.rate}% vieram
            <MetricHelp content={metricTooltips.dayRate} />
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {day.meetings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Sem reunioes</div>
        ) : (
          day.meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              pendingAction={pendingAction}
              onMarkStatus={onMarkStatus}
              onSale={onSale}
              onReturn={onReturn}
            />
          ))
        )}
      </div>
    </div>
  );
};

const MeetingCard = ({
  meeting,
  pendingAction,
  onMarkStatus,
  onSale,
  onReturn,
}: {
  meeting: Meeting;
  pendingAction: string | null;
  onMarkStatus: (meeting: Meeting, status: "realizada" | "no_show") => void;
  onSale: (meeting: Meeting) => void;
  onReturn: (meeting: Meeting) => void;
}) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-foreground" />
          {format(meeting.scheduledAt, "HH:mm")}
        </div>
        <p className="mt-1 truncate text-sm font-bold text-foreground">{meeting.leadName}</p>
        <p className="truncate text-xs text-muted-foreground">{meeting.ownerName}</p>
      </div>
      <Avatar className="h-9 w-9 border border-border">
        <AvatarImage src={meeting.avatarUrl || undefined} />
        <AvatarFallback className="bg-muted text-xs text-foreground">{getInitials(meeting.leadName)}</AvatarFallback>
      </Avatar>
    </div>

    <div className="mb-3 flex flex-wrap gap-1.5">
      <Badge variant="outline" className={statusClassName[meeting.status]}>
        {getStatusLabel(meeting.status)}
      </Badge>
      <Badge variant="outline" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
        Online
      </Badge>
      <Badge variant="outline" className="max-w-full truncate border-border bg-muted text-muted-foreground">
        {meeting.teamName}
      </Badge>
    </div>

    <div className="grid grid-cols-2 gap-1.5">
      <ActionPill
        label="Veio"
        tooltip="Marca esta reunião como realizada e atualiza as métricas de comparecimento."
        className="border-emerald-500/30 text-emerald-700 dark:text-emerald-200"
        icon={CheckCircle2}
        loading={pendingAction === `${meeting.id}-realizada`}
        onClick={() => onMarkStatus(meeting, "realizada")}
      />
      <ActionPill
        label="Faltou"
        tooltip="Marca esta reunião como no-show e atualiza os contadores de falta."
        className="border-rose-500/30 text-rose-700 dark:text-rose-200"
        icon={XCircle}
        loading={pendingAction === `${meeting.id}-no_show`}
        onClick={() => onMarkStatus(meeting, "no_show")}
      />
      <ActionPill
        label="Venda"
        tooltip="Marca a reunião como realizada, registra a intenção de venda e abre o lead."
        className="border-cyan-500/30 text-cyan-700 dark:text-cyan-200"
        icon={BarChart3}
        loading={pendingAction === `${meeting.id}-sale`}
        onClick={() => onSale(meeting)}
      />
      <ActionPill
        label="Retorno"
        tooltip="Cria uma atividade de retorno para o próximo dia útil às 09:00."
        className="border-violet-500/30 text-violet-700 dark:text-violet-200"
        icon={RefreshCw}
        loading={pendingAction === `${meeting.id}-return`}
        onClick={() => onReturn(meeting)}
      />
    </div>
  </div>
);

const ActionPill = ({
  label,
  tooltip,
  icon: Icon,
  className,
  loading,
  onClick,
}: {
  label: string;
  tooltip: string;
  icon: typeof Trophy;
  className: string;
  loading: boolean;
  onClick: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className={cn(
          "flex h-8 items-center justify-center gap-1 rounded-md border bg-card text-xs font-semibold transition hover:bg-muted disabled:cursor-wait disabled:opacity-60",
          className,
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        {label}
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[240px] text-xs">
      {tooltip}
    </TooltipContent>
  </Tooltip>
);

const RankingPanel = ({ rows, loading, dateRangeLabel }: { rows: RankingRow[]; loading: boolean; dateRangeLabel: string }) => {
  if (loading) return <Skeleton className="h-96 rounded-lg" />;

  if (rows.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
          <Trophy className="mb-3 h-12 w-12 text-muted-foreground" />
          <p className="font-semibold text-foreground">Sem ranking para este periodo</p>
          <p className="text-sm text-muted-foreground">Agende reunioes para gerar a classificacao.</p>
        </CardContent>
      </Card>
    );
  }

  const podium = rows.slice(0, 3);
  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  const maxScore = Math.max(rows[0]?.score || 0, 1);

  return (
    <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
      <Card className="overflow-hidden border-border bg-card">
        <CardContent className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-foreground" />
              <h2 className="font-black text-foreground">Podio da semana</h2>
              <MetricHelp content={metricTooltips.podiumScore} />
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{totalScore} pts</span>
          </div>

          <div className="mb-5 rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Periodo do podio</p>
            <p className="text-sm font-black text-foreground">{dateRangeLabel}</p>
          </div>

          <div className="mb-5 grid grid-cols-3 items-end gap-2">
            {podium[1] ? <PodiumPlace row={podium[1]} position={2} heightClass="h-28" /> : <PodiumPlaceholder position={2} heightClass="h-28" />}
            {podium[0] ? <PodiumPlace row={podium[0]} position={1} heightClass="h-36" champion /> : <PodiumPlaceholder position={1} heightClass="h-36" champion />}
            {podium[2] ? <PodiumPlace row={podium[2]} position={3} heightClass="h-24" /> : <PodiumPlaceholder position={3} heightClass="h-24" />}
          </div>

          <div className="space-y-3">
            {podium.map((row, index) => (
              <div key={row.userId} className={cn("rounded-lg border bg-background p-3", index === 0 ? "border-amber-400/60" : "border-border")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CharacterAvatar row={row} size="sm" crowned={index === 0} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.scheduled} reunioes • {row.attendanceRate}% vieram</p>
                    </div>
                  </div>
                  <span className="text-lg font-black text-foreground">{row.score}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border bg-card">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-foreground">Ranking de responsaveis</h2>
              <p className="text-sm text-muted-foreground">Performance semanal por agenda, presenca e vendas. O placar muda ao trocar a semana.</p>
            </div>
            <Badge variant="outline" className="w-fit border-border bg-muted text-foreground">
              {rows.length} participante(s)
            </Badge>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <RankingRowCard key={row.userId} row={row} position={index + 1} maxScore={maxScore} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const CharacterAvatar = ({
  row,
  size = "md",
  crowned = false,
}: {
  row: Pick<RankingRow, "name" | "avatarUrl" | "userId">;
  size?: "sm" | "md" | "lg" | "xl";
  crowned?: boolean;
}) => {
  const style = getAvatarStyle(row.userId || row.name);
  const sizes = {
    sm: "h-10 w-10 text-xs",
    md: "h-14 w-14 text-sm",
    lg: "h-20 w-20 text-lg",
    xl: "h-28 w-28 text-2xl",
  };

  return (
    <div className="relative shrink-0">
      {crowned && (
        <div className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-amber-400 p-1 text-black shadow-sm">
          <Crown className="h-4 w-4 fill-current" />
        </div>
      )}
      <Avatar className={cn("border-2 border-background shadow-md ring-1 ring-border", sizes[size])}>
        <AvatarImage src={row.avatarUrl || undefined} />
        <AvatarFallback className={cn("bg-gradient-to-br font-black text-white", style.gradient)}>
          <span className="absolute right-0.5 top-0.5 text-[0.65em] drop-shadow">{style.emoji}</span>
          <span className="drop-shadow">{getInitials(row.name)}</span>
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

const RankingRowCard = ({ row, position, maxScore }: { row: RankingRow; position: number; maxScore: number }) => {
  const progress = Math.min(100, Math.max(8, (row.score / maxScore) * 100));
  const isChampion = position === 1;

  return (
    <div className={cn("rounded-lg border bg-background p-4 transition hover:bg-muted/40", isChampion ? "border-amber-400/60 shadow-sm" : "border-border")}>
      <div className="grid gap-4 lg:grid-cols-[64px_1fr_520px] lg:items-center">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg text-xl font-black", isChampion ? "bg-amber-400 text-black" : "bg-muted text-foreground")}>
          {position}
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <CharacterAvatar row={row} size="lg" crowned={isChampion} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-lg font-black text-foreground">{row.name}</p>
              {isChampion && <Badge className="bg-amber-400 text-black hover:bg-amber-400">Coroado</Badge>}
            </div>
            <p className="truncate text-sm text-muted-foreground">{row.teamName}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-foreground to-muted-foreground" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <RankMetric label="Agenda" tooltip={metricTooltips.rankScheduled} value={row.scheduled} />
          <RankMetric label="Vieram" tooltip={metricTooltips.rankAttended} value={row.attended} />
          <RankMetric label="Faltas" tooltip={metricTooltips.rankMissed} value={row.missed} />
          <RankMetric label="Conv." tooltip={metricTooltips.rankConversion} value={`${row.attendanceRate}%`} />
          <RankMetric label="Pontos" tooltip={metricTooltips.rankScore} value={row.score} strong />
        </div>
      </div>
    </div>
  );
};

const PodiumPlace = ({
  row,
  position,
  heightClass,
  champion = false,
}: {
  row: RankingRow;
  position: number;
  heightClass: string;
  champion?: boolean;
}) => (
  <div className="flex min-w-0 flex-col items-center gap-2">
    <CharacterAvatar row={row} size={champion ? "lg" : "md"} crowned={champion} />
    <p className="w-full truncate text-center text-xs font-black text-foreground">{row.name}</p>
    <div className={cn("flex w-full flex-col items-center justify-end rounded-t-lg border border-border bg-muted p-2", heightClass, champion && "bg-amber-400 text-black")}>
      <span className="text-2xl font-black">#{position}</span>
      <span className="text-xs font-bold">{row.score} pts</span>
    </div>
  </div>
);

const PodiumPlaceholder = ({ position, heightClass, champion = false }: { position: number; heightClass: string; champion?: boolean }) => (
  <div className="flex min-w-0 flex-col items-center gap-2 opacity-50">
    <div className={cn("rounded-full border-2 border-dashed border-border bg-muted", champion ? "h-20 w-20" : "h-14 w-14")} />
    <p className="w-full truncate text-center text-xs font-black text-muted-foreground">Livre</p>
    <div className={cn("flex w-full flex-col items-center justify-end rounded-t-lg border border-dashed border-border bg-muted/40 p-2", heightClass)}>
      <span className="text-2xl font-black">#{position}</span>
      <span className="text-xs font-bold">0 pts</span>
    </div>
  </div>
);

const RankMetric = ({ label, tooltip, value, strong }: { label: string; tooltip: string; value: number | string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 md:block md:bg-transparent md:px-0 md:py-0">
    <p className="flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
      {label}
      <MetricHelp content={tooltip} />
    </p>
    <p className={cn("text-sm font-bold", strong ? "text-foreground" : "text-foreground")}>{value}</p>
  </div>
);

export default Reunioes;
