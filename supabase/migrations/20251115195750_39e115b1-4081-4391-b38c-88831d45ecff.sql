-- Drop existing policies on leads table
DROP POLICY IF EXISTS "Users can view leads in their organization" ON leads;
DROP POLICY IF EXISTS "Users can create leads in their organization" ON leads;
DROP POLICY IF EXISTS "Users can update leads in their organization" ON leads;
DROP POLICY IF EXISTS "Users can delete leads in their organization" ON leads;

-- Create new policies that allow access to leads from ALL organizations the user is a member of
CREATE POLICY "Users can view leads in their organizations"
ON leads FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create leads in their organizations"
ON leads FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update leads in their organizations"
ON leads FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete leads in their organizations"
ON leads FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Do the same for mensagens_chat table
DROP POLICY IF EXISTS "Users can view messages from their organization leads" ON mensagens_chat;
DROP POLICY IF EXISTS "Users can create messages for their organization leads" ON mensagens_chat;
DROP POLICY IF EXISTS "Users can update messages from their organization leads" ON mensagens_chat;
DROP POLICY IF EXISTS "Users can delete messages from their organization leads" ON mensagens_chat;

CREATE POLICY "Users can view messages from their organization leads"
ON mensagens_chat FOR SELECT
USING (
  id_lead IN (
    SELECT id FROM leads 
    WHERE organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create messages for their organization leads"
ON mensagens_chat FOR INSERT
WITH CHECK (
  id_lead IN (
    SELECT id FROM leads 
    WHERE organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update messages from their organization leads"
ON mensagens_chat FOR UPDATE
USING (
  id_lead IN (
    SELECT id FROM leads 
    WHERE organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete messages from their organization leads"
ON mensagens_chat FOR DELETE
USING (
  id_lead IN (
    SELECT id FROM leads 
    WHERE organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
);