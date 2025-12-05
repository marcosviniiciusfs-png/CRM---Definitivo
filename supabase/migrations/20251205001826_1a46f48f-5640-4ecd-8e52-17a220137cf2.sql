-- Add search_path to update_funnel_updated_at function for defense-in-depth
CREATE OR REPLACE FUNCTION public.update_funnel_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;