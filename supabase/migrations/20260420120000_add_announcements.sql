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
