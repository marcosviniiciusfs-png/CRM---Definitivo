-- Add date range and auto-recurring support to production_blocks
ALTER TABLE public.production_blocks
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS auto_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_day INTEGER DEFAULT 1;

COMMENT ON COLUMN public.production_blocks.start_date IS 'Custom period start date (overrides month/year when set)';
COMMENT ON COLUMN public.production_blocks.end_date IS 'Custom period end date (overrides month/year when set)';
COMMENT ON COLUMN public.production_blocks.auto_recurring IS 'If true, auto-create a new block each month';
COMMENT ON COLUMN public.production_blocks.recurrence_day IS 'Day of month (1-28) to auto-create the next block';
