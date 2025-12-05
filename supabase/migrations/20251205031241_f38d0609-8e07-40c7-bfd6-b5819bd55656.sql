-- Make chat-media bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'chat-media';

-- Create RLS policies for chat-media bucket
-- Policy: Only authenticated users from the same organization can view files
CREATE POLICY "Authenticated users can view chat media from their leads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media' AND
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = (storage.foldername(name))[1]
    AND l.organization_id = public.get_user_organization_id(auth.uid())
  )
);

-- Policy: Service role can upload files (for webhooks)
CREATE POLICY "Service role can upload chat media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

-- Policy: Service role can update files
CREATE POLICY "Service role can update chat media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media');

-- Policy: Allow deletion by authenticated users for their org's leads
CREATE POLICY "Authenticated users can delete chat media from their leads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media' AND
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id::text = (storage.foldername(name))[1]
    AND l.organization_id = public.get_user_organization_id(auth.uid())
  )
);