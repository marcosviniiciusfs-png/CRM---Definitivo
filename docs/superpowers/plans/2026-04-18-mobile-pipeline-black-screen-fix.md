# Mobile Pipeline Black Screen Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the black screen on mobile when viewing the Sales Pipeline page by replacing unstable JS height measurement with CSS `dvh` + removing the double-scroll conflict.

**Architecture:** Replace `useLayoutEffect` + `getBoundingClientRect()` height measurement with pure CSS `calc(100dvh - var(--pipeline-offset))`. Remove the scroll conflict by having `DashboardLayout` disable its own `overflow-y-auto` on the `/pipeline` route. Wrap `MobilePipelineView` in a flex container so it fills available space. Fix the `activeStageId` race condition.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, `100dvh` (dynamic viewport height)

**Design spec:** `docs/superpowers/specs/2026-04-18-mobile-pipeline-black-screen-fix-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/App.css` | Modify | Add `--pipeline-offset` CSS custom property with responsive media query |
| `src/components/MobilePipelineView.tsx` | Modify | Remove `useLayoutEffect` height measurement; use CSS `dvh`; fix `activeStageId` race condition |
| `src/components/DashboardLayout.tsx` | Modify | Add `cn` import; detect `/pipeline` route; conditionally disable scroll + padding |
| `src/pages/Pipeline.tsx` | Modify | Wrap `MobilePipelineView` in flex container; ensure parent chain has `flex-1 min-h-0` |

---

### Task 1: Add CSS custom property to App.css

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add `--pipeline-offset` custom property**

Open `src/App.css` and append after the existing comment:

```css
/* Pipeline mobile offset — header + title/filters height */
:root {
  --pipeline-offset: 110px;
}

@media (min-width: 640px) {
  :root {
    --pipeline-offset: 124px;
  }
}
```

The file should now read:

```css
/* App styles - cleaned up from Vite boilerplate */

/* Pipeline mobile offset — header + title/filters height */
:root {
  --pipeline-offset: 110px;
}

@media (min-width: 640px) {
  :root {
    --pipeline-offset: 124px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.css
git commit -m "feat: add --pipeline-offset CSS custom property for mobile pipeline height"
```

---

### Task 2: Remove useLayoutEffect height measurement from MobilePipelineView

**Files:**
- Modify: `src/components/MobilePipelineView.tsx`

- [ ] **Step 1: Remove `useLayoutEffect` from the import**

Change line 1 from:
```tsx
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
```
To:
```tsx
import { useState, useCallback, useRef, useEffect } from 'react';
```

- [ ] **Step 2: Remove `containerRef` and `containerHeight` state declarations**

Delete lines 35-36:
```tsx
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(400);
```

- [ ] **Step 3: Remove the entire `useLayoutEffect` block**

Delete lines 38-67 (the entire `useLayoutEffect` including the comment, `measure` function, event listeners, timers, and cleanup).

- [ ] **Step 4: Replace the root div element**

Change lines 102-107 from:
```tsx
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{ height: containerHeight, overflow: 'hidden' }}
    >
```
To:
```tsx
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: 'calc(100dvh - var(--pipeline-offset, 120px) - env(safe-area-inset-bottom, 0px))',
        minHeight: '280px',
      }}
    >
```

- [ ] **Step 5: Commit**

```bash
git add src/components/MobilePipelineView.tsx
git commit -m "fix: replace useLayoutEffect height measurement with CSS dvh in MobilePipelineView"
```

---

### Task 3: Fix activeStageId race condition in MobilePipelineView

**Files:**
- Modify: `src/components/MobilePipelineView.tsx`

- [ ] **Step 1: Update the `useEffect` that resets active stage**

The current code (around line 70 after the useLayoutEffect removal) is:
```tsx
  useEffect(() => {
    if (stages.length > 0 && !stages.find(s => s.id === activeStageId)) {
      setActiveStageId(stages[0].id);
    }
  }, [stages]);
```

Replace with:
```tsx
  useEffect(() => {
    if (stages.length > 0 && (!activeStageId || !stages.find(s => s.id === activeStageId))) {
      setActiveStageId(stages[0].id);
    }
  }, [stages, activeStageId]);
```

Changes: added `!activeStageId` check (catches empty string) and added `activeStageId` to dependency array.

- [ ] **Step 2: Commit**

```bash
git add src/components/MobilePipelineView.tsx
git commit -m "fix: correct activeStageId race condition in MobilePipelineView"
```

---

### Task 4: Detect /pipeline route in DashboardLayout and disable scroll conflict

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Add `cn` import**

After line 14 (`import googleCalendarIcon from "@/assets/google-calendar-icon.png";`), add:
```tsx
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Add pipeline route detection**

After line 60 (`const isOnChatPage = location.pathname === "/chat";`), add:
```tsx
  const isPipelinePage = location.pathname === '/pipeline';
