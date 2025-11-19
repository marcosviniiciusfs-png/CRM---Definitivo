-- ============================================================================
-- CORREÇÃO DE SEGURANÇA: RLS Policies para Autenticação e Organization_ID
-- ============================================================================

-- 1. CORRIGIR TABELA PROFILES: Exigir autenticação
-- ============================================================================
-- Remover políticas antigas que permitiam acesso público
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Criar novas políticas que exigem autenticação
CREATE POLICY "Authenticated users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Membros da organização podem ver perfis de outros membros
CREATE POLICY "Organization members can view other members profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT om2.user_id
    FROM public.organization_members om1
    JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid()
  )
);

-- 2. CORRIGIR TABELA LEADS: Exigir autenticação e verificar organization_id
-- ============================================================================
-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view leads in their organizations" ON public.leads;
DROP POLICY IF EXISTS "Users can create leads in their organizations" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their organizations" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their organizations" ON public.leads;

-- Criar novas políticas com autenticação obrigatória
CREATE POLICY "Authenticated users can view leads in their organization"
ON public.leads
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create leads in their organization"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can update leads in their organization"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can delete leads in their organization"
ON public.leads
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

-- 3. REFORÇAR POLÍTICAS DE OUTRAS TABELAS SENSÍVEIS
-- ============================================================================

-- MENSAGENS_CHAT: Garantir que todas as políticas exigem autenticação
DROP POLICY IF EXISTS "Users can view messages from their organization leads" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Users can create messages for their organization leads" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Users can update messages from their organization leads" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Users can delete messages from their organization leads" ON public.mensagens_chat;

CREATE POLICY "Authenticated users can view messages from their organization"
ON public.mensagens_chat
FOR SELECT
TO authenticated
USING (
  id_lead IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can create messages for their organization"
ON public.mensagens_chat
FOR INSERT
TO authenticated
WITH CHECK (
  id_lead IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can update messages from their organization"
ON public.mensagens_chat
FOR UPDATE
TO authenticated
USING (
  id_lead IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can delete messages from their organization"
ON public.mensagens_chat
FOR DELETE
TO authenticated
USING (
  id_lead IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

-- LEAD_ACTIVITIES: Reforçar autenticação
DROP POLICY IF EXISTS "Users can view activities from their organization leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can create activities for their organization leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON public.lead_activities;

CREATE POLICY "Authenticated users can view activities from their organization"
ON public.lead_activities
FOR SELECT
TO authenticated
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can create activities for their organization"
ON public.lead_activities
FOR INSERT
TO authenticated
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can update their own activities"
ON public.lead_activities
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete their own activities"
ON public.lead_activities
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- WHATSAPP_INSTANCES: Reforçar verificação de organization_id
DROP POLICY IF EXISTS "Users can view instances from their organization" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can create instances in their organization" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can update instances from their organization" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can delete instances from their organization" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Organization members can view instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can insert their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can update their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can delete their own instances" ON public.whatsapp_instances;

-- Política única e mais segura para WhatsApp instances
CREATE POLICY "Authenticated users can manage instances in their organization"
ON public.whatsapp_instances
FOR ALL
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
  OR user_id = auth.uid()
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

-- 4. LEAD_TAGS e LEAD_TAG_ASSIGNMENTS: Verificar organization_id
-- ============================================================================
DROP POLICY IF EXISTS "Users can view tags from their organization" ON public.lead_tags;
DROP POLICY IF EXISTS "Users can create tags in their organization" ON public.lead_tags;
DROP POLICY IF EXISTS "Users can update tags in their organization" ON public.lead_tags;
DROP POLICY IF EXISTS "Users can delete tags in their organization" ON public.lead_tags;

CREATE POLICY "Authenticated users can view tags from their organization"
ON public.lead_tags
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create tags in their organization"
ON public.lead_tags
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can update tags in their organization"
ON public.lead_tags
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can delete tags in their organization"
ON public.lead_tags
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

-- LEAD_TAG_ASSIGNMENTS
DROP POLICY IF EXISTS "Users can view tag assignments from their organization leads" ON public.lead_tag_assignments;
DROP POLICY IF EXISTS "Users can create tag assignments for their organization leads" ON public.lead_tag_assignments;
DROP POLICY IF EXISTS "Users can delete tag assignments from their organization leads" ON public.lead_tag_assignments;

CREATE POLICY "Authenticated users can view tag assignments from their organization"
ON public.lead_tag_assignments
FOR SELECT
TO authenticated
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can create tag assignments for their organization"
ON public.lead_tag_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Authenticated users can delete tag assignments from their organization"
ON public.lead_tag_assignments
FOR DELETE
TO authenticated
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

-- 5. APP_CONFIG: Garantir autenticação
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can read config" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated users can insert config" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated users can update config" ON public.app_config;

CREATE POLICY "Authenticated users can read config"
ON public.app_config
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert config"
ON public.app_config
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update config"
ON public.app_config
FOR UPDATE
TO authenticated
USING (true);

-- 6. ORGANIZATIONS e ORGANIZATION_MEMBERS: Verificar políticas
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON public.organizations;

CREATE POLICY "Authenticated users can view their organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated admins can update their organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- ORGANIZATION_MEMBERS
DROP POLICY IF EXISTS "Users can view members of their organization" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can insert members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can delete members" ON public.organization_members;

CREATE POLICY "Authenticated users can view members of their organization"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated owners and admins can insert members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Authenticated owners and admins can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Authenticated owners and admins can delete members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);