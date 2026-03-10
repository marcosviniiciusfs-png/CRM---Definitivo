-- Criar tabela para reações de mensagens
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Habilitar RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver reações de mensagens da sua organização"
ON public.message_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mensagens_chat m
    JOIN public.leads l ON m.id_lead = l.id
    JOIN public.organization_members om ON l.organization_id = om.organization_id
    WHERE m.id = message_reactions.message_id
    AND om.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem adicionar suas próprias reações"
ON public.message_reactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem remover suas próprias reações"
ON public.message_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;