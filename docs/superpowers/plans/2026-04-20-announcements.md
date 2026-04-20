# Sistema de Avisos (Announcements) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an announcement/notification system where Super Admins create popup alerts shown to CRM users on login, with templates, scheduling, preview, and per-user dismiss tracking.

**Architecture:** Two new Supabase tables (`announcements` + `announcement_dismissals`), a new "Avisos" tab inside `AdminDashboard.tsx` extracted into its own component (`AnnouncementsTab.tsx`), and a popup modal (`AnnouncementPopup.tsx`) rendered inside `DashboardLayout.tsx`. Admin creates announcements via a form with template presets; users see a centered modal with image preload when they load the CRM.

**Tech Stack:** React 18, TypeScript, Supabase (PostgreSQL + client), shadcn/ui (Dialog, Tabs, Card, Input, Checkbox, Button), Tailwind CSS, lucide-react icons.

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260420120000_add_announcements.sql` | DB tables + RLS policies |
| Create | `src/types/announcements.ts` | TypeScript types for announcements |
| Create | `src/hooks/useAnnouncements.ts` | Hook: fetch active announcements for current user |
| Create | `src/hooks/useAdminAnnouncements.ts` | Hook: CRUD operations for admin dashboard |
| Create | `src/components/AnnouncementPopup.tsx` | Modal popup shown to users |
| Create | `src/components/AnnouncementsTab.tsx` | Admin tab: list + create/edit form |
| Create | `src/components/AnnouncementPreview.tsx` | Preview/confirmation modal for admin |
| Modify | `src/components/DashboardLayout.tsx` | Add AnnouncementPopup render |
| Modify | `src/pages/AdminDashboard.tsx` | Add "Avisos" tab trigger + content |
| Add | `public/images/meta-reconnect.png` | Meta reconnection template icon |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260420120000_add_announcements.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  gif_url text,
  template_type text,
  target_type text NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'organization')),
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active announcements (for popup)
CREATE POLICY "Anyone can read active announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only super admins can insert/update/delete
CREATE POLICY "Super admins can manage announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Announcement dismissals table
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

-- Enable RLS
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can only see their own dismissals
CREATE POLICY "Users can read own dismissals"
  ON public.announcement_dismissals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own dismissals
CREATE POLICY "Users can insert own dismissals"
  ON public.announcement_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Index for popup query performance
CREATE INDEX idx_announcements_active_scheduled
  ON public.announcements (is_active, scheduled_at)
  WHERE is_active = true;

CREATE INDEX idx_announcement_dismissals_user
  ON public.announcement_dismissals (user_id, announcement_id);
```

- [ ] **Step 2: Run the migration**

Run: Apply the migration to the local Supabase instance. If using Supabase CLI: `supabase db push` or apply via the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260420120000_add_announcements.sql
git commit -m "feat(announcements): add announcements and dismissals tables with RLS"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/types/announcements.ts`

- [ ] **Step 1: Create the types file**

```typescript
export type TemplateType = 'meta_reconnect' | 'new_feature' | 'maintenance' | 'custom';
export type TargetType = 'global' | 'organization';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  gif_url: string | null;
  template_type: TemplateType | null;
  target_type: TargetType;
  target_organization_id: string | null;
  is_active: boolean;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined from admin query
  organizations?: { id: string; name: string } | null;
}

export interface AnnouncementDismissal {
  id: string;
  announcement_id: string;
  user_id: string;
  dismissed_at: string;
}

export interface AnnouncementFormData {
  title: string;
  content: string;
  gif_url: string;
  template_type: TemplateType | null;
  target_type: TargetType;
  target_organization_id: string;
  is_active: boolean;
  scheduled_at: string | null;
}

