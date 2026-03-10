-- 1. Preencher responsavel_user_id baseado no nome do responsável para leads existentes
UPDATE leads l
SET responsavel_user_id = p.user_id
FROM profiles p
WHERE l.responsavel = p.full_name
  AND l.responsavel_user_id IS NULL
  AND l.responsavel IS NOT NULL;

-- 2. Criar função para sincronizar automaticamente responsavel_user_id
CREATE OR REPLACE FUNCTION public.sync_responsavel_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Se responsavel (nome) foi definido mas responsavel_user_id não
  IF NEW.responsavel IS NOT NULL AND NEW.responsavel_user_id IS NULL THEN
    SELECT p.user_id INTO NEW.responsavel_user_id
    FROM public.profiles p
    WHERE p.full_name = NEW.responsavel
    LIMIT 1;
  END IF;
  
  -- Se responsavel_user_id foi definido mas responsavel (nome) não
  IF NEW.responsavel_user_id IS NOT NULL AND NEW.responsavel IS NULL THEN
    SELECT p.full_name INTO NEW.responsavel
    FROM public.profiles p
    WHERE p.user_id = NEW.responsavel_user_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Criar trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS sync_lead_responsavel_trigger ON leads;
CREATE TRIGGER sync_lead_responsavel_trigger
  BEFORE INSERT OR UPDATE OF responsavel, responsavel_user_id ON leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_responsavel_user_id();