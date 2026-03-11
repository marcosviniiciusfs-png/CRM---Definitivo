-- Migration: Add facebook_selected_forms table for multi-form support
-- This allows an organization to subscribe to multiple Facebook lead forms
-- and route each form's leads to a different funnel

CREATE TABLE IF NOT EXISTS public.facebook_selected_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.facebook_integrations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facebook_selected_forms_integration_form_unique UNIQUE (integration_id, form_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_facebook_selected_forms_integration_id
  ON public.facebook_selected_forms(integration_id);

CREATE INDEX IF NOT EXISTS idx_facebook_selected_forms_organization_id
  ON public.facebook_selected_forms(organization_id);

-- Enable RLS
ALTER TABLE public.facebook_selected_forms ENABLE ROW LEVEL SECURITY;

-- Policy: org members can SELECT their own org's selected forms
CREATE POLICY "facebook_selected_forms_select"
  ON public.facebook_selected_forms
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: org members can INSERT selected forms for their org
CREATE POLICY "facebook_selected_forms_insert"
  ON public.facebook_selected_forms
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: org members can DELETE selected forms for their org
CREATE POLICY "facebook_selected_forms_delete"
  ON public.facebook_selected_forms
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Migrate existing data: copy the single selected form from facebook_integrations
-- into the new table for all integrations that already have a form selected
INSERT INTO public.facebook_selected_forms (integration_id, organization_id, form_id, form_name)
SELECT
  fi.id,
  fi.organization_id,
  fi.selected_form_id,
  COALESCE(fi.selected_form_name, fi.selected_form_id)
FROM public.facebook_integrations fi
WHERE fi.selected_form_id IS NOT NULL
  AND fi.selected_form_id != ''
ON CONFLICT (integration_id, form_id) DO NOTHING;