export const TEMPLATE_CONFIG: Record<TemplateType, {
  label: string;
  color: string;
  icon: string;
  defaultTitle: string;
  defaultContent: string;
  hasStaticImage: boolean;
}> = {
  meta_reconnect: {
    label: 'Reconexão Meta',
    color: '#06b6d4',
    icon: 'Link',
    defaultTitle: 'Reconecte sua conta Meta',
    defaultContent: 'Sua conexão com o Meta expirou. Siga os passos para reconectar:\n\n**1.** Acesse Integrações no menu\n**2.** Clique em "Reconectar Meta"\n**3.** Autorize o aplicativo\n**4.** Pronto! Seus leads voltarão a sincronizar',
    hasStaticImage: true,
  },
  new_feature: {
    label: 'Novidade',
    color: '#22c55e',
    icon: 'Star',
    defaultTitle: 'Nova funcionalidade disponível!',
    defaultContent: 'Temos uma novidade para você!',
    hasStaticImage: false,
  },
  maintenance: {
    label: 'Manutenção',
    color: '#eab308',
    icon: 'Settings',
    defaultTitle: 'Manutenção programada',
    defaultContent: 'O sistema passará por manutenção. Atualizaremos em breve.',
    hasStaticImage: false,
  },
  custom: {
    label: 'Customizado',
    color: '#a855f7',
    icon: 'Pencil',
    defaultTitle: '',
    defaultContent: '',
    hasStaticImage: false,
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/announcements.ts
git commit -m "feat(announcements): add TypeScript types and template config"
```

---

### Task 3: useAnnouncements Hook (User-side)

**Files:**
- Create: `src/hooks/useAnnouncements.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement } from '@/types/announcements';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

export function useAnnouncements() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, gif_url, template_type, target_type, target_organization_id, is_active, scheduled_at, created_at')
      .eq('is_active', true)
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching announcements:', error);
      setLoading(false);
      return;
    }

    // Filter: global OR targeting user's org
    const filtered = (data || []).filter((a: Announcement) => {
      if (a.target_type === 'global') return true;
      if (a.target_organization_id === organizationId) return true;
      return false;
    });

    // Exclude dismissed announcements
    if (filtered.length > 0) {
      const ids = filtered.map((a: Announcement) => a.id);
      const { data: dismissals } = await supabase
        .from('announcement_dismissals')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in('announcement_id', ids);

      const dismissedIds = new Set((dismissals || []).map((d: { announcement_id: string }) => d.announcement_id));
      const active = filtered.filter((a: Announcement) => !dismissedIds.has(a.id));
      setAnnouncements(active);
    } else {
      setAnnouncements([]);
    }

    setLoading(false);
  }, [user, organizationId]);

  const dismissAnnouncement = useCallback(async (announcementId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('announcement_dismissals')
      .insert({
        announcement_id: announcementId,
        user_id: user.id,
      });

    if (error) {
      console.error('Error dismissing announcement:', error);
      return;
    }

    // Move to next announcement or clear
    setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    setCurrentIndex(0);
  }, [user]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const currentAnnouncement = announcements[currentIndex] || null;

  return {
    currentAnnouncement,
    hasNext: currentIndex < announcements.length - 1,
    loading,
    dismissAnnouncement,
    fetchAnnouncements,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnnouncements.ts
git commit -m "feat(announcements): add useAnnouncements hook for user-side popup"
```

---

### Task 4: useAdminAnnouncements Hook (Admin-side)

**Files:**
- Create: `src/hooks/useAdminAnnouncements.ts`

- [ ] **Step 1: Create the admin hook**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Announcement, AnnouncementFormData } from '@/types/announcements';

export function useAdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, gif_url, template_type, target_type, target_organization_id, is_active, scheduled_at, created_by, created_at, organizations(id, name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching announcements:', error);
    } else {
      setAnnouncements(data || []);
    }
    setLoading(false);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setOrganizations(data);
    }
  }, []);

  const createAnnouncement = useCallback(async (formData: AnnouncementFormData, adminUserId: string) => {
    const payload: Record<string, unknown> = {
      title: formData.title,
      content: formData.content,
      gif_url: formData.gif_url || null,
      template_type: formData.template_type,
      target_type: formData.target_type,
      target_organization_id: formData.target_type === 'organization' ? formData.target_organization_id : null,
      is_active: true,
      scheduled_at: formData.scheduled_at || null,
      created_by: adminUserId,
    };

    const { error } = await supabase
      .from('announcements')
      .insert(payload);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const updateAnnouncement = useCallback(async (id: string, formData: Partial<AnnouncementFormData>) => {
    const payload: Record<string, unknown> = { ...formData };
    if (formData.target_type === 'global') {
      payload.target_organization_id = null;
    }

    const { error } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('announcements')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (error) throw error;
    await fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    fetchAnnouncements();
    fetchOrganizations();
  }, [fetchAnnouncements, fetchOrganizations]);

  return {
    announcements,
    organizations,
    loading,
    createAnnouncement,
    updateAnnouncement,
    toggleActive,
    fetchAnnouncements,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAdminAnnouncements.ts
git commit -m "feat(announcements): add useAdminAnnouncements hook for CRUD operations"
```

---

### Task 5: AnnouncementPopup Component (User-side)

**Files:**
- Create: `src/components/AnnouncementPopup.tsx`

- [ ] **Step 1: Create the popup component**

```tsx
import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Bell, Link, Star, Settings, Pencil } from 'lucide-react';
import { Announcement, TEMPLATE_CONFIG, TemplateType } from '@/types/announcements';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

const META_RECONNECT_IMAGE = '/images/meta-reconnect.png';

interface AnnouncementPopupProps {
  announcement: Announcement | null;
  onDismiss: (id: string, dontShowAgain: boolean) => void;
}

export function AnnouncementPopup({ announcement, onDismiss }: AnnouncementPopupProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setDontShowAgain(false);
    setImageLoaded(false);
  }, [announcement?.id]);

  if (!announcement) return null;

  const config = announcement.template_type
    ? TEMPLATE_CONFIG[announcement.template_type]
    : null;
  const IconComponent = config ? TEMPLATE_ICONS[config.icon] : Bell;
  const iconColor = config?.color || '#eab308';
  const label = config?.label || 'Aviso';

  const isMetaReconnect = announcement.template_type === 'meta_reconnect';
  const imageSrc = isMetaReconnect
    ? META_RECONNECT_IMAGE
    : announcement.gif_url;

  const handleDismiss = () => {
    onDismiss(announcement.id, dontShowAgain);
  };

  const showPopup = imageLoaded || !imageSrc;

  return (
    <Dialog open={!!announcement} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent
        className={`sm:max-w-md ${!showPopup ? 'opacity-0 pointer-events-none' : ''} transition-opacity duration-200`}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <div className="flex items-start gap-3 mb-3">
          {/* Image (GIF or PNG) */}
          {imageSrc && (
            <div className="flex-shrink-0">
              <img
                ref={imgRef}
                src={imageSrc}
                alt=""
                width={48}
                height={48}
                className="rounded-lg object-contain"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <IconComponent className="w-3.5 h-3.5" style={{ color: iconColor }} />
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: iconColor }}
              >
                {label}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-tight">
              {announcement.title}
            </h4>
          </div>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {announcement.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>

        <div className="border-t pt-3 mt-3 flex flex-col gap-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <span className="text-xs text-muted-foreground">
              Entendi e não quero mais ver esse aviso
            </span>
          </label>
          <Button onClick={handleDismiss} className="w-full" variant="default">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AnnouncementPopup.tsx
git commit -m "feat(announcements): add AnnouncementPopup component for user-side modal"
```

---

### Task 6: AnnouncementPreview Component (Admin-side)

**Files:**
- Create: `src/components/AnnouncementPreview.tsx`

- [ ] **Step 1: Create the preview/confirmation component**

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Link, Star, Settings, Pencil } from 'lucide-react';
import { AnnouncementFormData, TEMPLATE_CONFIG, TemplateType } from '@/types/announcements';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

const META_RECONNECT_IMAGE = '/images/meta-reconnect.png';

interface AnnouncementPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: AnnouncementFormData;
  onConfirm: () => void;
  mode: 'preview' | 'confirm';
}

