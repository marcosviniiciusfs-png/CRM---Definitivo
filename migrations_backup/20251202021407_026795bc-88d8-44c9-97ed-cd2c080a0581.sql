-- Adicionar colunas de ícone e cor na tabela sales_funnels
ALTER TABLE public.sales_funnels 
ADD COLUMN icon TEXT,
ADD COLUMN icon_color TEXT DEFAULT '#4CA698';