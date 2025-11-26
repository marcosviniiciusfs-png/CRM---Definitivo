-- Criar tabela para mensagens fixadas
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, lead_id)
);

-- Habilitar RLS
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver mensagens fixadas da sua organização"
ON public.pinned_messages
FOR SELECT
USING (
  lead_id IN (
    SELECT l.id FROM public.leads l
    JOIN public.organization_members om ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem fixar mensagens"
ON public.pinned_messages
FOR INSERT
WITH CHECK (
  auth.uid() = pinned_by AND
  lead_id IN (
    SELECT l.id FROM public.leads l
    JOIN public.organization_members om ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem desfixar mensagens"
ON public.pinned_messages
FOR DELETE
USING (
  lead_id IN (
    SELECT l.id FROM public.leads l
    JOIN public.organization_members om ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;