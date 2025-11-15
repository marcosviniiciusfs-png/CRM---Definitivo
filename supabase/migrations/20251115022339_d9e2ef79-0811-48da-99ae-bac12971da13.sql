-- Corrigir o trigger para não sobrescrever organization_id quando já estiver definido
CREATE OR REPLACE FUNCTION public.set_lead_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só definir organization_id se estiver NULL E se houver um usuário autenticado
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Recriar o trigger
DROP TRIGGER IF EXISTS set_lead_organization_trigger ON public.leads;
CREATE TRIGGER set_lead_organization_trigger
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_organization();