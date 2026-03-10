-- Corrigir leads existentes em etapas "won" sem data_conclusao
-- Esta migração encontra todos os leads em etapas do tipo "won" que não possuem data_conclusao
-- e define a data_conclusao como a data de updated_at do lead

UPDATE public.leads
SET data_conclusao = updated_at
WHERE data_conclusao IS NULL
  AND funnel_stage_id IN (
    SELECT id 
    FROM public.funnel_stages 
    WHERE stage_type = 'won'
  );