-- ============================================
-- FIX: Trigger não deve sobrescrever organization_id definido pelo webhook
-- ============================================

-- Recriar a função do trigger para NÃO sobrescrever organization_id quando já definido
CREATE OR REPLACE FUNCTION public.set_lead_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- CRÍTICO: Só definir organization_id se:
  -- 1. Estiver NULL
  -- 2. E houver um usuário autenticado
  -- 
  -- Isso permite que o webhook (service role) defina o organization_id
  -- sem ser sobrescrito pelo trigger
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;