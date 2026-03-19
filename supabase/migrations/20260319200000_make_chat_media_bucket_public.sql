-- Make chat-media bucket public so stored URLs work correctly.
-- The webhook stores media URLs using the /object/public/ format,
-- so the bucket must be public for those URLs to be accessible.
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';

NOTIFY pgrst, 'reload schema';
