-- Add is_active column to organization_members table
ALTER TABLE public.organization_members 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_organization_members_is_active 
ON public.organization_members(organization_id, is_active);