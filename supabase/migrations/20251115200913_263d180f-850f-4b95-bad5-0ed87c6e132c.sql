-- Add organization_id to whatsapp_instances table
ALTER TABLE whatsapp_instances
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Update existing instances to link them to their user's organization
UPDATE whatsapp_instances wi
SET organization_id = (
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.user_id = wi.user_id
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Usuários podem ver suas próprias instâncias" ON whatsapp_instances;
DROP POLICY IF EXISTS "Usuários podem criar suas próprias instâncias" ON whatsapp_instances;
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias instâncias" ON whatsapp_instances;
DROP POLICY IF EXISTS "Usuários podem deletar suas próprias instâncias" ON whatsapp_instances;

-- Create new RLS policies that allow organization members to see and use shared instances
CREATE POLICY "Users can view instances from their organization"
ON whatsapp_instances FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create instances in their organization"
ON whatsapp_instances FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update instances from their organization"
ON whatsapp_instances FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete instances from their organization"
ON whatsapp_instances FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Create trigger to automatically set organization_id for new instances
CREATE OR REPLACE FUNCTION set_instance_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set organization_id if not provided
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_instance_organization_trigger ON whatsapp_instances;

CREATE TRIGGER set_instance_organization_trigger
BEFORE INSERT ON whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION set_instance_organization();