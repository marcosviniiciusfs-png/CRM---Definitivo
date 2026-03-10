-- Add email column to organization_members table for pending invitations
ALTER TABLE public.organization_members 
ADD COLUMN email TEXT;

-- Create index for email lookups
CREATE INDEX idx_organization_members_email ON public.organization_members(email);

-- Make user_id nullable since pending members won't have a user_id yet
ALTER TABLE public.organization_members 
ALTER COLUMN user_id DROP NOT NULL;