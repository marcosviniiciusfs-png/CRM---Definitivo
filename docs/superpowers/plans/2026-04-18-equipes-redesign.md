# Equipes Page Redesign - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Equipes page layout/JSX while preserving all existing logic (queries, mutations, drag-and-drop, modals).

**Architecture:** Single-file rewrite of `src/pages/Equipes.tsx`. All Supabase queries, dnd-kit handlers, mutations, and modal logic remain identical. Only the JSX return block and DraggableMember helper change. New states and queries added alongside existing ones.

**Tech Stack:** React, TypeScript, Tailwind CSS (shadcn tokens), @dnd-kit/core + @dnd-kit/sortable, @tanstack/react-query, Supabase client, date-fns

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/pages/Equipes.tsx` | **Rewrite JSX** | Main page — all layout changes happen here |

---

### Task 1: Update Imports and Add New States/Queries

**Files:**
- Modify: `src/pages/Equipes.tsx:1-22` (imports) and `src/pages/Equipes.tsx:92-102` (state declarations)

- [ ] **Step 1: Add new imports**

Line 11, update lucide-react import to add `Clock` and `Plus`:
```tsx
import { Users, User, UserX, Crown, Search, MoreVertical, Edit2, Trash2, Target, Plus, Clock } from "lucide-react";
```

After line 22 (after `CSS` import from dnd-kit), add:
```tsx
import { cn } from "@/lib/utils";
import { getInitials } from "@/components/roulette/utils";
import { subDays } from "date-fns";
```

- [ ] **Step 2: Add teamFilter state**

After line 101 (`const [teamToDelete, setTeamToDelete]`), add:
```tsx
const [teamFilter, setTeamFilter] = useState('Todas');
```

- [ ] **Step 3: Add teamGoals query**

After line 187 (`const isOwner = ...`), add:
```tsx
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
```

- [ ] **Step 4: Add weeklyLeads query**

After teamGoalMap, add:
```tsx
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
```

- [ ] **Step 5: Update filteredTeams with teamFilter**

Replace lines 266-268:
```tsx
const filteredTeams = teams.filter(t =>
  t.name.toLowerCase().includes(searchTerm.toLowerCase())
);
```
With:
```tsx
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
```

- [ ] **Step 6: Consolidate stats variables**

Replace lines 270-277 with:
```tsx
const membersInTeams = new Set(teamMembers.map(tm => tm.user_id)).size;
const membersWithoutTeam = getMembersWithoutTeam().filter(m =>
  (m.full_name || m.email).toLowerCase().includes(searchTerm.toLowerCase())
);
```

---

### Task 2: Rewrite DraggableMember Component

**Files:**
- Modify: `src/pages/Equipes.tsx:55-90` (DraggableMember function)

- [ ] **Step 1: Replace entire DraggableMember function**

Replace lines 55-90 with:
```tsx
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
      className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-md border border-transparent hover:border-border/60 cursor-grab active:cursor-grabbing transition-colors"
    >
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={member.avatar_url} />
        <AvatarFallback className="text-[9px]">
          {getInitials(member.full_name || member.email)}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs flex-1 truncate">{member.full_name || member.email}</span>
      <MemberTaskBadge userId={member.user_id} organizationId={organizationId} />
      {isLeader && <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
      <div className="flex flex-col gap-[3px] opacity-30 flex-shrink-0">
        <span className="block w-3 h-px bg-foreground rounded" />
        <span className="block w-3 h-px bg-foreground rounded" />
        <span className="block w-3 h-px bg-foreground rounded" />
      </div>
    </div>
  );
}
```

---

### Task 3: Rewrite Main JSX — Header + Stats + Search/Filters

**Files:**
- Modify: `src/pages/Equipes.tsx` return block

- [ ] **Step 1: Replace Header**

Replace the header section with:
```tsx
<div className="flex items-start justify-between gap-3 flex-wrap">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Equipes</h1>
    <p className="text-sm text-muted-foreground mt-1">
      Organize e gerencie grupos de agentes da sua organização
    </p>
  </div>
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" onClick={() => setShowGoals('global')}>
      <Clock className="h-4 w-4 mr-2" /> Metas
    </Button>
    {isOwner && (
      <Button size="sm" onClick={() => setCreateModalOpen(true)}>
        <Plus className="h-4 w-4 mr-2" /> Nova equipe
      </Button>
    )}
  </div>
</div>
```

- [ ] **Step 2: Replace Stats Bar**

Replace the 4 metric Cards with:
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {[
    { label: 'Equipes', value: teams.length, sub: 'todas ativas', dotColor: 'bg-success' },
    { label: 'Membros alocados', value: membersInTeams, sub: `${membersWithoutTeam.length} sem equipe` },
    { label: 'Leads esta semana', value: weeklyLeads, sub: weeklyDelta },
    { label: 'Conversão média', value: `${conversionRate}%`, sub: 'para pipeline' },
  ].map(stat => (
    <div key={stat.label} className="bg-muted/50 rounded-lg p-3 flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
      <span className="text-[22px] font-semibold leading-none">{stat.value}</span>
      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
        {stat.dotColor && <span className={`inline-block w-1.5 h-1.5 rounded-full ${stat.dotColor}`} />}
        {stat.sub}
      </span>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Replace Search + Filters**

Replace the search section with:
```tsx
<div className="flex items-center gap-2 flex-wrap">
  <div className="relative flex-1 min-w-[180px] max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    <Input
      placeholder="Buscar equipes ou membros..."
      value={searchTerm}
      onChange={e => setSearchTerm(e.target.value)}
      className="pl-9 h-9"
    />
  </div>
  {(['Todas', 'Com líder', 'Sem líder', 'Meta em risco'] as const).map(f => (
    <button
      key={f}
      onClick={() => setTeamFilter(f)}
      className={cn(
        'text-xs px-3 py-1.5 rounded-full border transition-colors',
        teamFilter === f
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      )}
    >
      {f}
    </button>
  ))}
