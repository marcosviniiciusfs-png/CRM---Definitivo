-- Adicionar foreign key com cascade delete para garantir que ao excluir um lead, suas mensagens também sejam excluídas
ALTER TABLE public.mensagens_chat
DROP CONSTRAINT IF EXISTS mensagens_chat_id_lead_fkey;

ALTER TABLE public.mensagens_chat
ADD CONSTRAINT mensagens_chat_id_lead_fkey 
FOREIGN KEY (id_lead) 
REFERENCES public.leads(id) 
ON DELETE CASCADE;