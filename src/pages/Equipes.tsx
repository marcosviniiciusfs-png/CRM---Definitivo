import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, User, UserX, Crown, Search, MoreVertical, Edit2, Trash2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { EditTeamModal } from "@/components/EditTeamModal";
import { TeamGoalsCard } from "@/components/TeamGoalsCard";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
}

function DraggableMember({ member, teamId, isLeader }: DraggableMemberProps) {
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
      className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={member.avatar_url} />
          <AvatarFallback className="bg-gradient-to-br from-primary/60 to-primary text-primary-foreground text-xs">
            {(member.full_name || member.email).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium text-foreground">{member.full_name || member.email}</span>
      </div>
      {isLeader && <Crown className="h-4 w-4 text-yellow-500" />}
    </div>
  );
}

const Equipes = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showGoals, setShowGoals] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (user) {
      loadOrganization();
    }
  }, [user]);

  useEffect(() => {
    if (organizationId) {
      loadData();
    }
  }, [organizationId]);

  const loadOrganization = async () => {
    const { data } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user?.id)
      .single();

    setOrganizationId(data?.organization_id || null);
  };

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);

      // Load teams
      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at");

      setTeams(teamsData || []);

      // Load team members
      const teamIds = teamsData?.map(t => t.id) || [];
      if (teamIds.length > 0) {
        const { data: teamMembersData } = await supabase
          .from("team_members")
          .select("*")
          .in("team_id", teamIds);

        setTeamMembers(teamMembersData || []);
      } else {
        setTeamMembers([]);
      }

      // Load all organization members usando RPC segura
      const { data: orgMembers } = await supabase.rpc('get_organization_members_masked');

      const userIds = orgMembers?.filter((m: any) => m.user_id).map((m: any) => m.user_id!) || [];
      
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        profiles = profilesData || [];
      }

      const members: Member[] = (orgMembers || [])
        .filter((m: any) => m.user_id)
        .map((m: any) => ({
          user_id: m.user_id!,
          email: '', // Não expor email
          full_name: profiles.find(p => p.user_id === m.user_id)?.full_name,
          avatar_url: profiles.find(p => p.user_id === m.user_id)?.avatar_url,
        }));

      setAllMembers(members);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
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

    // Determine target team
    let targetTeamId: string | null = null;
    
    if (overIdStr.startsWith('team-')) {
      targetTeamId = overIdStr.replace('team-', '');
    } else if (overIdStr === 'no-team-zone') {
      targetTeamId = null;
    } else if (overIdStr.includes('-')) {
      // It's a member item
      const parts = overIdStr.split('-');
      targetTeamId = parts[0] === 'no-team' ? null : parts[0];
    }

    const fromTeamId = activeData.fromTeamId;
    const memberId = activeData.member.user_id;

    // No change needed
    if (fromTeamId === targetTeamId) return;

    try {
      // Remove from old team
      if (fromTeamId) {
        await supabase
          .from("team_members")
          .delete()
          .eq("team_id", fromTeamId)
          .eq("user_id", memberId);
      }

      // Add to new team
      if (targetTeamId) {
        await supabase
          .from("team_members")
          .insert({
            team_id: targetTeamId,
            user_id: memberId,
            role: "member",
          });
      }

      toast.success("Membro movido com sucesso!");
      loadData();
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
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamToDelete.id);

      if (error) throw error;

      toast.success("Equipe excluída com sucesso!");
      setDeleteDialogOpen(false);
      setTeamToDelete(null);
      loadData();
    } catch (error: any) {
      console.error("Error deleting team:", error);
      toast.error("Erro ao excluir equipe");
    }
  };

  const filteredTeams = teams.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const membersWithoutTeam = getMembersWithoutTeam().filter(m =>
    (m.full_name || m.email).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Metrics
  const totalTeams = teams.length;
  const totalMembersInTeams = new Set(teamMembers.map(tm => tm.user_id)).size;
  const totalWithoutTeam = getMembersWithoutTeam().length;
  const totalLeaders = teamMembers.filter(tm => tm.role === 'leader').length;

  if (loading) {
    return <LoadingAnimation text="Carregando equipes..." />;
  }

  return (
    <div className="min-h-screen bg-background p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gerenciamento de Equipes</h1>
            <p className="text-muted-foreground mt-1">Organize e gerencie suas equipes de vendas</p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)}>
            + Nova Equipe
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Equipes</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{totalTeams}</p>
                </div>
                <div className="bg-blue-500 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Membros</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{totalMembersInTeams}</p>
                </div>
                <div className="bg-green-500 p-3 rounded-lg">
                  <User className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sem Equipe</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{totalWithoutTeam}</p>
                </div>
                <div className="bg-orange-500 p-3 rounded-lg">
                  <UserX className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Líderes</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{totalLeaders}</p>
                </div>
                <div className="bg-purple-500 p-3 rounded-lg">
                  <Crown className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar equipes ou membros..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Board with Drag & Drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Team Columns */}
            {filteredTeams.map((team) => {
              const teamMembersList = getMembersInTeam(team.id);
              const leader = allMembers.find(m => m.user_id === team.leader_id);

              return (
                <Card key={team.id} className="shadow-sm border-t-4" style={{ borderTopColor: team.color }}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={team.avatar_url} />
                          <AvatarFallback style={{ backgroundColor: team.color }} className="text-white">
                            <Users className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <h3 className="text-lg font-semibold" style={{ color: team.color }}>{team.name}</h3>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedTeam(team);
                            setEditModalOpen(true);
                          }}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowGoals(showGoals === team.id ? null : team.id)}>
                            <Target className="h-4 w-4 mr-2" />
                            Metas
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setTeamToDelete(team);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Leader */}
                    {leader && (
                      <div className="mb-4 p-3 rounded-lg border" style={{ backgroundColor: `${team.color}10`, borderColor: `${team.color}40` }}>
                        <div className="flex items-center gap-3">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={leader.avatar_url} />
                            <AvatarFallback style={{ backgroundColor: team.color }} className="text-white text-xs">
                              {(leader.full_name || leader.email).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{leader.full_name || leader.email}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-muted-foreground">Membros</span>
                      <span className="text-sm font-semibold text-foreground">{teamMembersList.length}</span>
                    </div>

                    <SortableContext
                      items={teamMembersList.map(m => `${team.id}-${m.user_id}`)}
                      strategy={verticalListSortingStrategy}
                      id={`team-${team.id}`}
                    >
                      <div className="space-y-2 min-h-[100px]" id={`team-${team.id}`}>
                        {teamMembersList.map((member) => {
                          const isLeader = member.user_id === team.leader_id;
                          return (
                            <DraggableMember
                              key={member.user_id}
                              member={member}
                              teamId={team.id}
                              isLeader={isLeader}
                            />
                          );
                        })}
                        {teamMembersList.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                            Arraste membros aqui
                          </div>
                        )}
                      </div>
                    </SortableContext>

                    {/* Team Goals */}
                    {showGoals === team.id && organizationId && (
                      <TeamGoalsCard
                        teamId={team.id}
                        teamName={team.name}
                        teamColor={team.color}
                        organizationId={organizationId}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DragOverlay>
            {activeId && getActiveItem() && (
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg shadow-lg border">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={getActiveItem()?.avatar_url} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {(getActiveItem()?.full_name || getActiveItem()?.email || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{getActiveItem()?.full_name || getActiveItem()?.email}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Modals */}
        {organizationId && (
          <>
            <CreateTeamModal
              open={createModalOpen}
              onOpenChange={setCreateModalOpen}
              organizationId={organizationId}
              members={allMembers}
              onSuccess={loadData}
            />
            <EditTeamModal
              open={editModalOpen}
              onOpenChange={setEditModalOpen}
              team={selectedTeam}
              organizationId={organizationId}
              members={allMembers}
              onSuccess={loadData}
            />
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Equipe</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir a equipe "{teamToDelete?.name}"? 
                    Os membros serão removidos da equipe, mas não serão excluídos da organização.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteTeam}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
    </div>
  );
};

export default Equipes;
