-- Enable realtime for whatsapp_instances table
ALTER TABLE public.whatsapp_instances REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;