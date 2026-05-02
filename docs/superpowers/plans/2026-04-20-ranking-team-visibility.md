# Ranking: Team Visibility & Default Tab Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make team-based filtering the default behavior in the Ranking section, change the default tab to Vendas, and expand the competition reveal system to control when full cross-team data becomes visible.

**Architecture:** The existing `useRankingCompetition` hook gains a new `shouldFilterByTeam` flag that's true whenever the user is a non-admin and the ranking hasn't been revealed. This flag drives filtering in all three ranking tabs (Vendas, Tarefas, Agendamentos) and the team metrics component. The banner component is updated to explain the team-only view even without an active competition.

**Tech Stack:** React, TypeScript, Supabase, TanStack Query, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-20-ranking-team-visibility-design.md`

**No test infrastructure exists in this project.** Verification is done via `npm run build` (type-check + compile) and manual browser testing.

---

### Task 1: Add `shouldFilterByTeam` to `useRankingCompetition` hook

**Files:**
- Modify: `src/hooks/useRankingCompetition.ts`

This task adds the new computed flag that controls team-based filtering. It's the foundation for all subsequent tasks.

- [ ] **Step 1: Update the return interface**

In `src/hooks/useRankingCompetition.ts`, add `shouldFilterByTeam` to `UseRankingCompetitionReturn`:

```typescript
interface UseRankingCompetitionReturn {
  competition: RankingCompetition | null;
  isHiddenMode: boolean;
  isActive: boolean;
  isRevealed: boolean;
  isLoading: boolean;
  revealCompetition: () => Promise<void>;
  isAdmin: boolean;
  shouldFilterByTeam: boolean;
}
```

- [ ] **Step 2: Add the computed value and return it**

In the hook body, after the `isHiddenMode` line (line 136), add:

```typescript
// shouldFilterByTeam: non-admins see only their team unless ranking is revealed
const shouldFilterByTeam = !isAdmin && (!competition || !isRevealed);
```

Update the return object to include it:

```typescript
return {
  competition,
  isHiddenMode,
  isActive,
  isRevealed,
  isLoading,
  revealCompetition,
  isAdmin,
  shouldFilterByTeam,
};
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRankingCompetition.ts
git commit -m "feat(ranking): add shouldFilterByTeam flag to useRankingCompetition hook"
```

---

### Task 2: Update Ranking.tsx — default tab + team filtering

**Files:**
- Modify: `src/pages/Ranking.tsx`

This is the main change: switch the default tab to Vendas, always compute team member IDs, and use the new `shouldFilterByTeam` flag for filtering.

- [ ] **Step 1: Change default tab and sort**

In `src/pages/Ranking.tsx`, change line 176 from:

```typescript
const [rankingType, setRankingType] = useState<RankingType>("tasks");
```

to:

```typescript
const [rankingType, setRankingType] = useState<RankingType>("sales");
```

Change line 177 from:

```typescript
const [sortBy, setSortBy] = useState<SortType>("task_points");
```

to:

```typescript
const [sortBy, setSortBy] = useState<SortType>("revenue");
```

- [ ] **Step 2: Destructure `shouldFilterByTeam` from the hook**

Update the `useRankingCompetition` destructuring (around line 252) from:

```typescript
const {
  competition,
  isHiddenMode,
  isActive: competitionActive,
  isRevealed: competitionRevealed,
  revealCompetition,
  isAdmin: competitionIsAdmin,
} = useRankingCompetition(organizationId);
```

to:

```typescript
const {
  competition,
  isHiddenMode,
  isActive: competitionActive,
  isRevealed: competitionRevealed,
  revealCompetition,
  isAdmin: competitionIsAdmin,
  shouldFilterByTeam,
} = useRankingCompetition(organizationId);
```

- [ ] **Step 3: Always compute `currentUserTeamMemberIds`**

Change the `currentUserTeamMemberIds` useMemo (lines 262-276) from:

```typescript
const currentUserTeamMemberIds = useMemo(() => {
  if (!isHiddenMode || !user?.id) return null;
  const myTeams = new Set(
    teamMembers
      .filter(tm => tm.user_id === user.id)
      .map(tm => tm.team_id)
  );
  const teammateIds = new Set(
    teamMembers
      .filter(tm => myTeams.has(tm.team_id))
      .map(tm => tm.user_id)
  );
  teammateIds.add(user.id);
  return teammateIds;
}, [isHiddenMode, user?.id, teamMembers]);
```

to:

```typescript
const currentUserTeamMemberIds = useMemo(() => {
  if (!user?.id) return null;
  const myTeams = new Set(
    teamMembers
      .filter(tm => tm.user_id === user.id)
      .map(tm => tm.team_id)
  );
  const teammateIds = new Set(
    teamMembers
      .filter(tm => myTeams.has(tm.team_id))
      .map(tm => tm.user_id)
  );
  teammateIds.add(user.id);
  return teammateIds;
}, [user?.id, teamMembers]);
```

(Removed the `isHiddenMode` guard — always compute.)

- [ ] **Step 4: Update `filterData` to use `shouldFilterByTeam`**

Change the `filterData` callback (lines 279-282) from:

```typescript
const filterData = useCallback((d: LeaderboardData[]) => {
  if (!isHiddenMode || !currentUserTeamMemberIds) return d;
  return d.filter(item => currentUserTeamMemberIds.has(item.user_id));
}, [isHiddenMode, currentUserTeamMemberIds]);
```

to:

```typescript
const filterData = useCallback((d: LeaderboardData[]) => {
  if (!shouldFilterByTeam || !currentUserTeamMemberIds) return d;
  return d.filter(item => currentUserTeamMemberIds.has(item.user_id));
}, [shouldFilterByTeam, currentUserTeamMemberIds]);
```

- [ ] **Step 5: Pass `shouldFilterByTeam` to TeamSalesMetrics**

In both TabsContent blocks (tasks at ~line 394 and sales at ~line 450), change the `isHiddenMode` prop on `<TeamSalesMetrics>` to `shouldFilterByTeam`. For example:

```tsx
<TeamSalesMetrics
  organizationId={organizationId}
  teams={teams.map(t => ({ id: t.id, name: t.name, color: t.color || '#3B82F6' }))}
  teamMembers={teamMembers}
  currentUserId={user?.id}
  isOwner={isOwner}
  shouldFilterByTeam={shouldFilterByTeam}
