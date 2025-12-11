-- Dropar função antiga e recriar
DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked();

-- Recriar função sem tokens
CREATE OR REPLACE FUNCTION public.get_facebook_integrations_masked()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  organization_id uuid,
  webhook_verified boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  expires_at timestamp with time zone,
  selected_form_id text,
  selected_form_name text,
  page_id text,
  page_name text,
  ad_account_id text,
  ad_accounts jsonb,
  business_id text,
  business_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_org_id uuid;
BEGIN
  SELECT om.organization_id 
  INTO current_user_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;
  
  RETURN QUERY
  SELECT 
    fi.id,
    fi.user_id,
    fi.organization_id,
    fi.webhook_verified,
    fi.created_at,
    fi.updated_at,
    fi.expires_at,
    fi.selected_form_id,
    fi.selected_form_name,
    fi.page_id,
    fi.page_name,
    fi.ad_account_id,
    fi.ad_accounts::jsonb,
    fi.business_id,
    fi.business_name
  FROM public.facebook_integrations fi
  WHERE fi.organization_id = current_user_org_id;
END;
$$;