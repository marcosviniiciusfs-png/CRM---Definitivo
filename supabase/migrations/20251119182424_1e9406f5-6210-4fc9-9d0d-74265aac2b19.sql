-- Enable realtime for core chat tables if not already added
DO $$
BEGIN
  -- leads
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;

  -- mensagens_chat
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mensagens_chat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_chat;
  END IF;

  -- lead_tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lead_tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tags;
  END IF;

  -- lead_tag_assignments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lead_tag_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tag_assignments;
  END IF;
END $$;