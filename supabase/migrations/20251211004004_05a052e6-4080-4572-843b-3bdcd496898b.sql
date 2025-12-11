-- Migration: Move Google Calendar tokens to secure table
-- The google_calendar_tokens table already exists with proper structure

-- 1. Migrate existing tokens from google_calendar_integrations to google_calendar_tokens
INSERT INTO public.google_calendar_tokens (
  integration_id,
  encrypted_access_token,
  encrypted_refresh_token,
  token_expires_at
)
SELECT 
  gci.id as integration_id,
  gci.access_token as encrypted_access_token,
  gci.refresh_token as encrypted_refresh_token,
  gci.token_expires_at
FROM public.google_calendar_integrations gci
WHERE NOT EXISTS (
  SELECT 1 FROM public.google_calendar_tokens gct 
  WHERE gct.integration_id = gci.id
);

-- 2. Enable RLS on google_calendar_tokens (block ALL direct access - only service_role can access)
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Create restrictive RLS policy - denies ALL access via client
CREATE POLICY "Deny all direct access to tokens"
ON public.google_calendar_tokens
FOR ALL
TO authenticated, anon
USING (false);

-- 4. Drop token columns from google_calendar_integrations (they now live in google_calendar_tokens)
ALTER TABLE public.google_calendar_integrations 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

-- 5. Update the secure function to read from google_calendar_tokens table
CREATE OR REPLACE FUNCTION public.get_google_calendar_tokens_secure(target_user_id uuid)
RETURNS TABLE(
  integration_id uuid, 
  encrypted_access_token text, 
  encrypted_refresh_token text, 
  token_expires_at timestamp with time zone, 
  calendar_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function is only accessible via service_role
  -- Returns encrypted tokens from the secure tokens table
  RETURN QUERY
  SELECT 
    gci.id as integration_id,
    gct.encrypted_access_token,
    gct.encrypted_refresh_token,
    gct.token_expires_at,
    gci.calendar_id
  FROM public.google_calendar_integrations gci
  JOIN public.google_calendar_tokens gct ON gct.integration_id = gci.id
  WHERE gci.user_id = target_user_id
    AND gci.is_active = true
  ORDER BY gci.created_at DESC
  LIMIT 1;
END;
$$;

-- 6. Create function to update tokens in the secure table (for token refresh)
CREATE OR REPLACE FUNCTION public.update_google_calendar_tokens_secure(
  p_integration_id uuid,
  p_encrypted_access_token text,
  p_token_expires_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.google_calendar_tokens
  SET 
    encrypted_access_token = p_encrypted_access_token,
    token_expires_at = p_token_expires_at,
    updated_at = now()
  WHERE integration_id = p_integration_id;
END;
$$;