</div>
```

---

### Task 4: Rewrite Team Cards Grid

**Files:**
- Modify: `src/pages/Equipes.tsx` (DndContext inner grid)

- [ ] **Step 1: Replace team cards grid**

Replace the grid div with filteredTeams.map with:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
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
        className="flex flex-col overflow-hidden border border-border/60 hover:border-border transition-colors"
      >
        <div className="h-[3px] w-full flex-shrink-0" style={{ background: team.color }} />

        <CardContent className="pt-4 pb-0 px-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-[13px] font-medium text-white"
                style={{ background: team.color }}
              >
                {team.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">{team.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {team.description || `${teamMembersList.length} membros`}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
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

          {leader && (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md mb-3 border"
              style={{ background: `${team.color}10`, borderColor: `${team.color}30` }}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={leader.avatar_url} />
                <AvatarFallback className="text-[9px] font-medium text-white" style={{ background: team.color }}>
                  {getInitials(leader.full_name || leader.email)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate flex-1">{leader.full_name || leader.email}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0"
                style={{ background: `${team.color}15`, color: team.color, borderColor: `${team.color}40` }}
              >
                Líder
              </span>
            </div>
          )}

          {showGoals === team.id && organizationId && (
            <div className="mb-3">
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

          <SortableContext
            items={teamMembersList.map(m => `${team.id}-${m.user_id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div id={`team-${team.id}`} className="space-y-1.5 min-h-[48px]">
              {teamMembersList.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground border border-dashed rounded-md hover:border-primary/40 hover:text-primary/60 transition-colors">
                  Arraste membros aqui
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

          {teamGoal && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">Meta mensal</span>
                <span className={cn("text-[11px] font-medium", goalPct < 30 ? "text-destructive" : "text-foreground")}>
                  {teamGoal.current_value} / {teamGoal.target_value}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, goalPct)}%`, background: goalPct < 30 ? 'hsl(var(--destructive))' : team.color }}
                />
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between px-4 py-2.5 mt-2 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground">
            {teamMembersList.length} membro{teamMembersList.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={() => setShowGoals(showGoals === team.id ? null : team.id)}
          >
            <Target className="h-3 w-3" />
            {showGoals === team.id ? 'Ocultar' : 'Metas'}
          </Button>
        </div>
      </Card>
    );
  })}
```

---

### Task 5: Rewrite "Sem Equipe" Card + DragOverlay

**Files:**
- Modify: `src/pages/Equipes.tsx`

- [ ] **Step 1: Replace "Sem Equipe" card**

Replace the without-team Card with:
```tsx
  <Card className="border border-dashed border-border/60 col-span-full">
    <CardContent className="pt-4 pb-4 px-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center">
          <UserX className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Sem equipe</h3>
          <p className="text-[11px] text-muted-foreground/70">
            {membersWithoutTeam.length} membro{membersWithoutTeam.length !== 1 ? 's' : ''} aguardando alocação — arraste para uma equipe
          </p>
        </div>
      </div>
      <SortableContext
        items={membersWithoutTeam.map(m => `no-team-${m.user_id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div id="no-team-zone" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 min-h-[40px]">
          {membersWithoutTeam.map(member => (
            <DraggableMember
              key={member.user_id}
              member={member}
              organizationId={organizationId!}
            />
          ))}
          {membersWithoutTeam.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-3 text-xs text-muted-foreground border border-dashed rounded-md">
              Nenhum membro sem equipe
            </div>
          )}
        </div>
      </SortableContext>
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 2: Replace DragOverlay**

Replace the DragOverlay with:
```tsx
<DragOverlay>
  {getActiveItem() ? (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-card rounded-md shadow-lg border border-border">
      <Avatar className="h-7 w-7 flex-shrink-0">
        <AvatarImage src={getActiveItem()?.avatar_url} />
        <AvatarFallback className="text-[9px]">
          {getInitials(getActiveItem()?.full_name || getActiveItem()?.email || '??')}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium">{getActiveItem()?.full_name || getActiveItem()?.email}</span>
    </div>
  ) : null}
</DragOverlay>
```

---

### Task 6: Final Cleanup and Verification

**Files:**
- Modify: `src/pages/Equipes.tsx`

- [ ] **Step 1: Remove unused imports**

Remove `Users` from lucide-react import (no longer used in any JSX). The import becomes:
```tsx
import { User, UserX, Crown, Search, MoreVertical, Edit2, Trash2, Target, Plus, Clock } from "lucide-react";
```

Remove `Progress` import if present (it's not imported currently).

- [ ] **Step 2: Remove old unused stat variables**

Ensure these old variables are gone: `totalTeams`, `totalMembersInTeams`, `totalWithoutTeam`, `totalLeaders`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -50`
Expected: No errors in `src/pages/Equipes.tsx`

- [ ] **Step 4: Verify the app builds**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds
