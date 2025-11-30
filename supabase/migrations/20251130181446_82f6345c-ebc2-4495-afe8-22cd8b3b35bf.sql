-- Corrigir a função update_kanban_updated_at com search_path
CREATE OR REPLACE FUNCTION public.update_kanban_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;