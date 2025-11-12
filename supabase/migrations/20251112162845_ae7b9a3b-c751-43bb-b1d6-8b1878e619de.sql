-- Create app_config table for storing application configuration
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Create policy: Only authenticated users can read config
CREATE POLICY "Authenticated users can read config"
ON public.app_config
FOR SELECT
TO authenticated
USING (true);

-- Create policy: Only authenticated users can insert config
CREATE POLICY "Authenticated users can insert config"
ON public.app_config
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy: Only authenticated users can update config
CREATE POLICY "Authenticated users can update config"
ON public.app_config
FOR UPDATE
TO authenticated
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_app_config_updated_at
BEFORE UPDATE ON public.app_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert Evolution API credentials (empty by default, user should update them)
INSERT INTO public.app_config (config_key, config_value, description)
VALUES 
  ('EVOLUTION_API_URL', '', 'URL da Evolution API'),
  ('EVOLUTION_API_KEY', '', 'Chave de API da Evolution API')
ON CONFLICT (config_key) DO NOTHING;