/>
```

Do this for both the "tasks" and "sales" tabs.

- [ ] **Step 6: Pass `shouldFilterByTeam` to AppointmentRaceTab**

Change the `<AppointmentRaceTab>` (around line 457) from:

```tsx
<AppointmentRaceTab
  organizationId={organizationId}
  isHiddenMode={isHiddenMode}
  currentUserId={user?.id}
  teamMemberUserIds={currentUserTeamMemberIds ? Array.from(currentUserTeamMemberIds) : undefined}
/>
```

to:

```tsx
<AppointmentRaceTab
  organizationId={organizationId}
  shouldFilterByTeam={shouldFilterByTeam}
  currentUserId={user?.id}
  teamMemberUserIds={currentUserTeamMemberIds ? Array.from(currentUserTeamMemberIds) : undefined}
/>
```

- [ ] **Step 7: Pass `shouldFilterByTeam` to RankingCompetitionBanner**

Change the `<RankingCompetitionBanner>` (around line 316) to include the new prop:

```tsx
<RankingCompetitionBanner
  title={competition?.title || 'Competição de Ranking'}
  isActive={competitionActive}
  isRevealed={competitionRevealed}
  revealAt={competition?.reveal_at ?? null}
  isAdmin={competitionIsAdmin}
  onRevealNow={revealCompetition}
  shouldFilterByTeam={shouldFilterByTeam}
