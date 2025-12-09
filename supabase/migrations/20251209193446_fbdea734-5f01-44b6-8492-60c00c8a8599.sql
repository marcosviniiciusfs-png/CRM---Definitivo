-- =====================================================
-- SECURITY FIX: Correção RLS para google_calendar_integrations e webhook_configs
-- =====================================================

-- ===== PARTE 1: Google Calendar Integrations =====
-- Dropar políticas existentes
DROP POLICY IF EXISTS "Block direct SELECT access" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can create their own calendar integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can update their own calendar integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their own calendar integrations" ON public.google_calendar_integrations;

-- Criar políticas RLS abrangentes que restringem TODAS as operações

-- SELECT: Apenas o proprietário do token pode ver (via view segura ou função masked)
CREATE POLICY "Owner only SELECT access" 
ON public.google_calendar_integrations 
FOR SELECT 
USING (user_id = auth.uid());

-- INSERT: Apenas o próprio usuário pode criar sua integração
CREATE POLICY "Owner only INSERT access" 
ON public.google_calendar_integrations 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- UPDATE: Apenas o proprietário do token pode atualizar
CREATE POLICY "Owner only UPDATE access" 
ON public.google_calendar_integrations 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: Apenas o proprietário do token pode deletar
CREATE POLICY "Owner only DELETE access" 
ON public.google_calendar_integrations 
FOR DELETE 
USING (user_id = auth.uid());


-- ===== PARTE 2: Webhook Configs - Restringir visibilidade do webhook_token =====
-- Dropar política de SELECT existente
DROP POLICY IF EXISTS "Users can view webhook configs from their organization" ON public.webhook_configs;

-- Criar função SECURITY DEFINER para mascarar webhook_token
CREATE OR REPLACE FUNCTION public.get_webhook_configs_masked()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  webhook_token text,
  tag_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_org_id uuid;
  current_user_role organization_role;
BEGIN
  -- Obter organização e role do usuário atual
  SELECT om.organization_id, om.role 
  INTO current_user_org_id, current_user_role
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;
  
  -- Retornar configs com token mascarado baseado no role
  RETURN QUERY
  SELECT 
    wc.id,
    wc.organization_id,
    -- Apenas owners e admins podem ver o webhook_token
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN wc.webhook_token
      ELSE NULL
    END as webhook_token,
    wc.tag_id,
    wc.is_active,
    wc.created_at,
    wc.updated_at
  FROM public.webhook_configs wc
  WHERE wc.organization_id = current_user_org_id;
END;
$$;

-- Nova política SELECT que permite visualizar metadados, mas token é mascarado via função
-- Apenas owners e admins podem ver diretamente
CREATE POLICY "Admins can view webhook configs" 
ON public.webhook_configs 
FOR SELECT 
USING (
  organization_id IN (
    SELECT om.organization_id
    FROM organization_members om
    WHERE om.user_id = auth.uid() 
    AND om.role IN ('owner', 'admin')
  )
);