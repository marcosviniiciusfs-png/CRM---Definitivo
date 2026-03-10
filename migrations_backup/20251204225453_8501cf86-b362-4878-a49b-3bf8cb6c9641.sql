-- Make funnel_id nullable and add unique constraint on organization_id
-- This allows one pixel per organization that works across all funnels

-- First, drop any existing constraints that might conflict
ALTER TABLE public.meta_pixel_integrations 
ALTER COLUMN funnel_id DROP NOT NULL;

-- Update existing records to remove funnel association
UPDATE public.meta_pixel_integrations SET funnel_id = NULL;

-- Add unique constraint on organization_id (one pixel per org)
-- First remove duplicates if any exist (keep most recent)
DELETE FROM public.meta_pixel_integrations a
USING public.meta_pixel_integrations b
WHERE a.organization_id = b.organization_id 
  AND a.created_at < b.created_at;

-- Now add the unique constraint
ALTER TABLE public.meta_pixel_integrations 
ADD CONSTRAINT meta_pixel_integrations_organization_id_unique UNIQUE (organization_id);