/>
```

- [ ] **Step 8: Verify build passes**

Run: `npm run build`
Expected: Build may have type errors in child components (TeamSalesMetrics, AppointmentRaceTab, RankingCompetitionBanner) because their props haven't been updated yet. This is expected — those are fixed in Tasks 3-5. If the build error is only about those prop mismatches, proceed.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Ranking.tsx
git commit -m "feat(ranking): default to Vendas tab, use shouldFilterByTeam for filtering"
```

---

### Task 3: Update TeamSalesMetrics — use `shouldFilterByTeam`

**Files:**
- Modify: `src/components/TeamSalesMetrics.tsx`

- [ ] **Step 1: Update the props interface**

Change the `TeamSalesMetricsProps` interface (lines 21-28) from:

```typescript
interface TeamSalesMetricsProps {
  organizationId: string;
  teams: Array<{ id: string; name: string; color: string }>;
  teamMembers: Array<{ team_id: string; user_id: string }>;
  currentUserId?: string;
  isOwner?: boolean;
  isHiddenMode?: boolean;
}
```

to:

```typescript
interface TeamSalesMetricsProps {
  organizationId: string;
  teams: Array<{ id: string; name: string; color: string }>;
  teamMembers: Array<{ team_id: string; user_id: string }>;
  currentUserId?: string;
  isOwner?: boolean;
  shouldFilterByTeam?: boolean;
}
```

- [ ] **Step 2: Update function signature and visibility logic**

Change the function signature (line 30) from:

```typescript
export function TeamSalesMetrics({ organizationId, teams, teamMembers, currentUserId, isOwner, isHiddenMode }: TeamSalesMetricsProps) {
```

to:

```typescript
export function TeamSalesMetrics({ organizationId, teams, teamMembers, currentUserId, isOwner, shouldFilterByTeam }: TeamSalesMetricsProps) {
```

Update the `canSeeTeamData` function (lines 143-147) from:

```typescript
const canSeeTeamData = (teamId: string) => {
  if (!isHiddenMode && isOwner) return true;
  if (!currentUserId) return true;
  return teamMembers.some(tm => tm.team_id === teamId && tm.user_id === currentUserId);
};
```

to:

```typescript
const canSeeTeamData = (teamId: string) => {
  if (!shouldFilterByTeam) return true;
  if (!currentUserId) return true;
  return teamMembers.some(tm => tm.team_id === teamId && tm.user_id === currentUserId);
};
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds for this file. Other components may still have type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TeamSalesMetrics.tsx
git commit -m "feat(ranking): TeamSalesMetrics uses shouldFilterByTeam for visibility"
```

---

### Task 4: Update AppointmentRaceTab — use `shouldFilterByTeam`

**Files:**
- Modify: `src/components/dashboard/AppointmentRaceTab.tsx`

- [ ] **Step 1: Update the props interface**

Change the `AppointmentRaceTabProps` interface (lines 26-30) from:

```typescript
interface AppointmentRaceTabProps {
  organizationId: string;
  isHiddenMode?: boolean;
  currentUserId?: string;
  teamMemberUserIds?: string[];
}
```

to:

```typescript
interface AppointmentRaceTabProps {
  organizationId: string;
  shouldFilterByTeam?: boolean;
  currentUserId?: string;
  teamMemberUserIds?: string[];
}
```

- [ ] **Step 2: Update function signature**

Change the component function signature (line 398) from:

```typescript
export function AppointmentRaceTab({ organizationId, isHiddenMode, currentUserId, teamMemberUserIds }: AppointmentRaceTabProps) {
```

to:

```typescript
export function AppointmentRaceTab({ organizationId, shouldFilterByTeam, currentUserId, teamMemberUserIds }: AppointmentRaceTabProps) {
```

- [ ] **Step 3: Update the `visibleRacers` filter**