export function AnnouncementPreview({
  open,
  onOpenChange,
  formData,
  onConfirm,
  mode,
}: AnnouncementPreviewProps) {
  const config = formData.template_type
    ? TEMPLATE_CONFIG[formData.template_type]
    : null;
  const IconComponent = config ? TEMPLATE_ICONS[config.icon] : Bell;
  const iconColor = config?.color || '#eab308';
  const label = config?.label || 'Aviso';

  const isMetaReconnect = formData.template_type === 'meta_reconnect';
  const imageSrc = isMetaReconnect ? META_RECONNECT_IMAGE : formData.gif_url;

  const targetLabel = formData.target_type === 'global'
    ? 'Todas as organizações'
    : 'Organização selecionada';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Preview of the popup */}
        <div className="flex items-start gap-3 mb-3">
          {imageSrc && (
            <div className="flex-shrink-0">
              <img
                src={imageSrc}
                alt=""
                width={48}
                height={48}
                className="rounded-lg object-contain"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <IconComponent className="w-3.5 h-3.5" style={{ color: iconColor }} />
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: iconColor }}
              >
                {label}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-tight">
              {formData.title || 'Título do aviso'}
            </h4>
          </div>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto">
          {(formData.content || '').split(/(\*\*[^*]+\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>

        <div className="border-t pt-3 mt-3 flex flex-col gap-2.5">
          <label className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary rounded" />
            <span className="text-xs text-muted-foreground">
              Entendi e não quero mais ver esse aviso
            </span>
          </label>
          <div className="w-full py-2 text-center text-xs text-muted-foreground border rounded-md bg-muted">
            Fechar
          </div>
        </div>

        {/* Confirm section (only for immediate send) */}
        {mode === 'confirm' && (
          <div className="border-t pt-3 mt-2 bg-muted/30 -mx-6 -mb-6 px-6 pb-6 rounded-b-lg">
            <p className="text-xs text-muted-foreground mb-3">
              Este aviso será enviado <strong className="text-yellow-500">agora</strong> para{' '}
              <strong className="text-foreground">{targetLabel}</strong>
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={onConfirm}
              >
                Confirmar disparo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AnnouncementPreview.tsx
git commit -m "feat(announcements): add AnnouncementPreview component for admin preview/confirm"
```

---

### Task 7: AnnouncementsTab Component (Admin-side)

**Files:**
- Create: `src/components/AnnouncementsTab.tsx`

- [ ] **Step 1: Create the admin announcements tab**

This is the largest component. It contains the announcement list, creation form with templates, and scheduling.

```tsx
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Link,
  Star,
  Settings,
  Pencil,
  Plus,
  PencilLine,
  ToggleLeft,
  Eye,
} from 'lucide-react';
import { useAdminAnnouncements } from '@/hooks/useAdminAnnouncements';
import { AnnouncementPreview } from '@/components/AnnouncementPreview';
import {
  Announcement,
  AnnouncementFormData,
  TEMPLATE_CONFIG,
  TemplateType,
} from '@/types/announcements';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  Link,
  Star,
  Settings,
  Pencil,
};

type FormMode = 'list' | 'create' | 'edit';

const emptyForm: AnnouncementFormData = {
  title: '',
  content: '',
  gif_url: '',
  template_type: null,
  target_type: 'global',
  target_organization_id: '',
  is_active: true,
  scheduled_at: null,
};

export function AnnouncementsTab() {
  const { user } = useAuth();
  const { announcements, organizations, loading, createAnnouncement, updateAnnouncement, toggleActive } = useAdminAnnouncements();

  const [mode, setMode] = useState<FormMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementFormData>(emptyForm);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'preview' | 'confirm'>('preview');
  const [saving, setSaving] = useState(false);

  const handleSelectTemplate = (templateType: TemplateType) => {
    const config = TEMPLATE_CONFIG[templateType];
    setForm((prev) => ({
      ...prev,
      template_type: templateType,
      title: config.defaultTitle,
      content: config.defaultContent,
    }));
  };

  const handleCreateNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setSendMode('now');
    setMode('create');
  };

  const handleEdit = (announcement: Announcement) => {
    setForm({
      title: announcement.title,
      content: announcement.content,
      gif_url: announcement.gif_url || '',
      template_type: announcement.template_type,
      target_type: announcement.target_type as 'global' | 'organization',
      target_organization_id: announcement.target_organization_id || '',
      is_active: announcement.is_active,
      scheduled_at: announcement.scheduled_at,
    });
    setEditingId(announcement.id);
    setSendMode(announcement.scheduled_at ? 'schedule' : 'now');
    setMode('edit');
  };

  const handlePreview = () => {
    setPreviewMode('preview');
    setPreviewOpen(true);
  };

  const handleSendNow = () => {
    setPreviewMode('confirm');
    setPreviewOpen(true);
  };

  const handleConfirmSend = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && editingId) {
        await updateAnnouncement(editingId, {
          ...form,
          scheduled_at: new Date().toISOString(),
        });
      } else {
        await createAnnouncement(
          { ...form, scheduled_at: new Date().toISOString() },
          user?.id || ''
        );
      }
      setPreviewOpen(false);
      setMode('list');
    } catch (err) {
      console.error('Error sending announcement:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && editingId) {
        await updateAnnouncement(editingId, form);
      } else {
        await createAnnouncement(form, user?.id || '');
      }
      setMode('list');
    } catch (err) {
      console.error('Error scheduling announcement:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AnnouncementFormData>(key: K, value: AnnouncementFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ─── LIST VIEW ───
  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Avisos Ativos</h3>
          <Button onClick={handleCreateNew} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Novo Aviso
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando avisos...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhum aviso criado ainda.</div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => {
              const config = a.template_type ? TEMPLATE_CONFIG[a.template_type] : null;
              const TemplateIcon = config ? TEMPLATE_ICONS[config.icon] : Bell;
              const targetLabel = a.target_type === 'global'
                ? 'Global'
                : a.organizations?.name || 'Organização';

              return (
                <Card key={a.id} className="bg-card border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <TemplateIcon
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: config?.color || '#888' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {a.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                a.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {a.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Para: {targetLabel} • Criado em:{' '}
                            {new Date(a.created_at).toLocaleDateString('pt-BR')}
                            {a.scheduled_at && (
                              <> • Agendado: {new Date(a.scheduled_at).toLocaleString('pt-BR')}</>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}>
                          <PencilLine className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(a.id, a.is_active)}
                        >
                          <ToggleLeft className="w-3.5 h-3.5" />
                          {a.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── CREATE / EDIT VIEW ───
  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {mode === 'create' ? 'Novo Aviso' : 'Editar Aviso'}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setMode('list')}>
          Voltar
        </Button>
      </div>

      {/* Template selector */}
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
          Escolha um modelo
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(TEMPLATE_CONFIG) as [TemplateType, typeof TEMPLATE_CONFIG[TemplateType]][]).map(
            ([key, cfg]) => {
              const TplIcon = TEMPLATE_ICONS[cfg.icon];
              const selected = form.template_type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectTemplate(key)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <TplIcon className="w-5 h-5 flex-shrink-0" style={{ color: cfg.color }} />
                  <div>
                    <div className="text-xs font-medium text-foreground">{cfg.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {key === 'meta_reconnect' ? 'Passo a passo' : key === 'new_feature' ? 'Nova funcionalidade' : key === 'maintenance' ? 'Sistema indisponível' : 'Em branco'}
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Título</label>
        <Input
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Título do aviso"
        />
      </div>

      {/* Content */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">
          Conteúdo (use **texto** para negrito)
        </label>
        <Textarea
          value={form.content}
          onChange={(e) => updateField('content', e.target.value)}
          placeholder="Conteúdo do aviso..."
          rows={5}
        />
      </div>

      {/* GIF URL */}
      {form.template_type !== 'meta_reconnect' && (
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            URL do GIF (opcional)
          </label>
          <Input
            value={form.gif_url}
            onChange={(e) => updateField('gif_url', e.target.value)}
            placeholder="https://exemplo.com/animacao.gif"
          />
        </div>
      )}

      {/* Target */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Destinatário</label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={form.target_type === 'global' ? 'default' : 'outline'}
            onClick={() => updateField('target_type', 'global')}
          >
            Todos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={form.target_type === 'organization' ? 'default' : 'outline'}
            onClick={() => updateField('target_type', 'organization')}
          >
            Organização
          </Button>
        </div>
        {form.target_type === 'organization' && (
          <select
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.target_organization_id}
            onChange={(e) => updateField('target_organization_id', e.target.value)}
          >
            <option value="">Selecione uma organização</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Scheduling */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Quando enviar?</label>
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            size="sm"
            variant={sendMode === 'now' ? 'default' : 'outline'}
            onClick={() => setSendMode('now')}
          >
            Agora
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sendMode === 'schedule' ? 'default' : 'outline'}
            onClick={() => setSendMode('schedule')}
          >
            Agendar
          </Button>
        </div>
        {sendMode === 'schedule' && (
          <div className="flex gap-2">
            <Input
              type="date"
              onChange={(e) => {
                const date = e.target.value;
                const time = (document.getElementById('schedule-time') as HTMLInputElement)?.value || '00:00';
                const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
                updateField('scheduled_at', scheduledAt);
              }}
            />
            <Input
              id="schedule-time"
              type="time"
              onChange={(e) => {
                const time = e.target.value;
                const date = (document.querySelector('input[type="date"]') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0];
                const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
                updateField('scheduled_at', scheduledAt);
              }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={handlePreview} size="sm">
          <Eye className="w-4 h-4 mr-1" />
          Preview
        </Button>
        {sendMode === 'schedule' ? (
          <Button onClick={handleSchedule} disabled={saving} size="sm">
            {saving ? 'Agendando...' : 'Agendar'}
          </Button>
        ) : (
          <Button onClick={handleSendNow} disabled={saving} size="sm">
            {saving ? 'Enviando...' : 'Enviar agora'}
          </Button>
        )}
      </div>

      {/* Preview / Confirm modal */}
      <AnnouncementPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        formData={form}
        onConfirm={handleConfirmSend}
        mode={previewMode}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AnnouncementsTab.tsx
git commit -m "feat(announcements): add AnnouncementsTab component with templates, scheduling, and CRUD"
```

---

### Task 8: Meta Reconnect PNG Asset

**Files:**
- Create: `public/images/meta-reconnect.png`

- [ ] **Step 1: Add the Meta reconnection image**

Download or copy the user-provided PNG image to `public/images/meta-reconnect.png`. This is the static image used by the `meta_reconnect` template instead of a GIF.

- [ ] **Step 2: Commit**

```bash
git add public/images/meta-reconnect.png
git commit -m "feat(announcements): add Meta reconnection template image"
```

---

### Task 9: Integrate Popup into DashboardLayout

**Files:**
- Modify: `src/components/DashboardLayout.tsx`

- [ ] **Step 1: Add imports and hook**

At the top of `DashboardLayout.tsx`, after the existing imports (around line 15), add:

```typescript
import { AnnouncementPopup } from '@/components/AnnouncementPopup';
import { useAnnouncements } from '@/hooks/useAnnouncements';
```

Inside the component function (after line 60, near the other `useState` hooks), add:

```typescript
const { currentAnnouncement, dismissAnnouncement } = useAnnouncements();
const [dismissId, setDismissId] = useState<string | null>(null);
const [dontShow, setDontShow] = useState(false);
```

- [ ] **Step 2: Add the popup handler**

After the state declarations, add:

```typescript
const handleDismiss = (announcementId: string, dontShowAgain: boolean) => {
  if (dontShowAgain) {
    dismissAnnouncement(announcementId);
  } else {
    // Just close without recording dismissal — announcement shows again next login
    setDismissId(announcementId);
  }
};
```

Note: The `dismissAnnouncement` function from the hook already removes the current announcement from state, so the next one in queue will show automatically.

- [ ] **Step 3: Render the popup**

Before the closing `</SidebarProvider>` tag (around line 158), add the popup component:

```tsx
<AnnouncementPopup
  announcement={currentAnnouncement}
  onDismiss={handleDismiss}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat(announcements): integrate AnnouncementPopup into DashboardLayout"
```

---

### Task 10: Integrate Announcements Tab into AdminDashboard

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`

- [ ] **Step 1: Add import**

At the top of `AdminDashboard.tsx`, add:

```typescript
import { AnnouncementsTab } from '@/components/AnnouncementsTab';
import { Bell } from 'lucide-react';
```

- [ ] **Step 2: Add tab trigger**

After the "Criar Conta" tab trigger (around line 447), add a new trigger:

```tsx
<TabsTrigger value="avisos" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">
  <Bell className="w-4 h-4 mr-2" />
  Avisos
</TabsTrigger>
```

- [ ] **Step 3: Add tab content**

After the closing `</TabsContent>` of the "criar-conta" tab (around line 882), add:

```tsx
<TabsContent value="avisos" className="space-y-6">
  <AnnouncementsTab />
</TabsContent>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminDashboard.tsx
git commit -m "feat(announcements): add Avisos tab to AdminDashboard"
```

---

### Task 11: DialogContent hideCloseButton support

**Files:**
- Modify: `src/components/ui/dialog.tsx`

- [ ] **Step 1: Add hideCloseButton prop**

In `src/components/ui/dialog.tsx`, the `DialogContent` component needs to support hiding the default close button (X). Find the `DialogContent` component definition and add an optional `hideCloseButton` prop. In the render, conditionally hide the X button:

Find the close button (the `<button>` with the `X` icon inside `DialogContent`) and wrap it with a conditional:

```tsx
{!hideCloseButton && (
  <button
    // existing close button code...
  >
    <X className="h-4 w-4" />
  </button>
)}
```

And add `hideCloseButton` to the component's props interface.

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat(announcements): add hideCloseButton prop to DialogContent"
```

---

### Task 12: End-to-end Manual Test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test admin flow**

1. Navigate to `/admin` and login as super admin
2. Click the "Avisos" tab
3. Click "+ Novo Aviso"
4. Select "Reconexão Meta" template — verify title and content auto-fill
5. Click "Preview" — verify popup preview shows Meta PNG image + content
6. Close preview, select "Enviar agora"
7. Verify confirmation modal shows preview + "Confirmar disparo" button
8. Confirm — verify announcement appears in the list as "Ativo"

- [ ] **Step 3: Test scheduling**

1. Create a new announcement with "Novidade" template
2. Select "Agendar" and pick a future date/time
3. Click "Agendar" — verify it appears in the list with the scheduled date

- [ ] **Step 4: Test user popup**

1. Login as a regular CRM user (not admin)
2. Navigate to the dashboard
3. Verify the active announcement popup appears with image preloaded
4. Check "Entendi e não quero mais ver esse aviso"
5. Click "Fechar"
6. Refresh the page — verify the dismissed announcement does not appear again

- [ ] **Step 5: Test toggle active/inactive**

1. As admin, click "Desativar" on an active announcement
2. As user, verify the announcement no longer appears
3. As admin, click "Ativar" — announcement should reappear for users who haven't dismissed it

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(announcements): complete announcement system with templates, scheduling, and popups"
```

---

## Self-Review

**1. Spec coverage:**
- DB tables (`announcements` + `announcement_dismissals`): Task 1 ✓
- Templates with icons: Task 7 (AnnouncementsTab) ✓
- Admin dashboard tab: Task 10 ✓
- Form with template selector: Task 7 ✓
- Scheduling (Agora/Agendar): Task 7 ✓
- Preview for admin: Task 6 + Task 7 ✓
- Confirmation modal for immediate send: Task 6 + Task 7 ✓
- User popup with preload: Task 5 ✓
- Dismiss behavior: Task 3 (hook) + Task 5 (popup) + Task 9 (layout) ✓
- GIF/PNG per template: Task 5 + Task 8 ✓

**2. Placeholder scan:** No TBD/TODO found. All code blocks contain actual implementation.

**3. Type consistency:**
- `AnnouncementFormData` defined in Task 2, used consistently in Tasks 4, 6, 7
- `TEMPLATE_CONFIG` defined in Task 2, used in Tasks 5, 6, 7
- `Announcement` interface used in hooks (Tasks 3, 4) and components (Tasks 5, 7)
- `hideCloseButton` prop added in Task 11, used in Task 5
