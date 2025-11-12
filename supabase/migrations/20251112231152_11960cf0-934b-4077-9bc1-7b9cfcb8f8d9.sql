-- Habilitar realtime para a tabela leads
ALTER TABLE public.leads REPLICA IDENTITY FULL;

-- Adicionar a tabela leads à publicação realtime do Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;