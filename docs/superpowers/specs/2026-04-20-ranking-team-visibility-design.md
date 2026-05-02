# Ranking: Team Visibility & Default Tab Fix

**Date:** 2026-04-20
**Status:** Approved

## Problem

1. Members can see ranking data from members of other teams in the "Vendas" tab (and other tabs) within the Ranking section
2. The "Vendas" tab should be the default tab when opening Ranking
3. Ranking results (who is in 1st place, revenue, sales, appointments) should be hidden from members of other teams until the admin/owner reveals them

## Design

### 1. Default Tab: Vendas

Change `rankingType` initial state from `"tasks"` to `"sales"` in `src/pages/Ranking.tsx` line 176.

### 2. Team-Based Visibility (Default Behavior)

**Current behavior:** Data is only filtered by team when `isHiddenMode` is true (competition active + not revealed + not admin). Without an active competition, all members see all data.

**New behavior:**
- Non-admin/non-owner members **always** see only their own team members in the ranking
- Admin/owner **always** sees everything
- The competition **reveal** is the mechanism that unlocks the full cross-team view for all members
- Applies to **all three tabs**: Vendas, Tarefas, Agendamentos

**Filtering logic:**

```
shouldFilterByTeam = !isAdmin && (!competition || !isRevealed)
```

- No competition exists → filter by team (restrictive default)
- Competition active, not revealed → filter by team
- Competition revealed → everyone sees full ranking (results moment)

**Members without a team:** See only their own individual data (their user ID).

### 3. Code Changes

**`src/pages/Ranking.tsx`:**
- Default `rankingType` to `"sales"`
- `currentUserTeamMemberIds` always computed (not gated by `isHiddenMode`)
- `filterData` uses `shouldFilterByTeam` instead of `isHiddenMode`
- `TeamSalesMetrics` receives updated visibility flag
- All three tabs use consistent filtering

**`src/hooks/useRankingCompetition.ts`:**
- Add `shouldFilterByTeam` computed value to the return object
- Logic: `!isAdmin && (!competition || !competition.revealed_at)`
- Keep existing `isHiddenMode` for backward compatibility where needed

**`src/components/TeamSalesMetrics.tsx`:**
- Respect `shouldFilterByTeam` for team-level visibility
- Hide other teams' metrics when filtering is active

**`src/components/dashboard/AppointmentRaceTab.tsx`:**
- Already accepts `isHiddenMode` and `teamMemberUserIds` — update to use new logic

### 4. UI/UX

- Banner for members: explanatory message when viewing team-only data
- After reveal: full ranking visible to all with celebration messaging
- Admin banner: clear state indicator (hidden/programmed/revealed)

### 5. Database

No database changes required. The existing `ranking_competitions` table already has:
- `reveal_at` (scheduled reveal timestamp)
- `revealed_at` (actual reveal timestamp)
- `is_active` (competition active flag)

## Scope

- Files: `Ranking.tsx`, `useRankingCompetition.ts`, `TeamSalesMetrics.tsx`, `AppointmentRaceTab.tsx`, `RankingCompetitionBanner.tsx`
- No new tables or migrations
- No new dependencies
