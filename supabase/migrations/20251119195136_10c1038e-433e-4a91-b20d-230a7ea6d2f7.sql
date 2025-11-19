-- ============================================================================
-- REFORÇAR SEGURANÇA: Negar explicitamente acesso público às tabelas sensíveis
-- ============================================================================

-- Verificar e garantir que RLS está habilitado em todas as tabelas críticas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ADICIONAR POLÍTICAS DE NEGAÇÃO EXPLÍCITA PARA ACESSO PÚBLICO
-- ============================================================================

-- PROFILES: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to profiles" ON public.profiles;
CREATE POLICY "Deny public access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- LEADS: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to leads" ON public.leads;
CREATE POLICY "Deny public access to leads"
ON public.leads
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- MENSAGENS_CHAT: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to messages" ON public.mensagens_chat;
CREATE POLICY "Deny public access to messages"
ON public.mensagens_chat
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- LEAD_ACTIVITIES: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to activities" ON public.lead_activities;
CREATE POLICY "Deny public access to activities"
ON public.lead_activities
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- LEAD_TAGS: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to tags" ON public.lead_tags;
CREATE POLICY "Deny public access to tags"
ON public.lead_tags
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- LEAD_TAG_ASSIGNMENTS: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to tag assignments" ON public.lead_tag_assignments;
CREATE POLICY "Deny public access to tag assignments"
ON public.lead_tag_assignments
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- WHATSAPP_INSTANCES: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Deny public access to whatsapp instances"
ON public.whatsapp_instances
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- ORGANIZATIONS: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to organizations" ON public.organizations;
CREATE POLICY "Deny public access to organizations"
ON public.organizations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- ORGANIZATION_MEMBERS: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to organization members" ON public.organization_members;
CREATE POLICY "Deny public access to organization members"
ON public.organization_members
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- APP_CONFIG: Negar acesso público explicitamente
DROP POLICY IF EXISTS "Deny public access to app config" ON public.app_config;
CREATE POLICY "Deny public access to app config"
ON public.app_config
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- ============================================================================
-- COMENTÁRIOS SOBRE A SEGURANÇA
-- ============================================================================

COMMENT ON POLICY "Deny public access to profiles" ON public.profiles IS 
'Política RESTRITIVA que nega explicitamente qualquer acesso público (não autenticado) à tabela profiles. Usuários devem estar autenticados e ser membros da mesma organização para visualizar perfis.';

COMMENT ON POLICY "Deny public access to leads" ON public.leads IS 
'Política RESTRITIVA que nega explicitamente qualquer acesso público à tabela leads. Apenas usuários autenticados e membros da organização podem acessar leads.';

COMMENT ON POLICY "Deny public access to messages" ON public.mensagens_chat IS 
'Política RESTRITIVA que nega explicitamente qualquer acesso público às mensagens. Apenas usuários autenticados da organização podem ver mensagens.';

-- ============================================================================
-- VERIFICAÇÃO DE SEGURANÇA: Garantir que não há políticas problemáticas
-- ============================================================================

-- Listar todas as políticas nas tabelas críticas para verificação
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE '=== POLÍTICAS ATIVAS ===';
  
  FOR policy_record IN 
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'leads', 'mensagens_chat', 'lead_activities',
        'lead_tags', 'lead_tag_assignments', 'whatsapp_instances',
        'organizations', 'organization_members', 'app_config'
      )
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE 'Tabela: %, Política: %, Roles: %, Comando: %, Permissiva: %',
      policy_record.tablename,
      policy_record.policyname,
      policy_record.roles,
      policy_record.cmd,
      policy_record.permissive;
  END LOOP;
END $$;