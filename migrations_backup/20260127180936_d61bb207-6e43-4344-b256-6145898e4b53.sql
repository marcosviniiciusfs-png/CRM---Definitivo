-- Create a scheduled job to cleanup old logs every hour
-- Using pg_cron to run the cleanup

-- First ensure pg_cron is enabled (should be by default on Supabase)
-- Create a function to cleanup old logs (72 hours)

CREATE OR REPLACE FUNCTION public.cleanup_old_integration_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff_timestamp TIMESTAMPTZ;
  fb_deleted INTEGER;
  wa_deleted INTEGER;
  form_deleted INTEGER;
  meta_deleted INTEGER;
BEGIN
  -- Calculate cutoff (72 hours ago)
  cutoff_timestamp := NOW() - INTERVAL '72 hours';
  
  -- Delete old facebook webhook logs
  DELETE FROM public.facebook_webhook_logs 
  WHERE created_at < cutoff_timestamp;
  GET DIAGNOSTICS fb_deleted = ROW_COUNT;
  
  -- Delete old whatsapp webhook logs
  DELETE FROM public.webhook_logs 
  WHERE created_at < cutoff_timestamp;
  GET DIAGNOSTICS wa_deleted = ROW_COUNT;
  
  -- Delete old form webhook logs
  DELETE FROM public.form_webhook_logs 
  WHERE created_at < cutoff_timestamp;
  GET DIAGNOSTICS form_deleted = ROW_COUNT;
  
  -- Delete old meta conversion logs
  DELETE FROM public.meta_conversion_logs 
  WHERE created_at < cutoff_timestamp;
  GET DIAGNOSTICS meta_deleted = ROW_COUNT;
  
  RAISE LOG '[CLEANUP-LOGS] Deleted: FB=%, WA=%, Form=%, Meta=%', 
    fb_deleted, wa_deleted, form_deleted, meta_deleted;
END;
$$;

-- Schedule the cleanup to run every hour using pg_cron
SELECT cron.schedule(
  'cleanup-old-integration-logs',  -- job name
  '0 * * * *',                     -- every hour at minute 0
  'SELECT public.cleanup_old_integration_logs();'
);