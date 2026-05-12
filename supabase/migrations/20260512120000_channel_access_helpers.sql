-- ============================================================
-- Channel access control helpers
-- ============================================================
-- 3 funcoes SQL (STABLE, SECURITY DEFINER) que encapsulam a regra
-- de acesso. Usadas pelas policies de leads, mensagens_chat,
-- mensagens_grupo, e pelas edge functions (defesa em profundidade).
--
-- Por que SECURITY DEFINER: precisam ler organization_members,
-- whatsapp_channel_members e whatsapp_instances sem reféns das
-- policies dessas tabelas. Por que STABLE: planner pode memoizar
-- o resultado dentro da query, evitando overhead em listagens.

-- 1.1 Sou owner desta org?
CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- 1.2 Tenho acesso a este canal?
CREATE OR REPLACE FUNCTION public.user_can_access_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_instances wi
    WHERE wi.id = p_channel_id
      AND (
        public.is_org_owner(wi.organization_id)
        OR EXISTS (
          SELECT 1 FROM whatsapp_channel_members wcm
          WHERE wcm.whatsapp_instance_id = p_channel_id
            AND wcm.user_id = auth.uid()
        )
      )
  );
$$;

-- 1.3 Posso ver este lead? (regra mestre)
-- Requer membership da org primeiro — sem isso, a condicao "lead sem canal"
-- deixaria qualquer user autenticado ver leads legados de orgs alheias.
CREATE OR REPLACE FUNCTION public.user_can_access_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leads l
    JOIN organization_members om
      ON om.organization_id = l.organization_id
     AND om.user_id = auth.uid()
    WHERE l.id = p_lead_id
      AND (
        om.role = 'owner'
        OR l.whatsapp_instance_id IS NULL
        OR public.user_can_access_channel(l.whatsapp_instance_id)
        OR l.responsavel_user_id = auth.uid()
      )
  );
$$;

-- 1.4 Indice para o lookup do membership (user_id + canal)
CREATE INDEX IF NOT EXISTS idx_wcm_user_channel
  ON public.whatsapp_channel_members (user_id, whatsapp_instance_id);

-- 1.5 Permitir que authenticated execute estas funcoes
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_lead(uuid) TO authenticated;