```

- [ ] **Step 3: Replace the content wrapper div**

Change lines 130-134 from:
```tsx
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
            <div className="min-w-0 w-full max-w-full">
              {children}
            </div>
          </div>
```
To:
```tsx
          <div
            className={cn(
              "flex-1 overflow-x-hidden",
              isPipelinePage
                ? "overflow-hidden p-0"
                : "overflow-y-auto p-3 sm:p-4 md:p-6"
            )}
          >
            <div className={cn("min-w-0 w-full max-w-full", isPipelinePage && "h-full")}>
              {children}
            </div>
          </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "fix: disable scroll conflict on /pipeline route in DashboardLayout"
```

---

### Task 5: Wrap MobilePipelineView in flex container in Pipeline.tsx

**Files:**
- Modify: `src/pages/Pipeline.tsx`

- [ ] **Step 1: Wrap MobilePipelineView in a flex container**

Change lines 2177-2195 from:
```tsx
        ) : isMobile ? (
          /* Mobile Kanban View - sem drag-and-drop */
          <MobilePipelineView
            stages={stages}
            leadsByStage={leadsByStage}
            selectedFunnelId={selectedFunnelId}
            allFunnels={allFunnels}
            onTabChange={handleTabChange}
            onEdit={handleEditLead}
            onDelete={handleDeleteLead}
            onLeadMove={handleMobileLeadMove}
            leadTagsMap={leadTagsMap}
            profilesMap={profilesMap}
            duplicateLeadIds={duplicateLeadIds}
            agendamentosMap={agendamentosMap}
            redistributedMap={redistributedMap}
            stagePagination={stagePagination}
            onLoadMore={loadMoreForStage}
          />
```
To:
```tsx
        ) : isMobile ? (
          /* Mobile Kanban View - sem drag-and-drop */
          <div className="flex flex-col flex-1 min-h-0">
            <MobilePipelineView
              stages={stages}
              leadsByStage={leadsByStage}
              selectedFunnelId={selectedFunnelId}
              allFunnels={allFunnels}
              onTabChange={handleTabChange}
              onEdit={handleEditLead}
              onDelete={handleDeleteLead}
              onLeadMove={handleMobileLeadMove}
              leadTagsMap={leadTagsMap}
              profilesMap={profilesMap}
              duplicateLeadIds={duplicateLeadIds}
              agendamentosMap={agendamentosMap}
              redistributedMap={redistributedMap}
              stagePagination={stagePagination}
              onLoadMore={loadMoreForStage}
            />
          </div>
```

- [ ] **Step 2: Verify the outer container supports flex**

The Pipeline's outer container (line 1731) is `<div className="space-y-4 md:space-y-6">`. This `space-y` class uses margin-based spacing which works with block children — no change needed here because the flex container wrapping MobilePipelineView will fill available height correctly via `flex-1 min-h-0`, and the `space-y-4` div will grow to accommodate it.

No additional change required on the outer container.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "fix: wrap MobilePipelineView in flex container for proper height calculation"
```

---

### Task 6: Build and manual verification

**Files:** None (testing only)

- [ ] **Step 1: Run build to check for TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors. If there are errors related to removed variables (`containerRef`, `containerHeight`, `useLayoutEffect`), find any remaining references and remove them.

- [ ] **Step 2: Run dev server**

```bash
npm run dev
```

- [ ] **Step 3: Test on mobile viewport**

1. Open Chrome DevTools → Toggle Device Toolbar (Ctrl+Shift+M)
2. Select iPhone 12 (390x844)
3. Navigate to `/pipeline`
4. Verify: stage pills appear at top
5. Verify: leads list is visible and scrollable vertically
6. Tap different stage pills — verify leads update
7. Verify: no black screen at any point (loading, empty, with leads)

- [ ] **Step 4: Test on small device**

1. Switch to iPhone SE (375x667)
2. Repeat steps 3-7 from above
3. Verify content is visible (minHeight: 280px safety net)

- [ ] **Step 5: Test desktop is unaffected**

1. Close Device Toolbar
2. Navigate to `/pipeline`
3. Verify: desktop kanban board renders normally
4. Verify: drag-and-drop still works
5. Navigate to `/dashboard` or another page
6. Verify: normal scroll behavior with padding intact

---

## Self-Review

**Spec coverage:**
- Mudanca 1 (remove useLayoutEffect, CSS dvh) → Tasks 2
- Mudanca 2 (DashboardLayout route detection) → Task 4
- Mudanca 3 (Pipeline wrapper + flex) → Task 5
- Mudanca 4 (App.css custom property) → Task 1
- activeStageId race condition → Task 3
- Device coverage testing → Task 6

**Placeholder scan:** No TBDs, TODOs, or vague instructions found.

**Type consistency:** `cn` imported in DashboardLayout (Task 4). `useLayoutEffect` removed from imports (Task 2). No new types or functions introduced.
