# Pipeline Column Scroll Fix

**Date:** 2026-04-20
**Status:** Approved

## Problem

Users cannot scroll down within pipeline stages to see all leads, and cannot see the "Carregar mais" (load more) button. Affects ALL stages on desktop.

## Root Causes

1. `scrollbar-hide` on `.pipeline-column` hides scrollbar - users don't know content is scrollable
2. `max-h-[calc(100vh-200px)]` is hardcoded and doesn't account for actual UI offset (navbar ~56px + page header ~60px + funnel tabs ~48px + column header ~40px = ~204px+)
3. Outer PipelineColumn div has `contain: content` which can interfere with overflow calculations
4. The horizontal scroll container (`pipeline-content`) doesn't constrain its own height, so columns can overflow the viewport without triggering internal scroll

## Fix Approach

### 1. PipelineColumn.tsx
- Remove `contain: content` from outer div
- Replace `scrollbar-hide` with `scrollbar-subtle` on the scrollable area
- Change `max-h-[calc(100vh-200px)]` to use CSS variable `max-h-[calc(100vh-var(--pipeline-column-offset,220px))]`

### 2. index.css
- Define `--pipeline-column-offset: 220px` on `.pipeline-column` (accounts for navbar + header + tabs + column header + padding)

### 3. Pipeline.tsx
- Add `overflow-hidden` to the kanban container wrapper to prevent page-level vertical scroll

### 4. Mobile Verification
- Test MobilePipelineView scrolling behavior
- Ensure `flex-1 overflow-y-auto` with `minHeight: 0` works correctly

## Files Changed

- `src/components/PipelineColumn.tsx` - column height and scrollbar
- `src/index.css` - CSS variable for offset
- `src/pages/Pipeline.tsx` - container height constraint

## Success Criteria

- Desktop: users can scroll within each pipeline column to see all leads
- Desktop: "Carregar mais" button is visible after scrolling to bottom
- Desktop: subtle scrollbar visible to indicate scrollability
- Mobile: vertical scrolling works smoothly in lead list
- No regressions in drag-and-drop or horizontal scrolling between stages
