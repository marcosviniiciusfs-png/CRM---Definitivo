-- Criar tabela de sessões de usuários
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  logout_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view sessions from their organization"
ON public.user_sessions
FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Deny public access to sessions"
ON public.user_sessions
FOR ALL
USING (false);

-- Índices
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_organization_id ON public.user_sessions(organization_id);
CREATE INDEX idx_user_sessions_login_at ON public.user_sessions(login_at DESC);

-- Criar tabela de atividades de sistema
CREATE TABLE IF NOT EXISTS public.system_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.system_activities ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view activities from their organization"
ON public.system_activities
FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Deny public access to system activities"
ON public.system_activities
FOR ALL
USING (false);

-- Índices
CREATE INDEX idx_system_activities_user_id ON public.system_activities(user_id);
CREATE INDEX idx_system_activities_organization_id ON public.system_activities(organization_id);
CREATE INDEX idx_system_activities_type ON public.system_activities(activity_type);
CREATE INDEX idx_system_activities_created_at ON public.system_activities(created_at DESC);

-- Função para registrar mudança de etapa do lead
CREATE OR REPLACE FUNCTION public.log_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  user_org_id UUID;
  user_name TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    -- Buscar organização e nome do usuário
    SELECT om.organization_id, COALESCE(p.full_name, om.email, 'Usuário')
    INTO user_org_id, user_name
    FROM public.organization_members om
    LEFT JOIN public.profiles p ON p.user_id = om.user_id
    WHERE om.user_id = current_user_id
    LIMIT 1;
    
    IF user_org_id IS NOT NULL THEN
      INSERT INTO public.system_activities (
        user_id,
        organization_id,
        activity_type,
        description,
        lead_id,
        metadata
      ) VALUES (
        current_user_id,
        user_org_id,
        'lead_stage_changed',
        user_name || ' moveu o lead "' || NEW.nome_lead || '" de "' || COALESCE(OLD.stage, 'NOVO') || '" para "' || COALESCE(NEW.stage, 'NOVO') || '"',
        NEW.id,
        jsonb_build_object(
          'old_stage', OLD.stage,
          'new_stage', NEW.stage,
          'lead_name', NEW.nome_lead
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para mudança de etapa
DROP TRIGGER IF EXISTS trigger_log_lead_stage_change ON public.leads;
CREATE TRIGGER trigger_log_lead_stage_change
AFTER UPDATE OF stage ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_stage_change();

-- Função para registrar atribuição de responsável
CREATE OR REPLACE FUNCTION public.log_lead_responsible_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  user_org_id UUID;
  user_name TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF OLD.responsavel IS DISTINCT FROM NEW.responsavel AND NEW.responsavel IS NOT NULL THEN
    -- Buscar organização e nome do usuário
    SELECT om.organization_id, COALESCE(p.full_name, om.email, 'Usuário')
    INTO user_org_id, user_name
    FROM public.organization_members om
    LEFT JOIN public.profiles p ON p.user_id = om.user_id
    WHERE om.user_id = current_user_id
    LIMIT 1;
    
    IF user_org_id IS NOT NULL THEN
      INSERT INTO public.system_activities (
        user_id,
        organization_id,
        activity_type,
        description,
        lead_id,
        metadata
      ) VALUES (
        current_user_id,
        user_org_id,
        'lead_responsible_assigned',
        user_name || ' atribuiu "' || NEW.responsavel || '" como responsável pelo lead "' || NEW.nome_lead || '"',
        NEW.id,
        jsonb_build_object(
          'responsible', NEW.responsavel,
          'lead_name', NEW.nome_lead
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para atribuição de responsável (modificar o existente para não duplicar)
DROP TRIGGER IF EXISTS trigger_log_lead_responsible_assignment ON public.leads;
CREATE TRIGGER trigger_log_lead_responsible_assignment
AFTER UPDATE OF responsavel ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_responsible_assignment();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_activities;