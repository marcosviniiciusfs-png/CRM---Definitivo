import { useState } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserX, Crown, Search, MoreVertical, Edit2, Trash2, Target, Plus, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { EditTeamModal } from "@/components/EditTeamModal";
import { TeamGoalsCard } from "@/components/TeamGoalsCard";
import { MemberTaskBadge } from "@/components/MemberTaskBadge";
// import { fetchOrganizationMembersSafe } from "@/hooks/useOrganizationMembers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { getInitials } from "@/components/roulette/utils";
import { subDays } from "date-fns";

interface Team {
  id: string;
  name: string;
  description?: string;
  color: string;
  leader_id?: string;
  avatar_url?: string;
  organization_id: string;
}

interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
}

interface Member {
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

interface DraggableMemberProps {
  member: Member;
  teamId?: string;
  isLeader?: boolean;
  organizationId: string;
}

function DraggableMember({ member, teamId, isLeader, organizationId }: DraggableMemberProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${teamId || 'no-team'}-${member.user_id}`,
    data: { member, fromTeamId: teamId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2.5 px-3 py-2 bg-card border-2 border-primary/20 hover:border-primary/50 cursor-grab active:cursor-grabbing transition-colors"
    >
      <Avatar className="h-7 w-7 flex-shrink-0">
        <AvatarImage src={member.avatar_url} />
        <AvatarFallback className="text-[8px] arcade-font bg-gradient-to-br from-primary/60 to-primary text-white">
          {getInitials(member.full_name || member.email)}
        </AvatarFallback>
      </Avatar>
      <span className="text-[10px] arcade-font flex-1 truncate">{member.full_name || member.email}</span>
      <MemberTaskBadge userId={member.user_id} organizationId={organizationId} />
      {isLeader && <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
    </div>
  );
}

const Equipes = () => {
  const { isReady, organizationId, user } = useOrganizationReady();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showGoals, setShowGoals] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [teamFilter, setTeamFilter] = useState('Todas');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: equipesData, isLoading: loading } = useQuery({
    queryKey: ['equipes-data', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('No org');

      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at");

      const teams: Team[] = teamsData || [];

      const teamIds = teams.map(t => t.id);
      let teamMembers: TeamMember[] = [];
      if (teamIds.length > 0) {
        const { data: teamMembersData } = await supabase
          .from("team_members")
          .select("*")
          .in("team_id", teamIds);
        teamMembers = teamMembersData || [];
      }

      // Buscar membros da organização diretamente
      const { data: orgMembersData, error: orgMembersError } = await supabase
        .from('organization_members')
        .select('id, user_id, organization_id, role, email, display_name, is_active')
        .eq('organization_id', organizationId);

      if (orgMembersError) {
        console.error('[Equipes] Error fetching org members:', orgMembersError);
      }

      // Buscar profiles para pegar os nomes completos e avatares
      const userIds = orgMembersData?.filter((m: any) => m.user_id).map((m: any) => m.user_id) || [];

      let profilesMap: { [key: string]: { full_name: string | null; avatar_url: string | null } } = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);

        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            if (profile.user_id) {
              acc[profile.user_id] = {
                full_name: profile.full_name,
                avatar_url: profile.avatar_url
              };
            }
            return acc;
          }, {} as { [key: string]: { full_name: string | null; avatar_url: string | null } });
        }
      }

      // Combinar dados - profiles primeiro, depois fallbacks
      const allMembers: Member[] = (orgMembersData || [])
        .filter((m: any) => m.user_id && m.is_active !== false)
        .map((m: any) => ({
          user_id: m.user_id!,
          email: m.email || m.display_name || '',
          full_name: (m.user_id && profilesMap[m.user_id]?.full_name) || m.display_name || m.email?.split('@')[0] || 'Usuário',
          avatar_url: (m.user_id && profilesMap[m.user_id]?.avatar_url) || null,
        }));

      // Descobrir o role do usuário atual
      const currentUserRole = (orgMembersData || []).find((m: any) => m.user_id === user?.id)?.role || null;

      return { teams, teamMembers, allMembers, currentUserRole };
    },
    enabled: isReady && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const teams = equipesData?.teams ?? [];
  const teamMembers = equipesData?.teamMembers ?? [];
  const allMembers = equipesData?.allMembers ?? [];
  const currentUserRole = equipesData?.currentUserRole ?? null;
  const isOwner = currentUserRole === 'owner';

  const { data: allTeamGoals = [] } = useQuery({
    queryKey: ['team-goals-all', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('team_goals')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const teamGoalMap = allTeamGoals.reduce((acc: Record<string, { id: string; goal_type: string; target_value: number; current_value: number }>, goal) => {
    if ((goal.goal_type === 'sales_count' || goal.goal_type === 'leads_converted') && !acc[goal.team_id]) {
      acc[goal.team_id] = {
        id: goal.id,
        goal_type: goal.goal_type,
        target_value: goal.target_value,
        current_value: goal.current_value,
      };
    }
    return acc;
  }, {});

  const { data: weeklyLeadsData } = useQuery({
    queryKey: ['weekly-leads-count', organizationId],
    queryFn: async () => {
      if (!organizationId) return { count: 0, total: 0, converted: 0 };
      const weekAgo = subDays(new Date(), 7).toISOString();

      const { count, error: countError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', weekAgo);
      if (countError) throw countError;

      const { count: total, error: totalError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);
      if (totalError) throw totalError;

      const { count: converted, error: convError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .neq('stage', 'NOVO_LEAD');
      if (convError) throw convError;

      return { count: count || 0, total: total || 0, converted: converted || 0 };
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const weeklyLeads = weeklyLeadsData?.count ?? 0;
  const conversionRate = weeklyLeadsData && weeklyLeadsData.total > 0
    ? Math.round((weeklyLeadsData.converted / weeklyLeadsData.total) * 100)
    : 0;
  const weeklyDelta = weeklyLeads > 0 ? `+${weeklyLeads} novos` : 'nenhum novo';

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ['equipes-data'] });
  };

  const getMembersInTeam = (teamId: string) => {
    const memberIds = teamMembers.filter(tm => tm.team_id === teamId).map(tm => tm.user_id);
    return allMembers.filter(m => memberIds.includes(m.user_id));
  };

  const getMembersWithoutTeam = () => {
    const memberIdsInTeams = teamMembers.map(tm => tm.user_id);
    return allMembers.filter(m => !memberIdsInTeams.includes(m.user_id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { member: Member; fromTeamId?: string };
    const overIdStr = over.id as string;

    let targetTeamId: string | null = null;
    if (overIdStr.startsWith('team-')) {
      targetTeamId = overIdStr.replace('team-', '');
    } else if (overIdStr === 'no-team-zone') {
      targetTeamId = null;
    } else if (overIdStr.includes('-')) {
      const parts = overIdStr.split('-');
      targetTeamId = parts[0] === 'no-team' ? null : parts[0];
    }

    const fromTeamId = activeData.fromTeamId;
    const memberId = activeData.member.user_id;
    if (fromTeamId === targetTeamId) return;

    try {
      if (fromTeamId) {
        await supabase.from("team_members").delete().eq("team_id", fromTeamId).eq("user_id", memberId);
      }
      if (targetTeamId) {
        await supabase.from("team_members").insert({ team_id: targetTeamId, user_id: memberId, role: "member" });
      }
      toast.success("Membro movido com sucesso!");
      invalidateData();
    } catch (error: any) {
      console.error("Error moving member:", error);
      toast.error("Erro ao mover membro");
    }
  };

  const getActiveItem = () => {
    if (!activeId) return null;
    const parts = activeId.split('-');
    const userId = parts[parts.length - 1];
    return allMembers.find(m => m.user_id === userId);
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    try {
      const { error } = await supabase.from("teams").delete().eq("id", teamToDelete.id);
      if (error) throw error;
      toast.success("Equipe excluída com sucesso!");
      setDeleteDialogOpen(false);
      setTeamToDelete(null);
      invalidateData();
    } catch (error: any) {
      console.error("Error deleting team:", error);
      toast.error("Erro ao excluir equipe");
    }
  };

  const filteredTeams = teams.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (teamFilter === 'Com líder') return !!t.leader_id;
    if (teamFilter === 'Sem líder') return !t.leader_id;
    if (teamFilter === 'Meta em risco') {
      const goal = teamGoalMap[t.id];
      if (!goal || goal.target_value === 0) return false;
      const pct = (goal.current_value / goal.target_value) * 100;
      return pct < 30;
    }
    return true;
  });

  const membersInTeams = new Set(teamMembers.map(tm => tm.user_id)).size;
  const membersWithoutTeam = getMembersWithoutTeam().filter(m =>
    (m.full_name || m.email).toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isReady || loading) {
    return <LoadingAnimation text="Carregando equipes..." />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 min-w-0 overflow-hidden arcade-scanline">
        {/* ARCADE HEADER */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="arcade-font text-2xl sm:text-3xl text-primary arcade-glow tracking-wider">
              EQUIPES
            </h1>
            <p className="arcade-font text-[10px] text-muted-foreground mt-2 tracking-wide">
              ORGANIZE SEUS AGENTES &gt;&gt;&gt;
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="arcade-btn-outline" onClick={() => setShowGoals('global')}>
              <Clock className="h-4 w-4 mr-2 inline" /> METAS
            </button>
            {isOwner && (
              <button className="arcade-btn" onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2 inline" /> NOVA
              </button>
            )}
          </div>
        </div>

        {/* ARCADE STATS */}
        <div className="flex justify-center gap-3 mb-6">
          {[
            { label: 'TEAMS', value: teams.length, sub: 'ATIVAS', icon: '■' },
            { label: 'MEMBROS', value: membersInTeams, sub: `${membersWithoutTeam.length} LIVRES`, icon: '♦' },
            { label: 'LEADS/SEM', value: weeklyLeads, sub: weeklyDelta.toUpperCase(), icon: '▲' },
            { label: 'CONV.%', value: `${conversionRate}%`, sub: 'PIPELINE', icon: '●' },
          ].map(stat => (
            <div key={stat.label} className="arcade-stat w-[120px] p-2 flex flex-col items-center gap-1">
              <span className="arcade-font text-[9px] text-primary/40 tracking-wider">{stat.label}</span>
              <span className="arcade-font text-[15px] text-foreground/70 arcade-glow leading-none">{stat.icon} {stat.value}</span>
              <span className="arcade-font text-[7px] text-muted-foreground/50 tracking-wide">{stat.sub}</span>
            </div>
          ))}
        </div>

        {/* ARCADE SEARCH + FILTERS */}
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
            <Input
              placeholder="BUSCAR..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 arcade-font text-[9px] border-2 border-primary/30 focus:border-primary bg-card placeholder:text-primary/40"
            />
          </div>
          {(['Todas', 'Com líder', 'Sem líder', 'Meta em risco'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTeamFilter(f)}
              className={cn(
                'arcade-pill',
                teamFilter === f ? 'arcade-pill-active' : 'text-muted-foreground'
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>


        {/* Board with Drag & Drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {filteredTeams.map((team) => {
              const teamMembersList = getMembersInTeam(team.id);
              const leader = allMembers.find(m => m.user_id === team.leader_id);
              const teamGoal = teamGoalMap[team.id];
              const goalPct = teamGoal && teamGoal.target_value > 0
                ? Math.round((teamGoal.current_value / teamGoal.target_value) * 100)
                : 0;

              return (
                <Card
                  key={team.id}
                  className="flex flex-col overflow-hidden bg-card/80 arcade-team-card"
                  style={{ '--team-color': team.color } as React.CSSProperties}
                >
                  <CardContent className="pt-4 pb-2 px-4">
                    {/* HEADER */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 flex-shrink-0 flex items-center justify-center arcade-font text-[11px] text-white"
                          style={{ background: `linear-gradient(135deg, ${team.color}, ${team.color}bb)` }}
                        >
                          {team.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="arcade-font text-[13px] truncate arcade-glow leading-tight" style={{ color: team.color }}>
                            {team.name}
                          </h3>
                          <p className="arcade-font text-[9px] text-muted-foreground mt-1">
                            {teamMembersList.length} MEMBRO{teamMembersList.length !== 1 ? 'S' : ''}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 hover:bg-primary/20">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedTeam(team); setEditModalOpen(true); }}>
                            <Edit2 className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowGoals(showGoals === team.id ? null : team.id)}>
                            <Target className="h-4 w-4 mr-2" /> Metas
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => { setTeamToDelete(team); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* LEADER — inline compact */}
                    {leader && (
                      <div
                        className="flex items-center gap-2 px-2 py-1 mb-2 border"
                        style={{ background: `${team.color}10`, borderColor: `${team.color}30` }}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={leader.avatar_url} />
                          <AvatarFallback className="text-[7px] arcade-font text-white" style={{ background: team.color }}>
                            {getInitials(leader.full_name || leader.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="arcade-font text-[9px] truncate flex-1">{leader.full_name || leader.email}</span>
                        <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                      </div>
                    )}

                    {/* GOALS */}
                    {showGoals === team.id && organizationId && (
                      <div className="mb-1.5">
                        <TeamGoalsCard
                          teamId={team.id}
                          teamName={team.name}
                          organizationId={organizationId}
                          teamColor={team.color}
                          isMember={teamMembers.some(tm => tm.team_id === team.id && tm.user_id === user?.id)}
                          isOwner={isOwner}
                        />
                      </div>
                    )}

                    {/* MEMBERS */}
                    <SortableContext
                      items={teamMembersList.map(m => `${team.id}-${m.user_id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div id={`team-${team.id}`} className="space-y-1 min-h-[40px]">
                        {teamMembersList.length === 0 ? (
                          <div className="arcade-font text-[9px] text-center py-3 text-primary/40 border-2 border-dashed border-primary/20 hover:border-primary/50 transition-colors">
                            + ARRASTE AQUI
                          </div>
                        ) : (
                          teamMembersList.map(member => (
                            <DraggableMember
                              key={member.user_id}
                              member={member}
                              teamId={team.id}
                              isLeader={member.user_id === team.leader_id}
                              organizationId={organizationId!}
                            />
                          ))
                        )}
                      </div>
                    </SortableContext>

                    {/* GOAL BAR — single row */}
                    {teamGoal && (
                      <div className="mt-1.5">
                        <div className="arcade-progress">
                          <div
                            className="arcade-progress-bar"
                            style={{
                              width: `${Math.min(100, goalPct)}%`,
                              background: goalPct < 30
                                ? 'repeating-linear-gradient(90deg, hsl(var(--destructive)) 0px, hsl(var(--destructive)) 4px, hsl(var(--destructive)/0.6) 4px, hsl(var(--destructive)/0.6) 8px)'
                                : `repeating-linear-gradient(90deg, ${team.color} 0px, ${team.color} 4px, ${team.color}99 4px, ${team.color}99 8px)`
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="arcade-font text-[7px] text-muted-foreground">META</span>
                          <span className={cn("arcade-font text-[7px]", goalPct < 30 ? "text-destructive arcade-blink" : "text-foreground")}>
                            {teamGoal.current_value}/{teamGoal.target_value}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>

                  {/* FOOTER — single thin row */}
                  <div className="flex items-center justify-center px-3 py-1.5 border-t-2" style={{ borderColor: `${team.color}25` }}>
                    <button
                      className="arcade-font text-[8px] text-muted-foreground hover:text-primary px-3 py-1 border border-primary/15 hover:border-primary/40 transition-colors"
                      onClick={() => setShowGoals(showGoals === team.id ? null : team.id)}
                    >
                      <Target className="h-3 w-3 mr-1 inline" />
                      {showGoals === team.id ? 'OCULTAR' : 'METAS'}
                    </button>
                  </div>
                </Card>
              );
            })}

            <Card className="arcade-border-dashed col-span-full max-w-4xl mx-auto mt-2">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-muted border-2 border-primary/20 flex items-center justify-center">
                    <UserX className="h-4 w-4 text-primary/60" />
                  </div>
                  <h3 className="arcade-font text-[11px] text-muted-foreground">SEM EQUIPE</h3>
                  <span className="arcade-font text-[8px] text-muted-foreground/50">
                    {membersWithoutTeam.length} MEMBRO{membersWithoutTeam.length !== 1 ? 'S' : ''}
                  </span>
                </div>
                <SortableContext
                  items={membersWithoutTeam.map(m => `no-team-${m.user_id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div id="no-team-zone" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1 min-h-[32px]">
                    {membersWithoutTeam.map(member => (
                      <DraggableMember
                        key={member.user_id}
                        member={member}
                        organizationId={organizationId!}
                      />
                    ))}
                    {membersWithoutTeam.length === 0 && (
                      <div className="col-span-full arcade-font text-[9px] text-center py-3 text-primary/40 border-2 border-dashed border-primary/20">
                        NENHUM MEMBRO SEM EQUIPE
                      </div>
                    )}
                  </div>
                </SortableContext>
              </CardContent>
            </Card>
          </div>

          <DragOverlay>
            {getActiveItem() ? (
              <div className="flex items-center gap-2.5 px-3 py-2 bg-card border-2 border-primary shadow-lg" style={{ boxShadow: '0 0 15px hsl(var(--primary) / 0.3)' }}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={getActiveItem()?.avatar_url} />
                  <AvatarFallback className="text-[9px] arcade-font bg-gradient-to-br from-primary/60 to-primary text-white">
                    {getInitials(getActiveItem()?.full_name || getActiveItem()?.email || '??')}
                  </AvatarFallback>
                </Avatar>
                <span className="arcade-font text-[10px]">{getActiveItem()?.full_name || getActiveItem()?.email}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Modals */}
        {organizationId && (
          <CreateTeamModal
            open={createModalOpen}
            onOpenChange={setCreateModalOpen}
            organizationId={organizationId}
            members={allMembers}
            onSuccess={invalidateData}
          />
        )}

        {selectedTeam && organizationId && (
          <EditTeamModal
            open={editModalOpen}
            onOpenChange={setEditModalOpen}
            team={selectedTeam}
            organizationId={organizationId}
            members={allMembers}
            onSuccess={invalidateData}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir equipe</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a equipe "{teamToDelete?.name}"? Os membros não serão removidos da organização.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTeam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default Equipes;
