-- Create storage bucket for activity attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-attachments', 'activity-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Create policies for activity attachments bucket
CREATE POLICY "Users can view attachments from their organization"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'activity-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT lead_id::text
    FROM lead_activities
    WHERE lead_id IN (
      SELECT id
      FROM leads
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can upload attachments for their organization leads"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'activity-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update their organization attachments"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'activity-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT lead_id::text
    FROM lead_activities
    WHERE lead_id IN (
      SELECT id
      FROM leads
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can delete their organization attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'activity-attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT lead_id::text
    FROM lead_activities
    WHERE lead_id IN (
      SELECT id
      FROM leads
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  )
);