Change the `visibleRacers` useMemo (lines 527-529) from:

```typescript
const visibleRacers = useMemo(() => {
  if (!isHiddenMode || !teamMemberUserIds || teamMemberUserIds.length === 0) return racers;
  return racers.filter(r => teamMemberUserIds.includes(r.user_id));
}, [racers, isHiddenMode, teamMemberUserIds]);
```

to:

```typescript
const visibleRacers = useMemo(() => {
  if (!shouldFilterByTeam || !teamMemberUserIds || teamMemberUserIds.length === 0) return racers;
  return racers.filter(r => teamMemberUserIds.includes(r.user_id));
}, [racers, shouldFilterByTeam, teamMemberUserIds]);
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds for this file.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/AppointmentRaceTab.tsx
git commit -m "feat(ranking): AppointmentRaceTab uses shouldFilterByTeam for filtering"
```

---

### Task 5: Update RankingCompetitionBanner — show banner for team-only mode

**Files:**
- Modify: `src/components/dashboard/RankingCompetitionBanner.tsx`

This task ensures members see an explanatory banner even when no competition is active, since the team-only view is now the default.

- [ ] **Step 1: Add `shouldFilterByTeam` to props interface**

Change the interface (lines 6-13) from:

```typescript
interface RankingCompetitionBannerProps {
  title: string;
  isActive: boolean;
  isRevealed: boolean;
  revealAt: string | null;
  isAdmin: boolean;
  onRevealNow?: () => void;
}
```

to:

```typescript
interface RankingCompetitionBannerProps {
  title: string;
  isActive: boolean;
  isRevealed: boolean;
  revealAt: string | null;
  isAdmin: boolean;
  onRevealNow?: () => void;
  shouldFilterByTeam?: boolean;
}
```

- [ ] **Step 2: Update function signature**

Change the function signature (lines 15-22) from:

```typescript
export function RankingCompetitionBanner({
  title,
  isActive,
  isRevealed,
  revealAt,
  isAdmin,
  onRevealNow,
}: RankingCompetitionBannerProps) {
```

to:

```typescript
export function RankingCompetitionBanner({
  title,
  isActive,
  isRevealed,
  revealAt,
  isAdmin,
  onRevealNow,
  shouldFilterByTeam,
}: RankingCompetitionBannerProps) {
```

- [ ] **Step 3: Update the early return and add team-only banner**

Replace the early return logic (line 23) from:

```typescript
if (!isActive && !isRevealed) return null;
```

to:

```typescript
// No active competition, not revealed, but team filtering is active — show info banner
if (!isActive && !isRevealed) {
  if (shouldFilterByTeam && !isAdmin) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-4">
        <Trophy className="h-5 w-5 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
            Ranking disponível apenas para sua equipe
          </p>
          <p className="text-xs text-blue-600/70">
            Os resultados completos serão revelados quando o administrador decidir.
          </p>
        </div>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Full build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/RankingCompetitionBanner.tsx
git commit -m "feat(ranking): show team-only info banner when no competition is active"
```

---

### Task 6: Final verification — build and browser test

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Start dev server and verify in browser**

Run: `npm run dev`

Verify the following scenarios:

1. **Default tab**: Open the Ranking page — "Vendas" tab should be selected by default
2. **Team filtering (member)**: Login as a regular team member — only teammates should appear in the ranking
3. **Team filtering (admin)**: Login as admin/owner — all members from all teams should appear
4. **Competition reveal**: Create a competition, then reveal it — all members should see full ranking
5. **Banner visibility**: As a member with no active competition, the blue "Ranking disponível apenas para sua equipe" banner should appear
6. **AppointmentRaceTab**: Same team filtering should apply in the Agendamentos tab

- [ ] **Step 3: Final commit (if any fixes needed)**

If any issues were found and fixed during browser testing:

```bash
git add -A
git commit -m "fix(ranking): address issues found during verification"
```
