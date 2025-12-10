-- Create shields storage bucket for AI-generated shield images
INSERT INTO storage.buckets (id, name, public)
VALUES ('shields', 'shields', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to shields
CREATE POLICY "Shields are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'shields');

-- Allow authenticated users to upload shields
CREATE POLICY "Authenticated users can upload shields"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'shields' AND auth.role() = 'authenticated');

-- Allow service role to upload shields (for edge functions)
CREATE POLICY "Service role can manage shields"
ON storage.objects FOR ALL
USING (bucket_id = 'shields')
WITH CHECK (bucket_id = 'shields');