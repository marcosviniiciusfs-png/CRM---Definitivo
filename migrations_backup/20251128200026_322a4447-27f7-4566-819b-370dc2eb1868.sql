-- Adicionar RLS policy para lead_distribution_configs permitindo DELETE apenas para owners
DROP POLICY IF EXISTS "Admins can manage distribution config" ON lead_distribution_configs;

CREATE POLICY "Owners and admins can create and update distribution configs"
ON lead_distribution_configs
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Only owners can delete distribution configs"
ON lead_distribution_configs
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
  )
);