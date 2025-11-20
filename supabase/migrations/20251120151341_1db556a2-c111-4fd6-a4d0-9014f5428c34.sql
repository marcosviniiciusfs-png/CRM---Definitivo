-- Criar tabela de notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Deny public access to notifications"
ON public.notifications
FOR ALL
USING (false);

-- Índices para melhor performance
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Função para criar notificação quando lead é atribuído
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  responsible_user_id UUID;
  current_user_id UUID;
  from_user_name TEXT;
  lead_name TEXT;
BEGIN
  -- Pegar o user_id atual
  current_user_id := auth.uid();
  
  -- Se não há usuário autenticado (webhook), não criar notificação
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se o responsável não mudou, não fazer nada
  IF OLD.responsavel IS NOT DISTINCT FROM NEW.responsavel THEN
    RETURN NEW;
  END IF;
  
  -- Se o responsável foi removido, não criar notificação
  IF NEW.responsavel IS NULL OR NEW.responsavel = '' THEN
    RETURN NEW;
  END IF;
  
  -- Buscar o user_id do responsável baseado no nome ou email
  SELECT p.user_id INTO responsible_user_id
  FROM public.profiles p
  WHERE p.full_name = NEW.responsavel 
     OR EXISTS (
       SELECT 1 FROM public.organization_members om 
       WHERE om.email = NEW.responsavel AND om.user_id = p.user_id
     )
  LIMIT 1;
  
  -- Se não encontrou o user_id do responsável, não criar notificação
  IF responsible_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se o usuário está atribuindo para si mesmo, não criar notificação
  IF responsible_user_id = current_user_id THEN
    RETURN NEW;
  END IF;
  
  -- Buscar o nome do usuário que está atribuindo
  SELECT COALESCE(p.full_name, om.email, 'Um colaborador')
  INTO from_user_name
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.user_id = current_user_id
  LIMIT 1;
  
  -- Nome do lead
  lead_name := NEW.nome_lead;
  
  -- Criar notificação
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    lead_id,
    from_user_id
  ) VALUES (
    responsible_user_id,
    'lead_assigned',
    'Novo lead atribuído',
    from_user_name || ' atribuiu o lead "' || lead_name || '" para você.',
    NEW.id,
    current_user_id
  );
  
  RETURN NEW;
END;
$$;

-- Criar trigger para notificar sobre atribuições de leads
DROP TRIGGER IF EXISTS trigger_notify_lead_assignment ON public.leads;
CREATE TRIGGER trigger_notify_lead_assignment
AFTER UPDATE OF responsavel ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.notify_lead_assignment();

-- Habilitar realtime para notificações
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;