
-- Fix 1: Drop the restrictive policy blocking all access to production_expenses
DROP POLICY IF EXISTS "Deny public access to production expenses" ON production_expenses;

-- Fix 3: Create user_section_access table
CREATE TABLE public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, section_key)
);

ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own section access"
  ON public.user_section_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all section access"
  ON public.user_section_access
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
