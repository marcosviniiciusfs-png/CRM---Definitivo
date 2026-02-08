
-- ============================================================
-- FUNÇÃO: notify_task_assignment
-- Cria notificação automaticamente quando um assignee é adicionado
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  card_record RECORD;
  org_id UUID;
  card_title TEXT;
  assigner_id UUID;
  assigner_name TEXT;
BEGIN
  -- Não notificar se o usuário está se atribuindo a si mesmo
  IF NEW.user_id = COALESCE(NEW.assigned_by, auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Buscar informações do card (título, organização via board)
  SELECT 
    kc.content,
    kc.due_date,
    kc.estimated_time,
    kb.organization_id
  INTO card_record
  FROM public.kanban_cards kc
  JOIN public.kanban_columns kcol ON kcol.id = kc.column_id
  JOIN public.kanban_boards kb ON kb.id = kcol.board_id
  WHERE kc.id = NEW.card_id;

  -- Se não encontrou o card, não fazer nada
  IF card_record IS NULL THEN
    RETURN NEW;
  END IF;

  org_id := card_record.organization_id;
  card_title := card_record.content;

  -- Verificar se o destinatário (NEW.user_id) é membro da organização
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = NEW.user_id
      AND is_active = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Identificar quem está atribuindo
  assigner_id := COALESCE(NEW.assigned_by, auth.uid());

  -- Buscar nome de quem atribuiu
  SELECT COALESCE(p.full_name, om.email, 'Um colaborador')
  INTO assigner_name
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.user_id = assigner_id
  LIMIT 1;

  IF assigner_name IS NULL THEN
    assigner_name := 'Um colaborador';
  END IF;

  -- Inserir a notificação
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    card_id,
    from_user_id,
    due_date,
    time_estimate
  ) VALUES (
    NEW.user_id,
    'task_assigned',
    'Tarefa atribuída',
    assigner_name || ' atribuiu a tarefa "' || LEFT(card_title, 50) || CASE WHEN LENGTH(card_title) > 50 THEN '...' ELSE '' END || '" para você.',
    NEW.card_id,
    assigner_id,
    card_record.due_date,
    card_record.estimated_time
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the original INSERT
    RAISE WARNING 'notify_task_assignment error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGER: Dispara a função após INSERT em kanban_card_assignees
-- ============================================================
DROP TRIGGER IF EXISTS tr_notify_task_assignment ON public.kanban_card_assignees;

CREATE TRIGGER tr_notify_task_assignment
AFTER INSERT ON public.kanban_card_assignees
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_assignment();

-- ============================================================
-- BACKFILL: Criar notificações para atribuições recentes sem notificação
-- ============================================================
INSERT INTO public.notifications (user_id, type, title, message, card_id, from_user_id, due_date, time_estimate)
SELECT 
  kca.user_id,
  'task_assigned',
  'Tarefa atribuída',
  COALESCE(
    (SELECT COALESCE(p.full_name, om.email, 'Um colaborador')
     FROM public.organization_members om
     LEFT JOIN public.profiles p ON p.user_id = om.user_id
     WHERE om.user_id = kca.assigned_by
     LIMIT 1),
    'Um colaborador'
  ) || ' atribuiu a tarefa "' || LEFT(kc.content, 50) || CASE WHEN LENGTH(kc.content) > 50 THEN '...' ELSE '' END || '" para você.',
  kca.card_id,
  kca.assigned_by,
  kc.due_date,
  kc.estimated_time
FROM public.kanban_card_assignees kca
JOIN public.kanban_cards kc ON kc.id = kca.card_id
JOIN public.kanban_columns kcol ON kcol.id = kc.column_id
JOIN public.kanban_boards kb ON kb.id = kcol.board_id
WHERE kca.assigned_at > NOW() - INTERVAL '90 days'
  AND kca.user_id != COALESCE(kca.assigned_by, kca.user_id) -- Não notificar auto-atribuição
  AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = kb.organization_id
      AND user_id = kca.user_id
      AND is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = kca.user_id
      AND n.card_id = kca.card_id
      AND n.type = 'task_assigned'
  );
