# Integrations Page - Light Mode Adaptation

**Date:** 2026-04-27
**Scope:** `src/pages/Integrations.tsx`

## Problem

The Integrations page uses hardcoded dark colors via inline styles (background `#0A0A0E`, text `#E8E8F0`, borders `rgba(255,255,255,.07)`, etc.). When the CRM is in light mode, the page remains dark, breaking the visual consistency with the rest of the app.

## Approach

Replace all inline styles with Tailwind classes that use the app's CSS variable system (`bg-card`, `text-foreground`, `border-border`, etc.). Brand colors (WhatsApp green, Facebook blue, Meta blue, Google Calendar blue) remain as fixed accent colors in both modes.

## Changes by Section

### 1. Page Wrapper

Remove inline `style` with hardcoded gradient background and text color. Replace with `bg-background text-foreground`.

### 2. Header

- Title gradient: use `text-foreground` (theme-aware) instead of hardcoded gradient
- Icon background: keep the brand gradient (`BG` token) — it works on both modes
- Subtitle: `text-muted-foreground` instead of `#555566`
- Stats badge: use `bg-primary/7 border-primary/20 text-primary` instead of hardcoded rgba values

### 3. Tab Bar

Replace custom CSS (`.int-tab-btn`) with Tailwind classes:
- Container: `bg-muted/50 border border-border rounded-md p-1`
- Tab button: `text-muted-foreground hover:text-foreground hover:bg-muted rounded-md`
- Active tab: `text-foreground bg-accent`
- Active dot: `bg-primary` instead of hardcoded gradient

### 4. Integration Cards (WhatsApp, Facebook, Meta, Google Calendar)

Each card keeps its brand color identity but uses theme-aware foundations:

- **Background**: `bg-card` instead of `rgba(255,255,255,.02)`
- **Border**: `border border-border` (connected state: `border-[brand]/25`)
- **Connected glow**: keep brand-colored box-shadow in both modes
- **Title**: `text-card-foreground` instead of `#E8E8F0`
- **Category badge**: brand color with `bg-[brand]/10 border-[brand]/20`
- **Status dot (online)**: `bg-success` — works in both modes
- **Status dot (offline)**: `bg-muted-foreground/30`
- **Info rows**: `bg-muted/50 border border-border` for the container, `text-muted-foreground` for labels, brand color for values
- **"Gerenciar" button**: `bg-[brand]/10 text-[brand] border border-[brand]/30`
- **"Conectar" button**: keep gradient with brand colors (works on both light/dark)

### 5. Coming Soon Cards

Same pattern as integration cards:
- Container: `bg-card border border-border opacity-55`
- Icon wrapper: `bg-muted border border-border`
- Title: `text-card-foreground`
- Category badge: `bg-muted border border-border text-muted-foreground`
- Description: `text-muted-foreground`
- "Em breve" badge: `bg-muted border border-border text-muted-foreground`

### 6. "Solicitar integração" Card

- Border: `border-dashed border-border`
- Icon wrapper: `bg-muted border border-border`
- Text: `text-muted-foreground`
- Subtitle: `text-muted-foreground/70`

### 7. Webhooks/Logs Tab Wrappers

Currently: `background: "rgba(255,255,255,.02)"` with `border: "1px solid rgba(255,255,255,.06)"`.
Replace with: `bg-card border border-border rounded-lg`.

## Files Modified

- `src/pages/Integrations.tsx` — all changes in this single file

## What Stays the Same

- Brand colors (WhatsApp green `#25D366`, Facebook blue `#1877F2`, Meta blue `#0082FB`, Google blue `#4285F4`)
- SVG icons
- Card structure and layout (grid, min-height, padding)
- Hover animations (translateY, box-shadow)
- Dialog components (already use theme-aware shadcn/ui)
- Data fetching logic (React Query, realtime subscriptions)
