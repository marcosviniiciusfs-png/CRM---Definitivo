-- Create a security definer function to get facebook integrations with field-level access control
-- Access tokens are only visible to owners and admins, other members see NULL

CREATE OR REPLACE FUNCTION public.get_facebook_integrations_masked()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  organization_id uuid,
  webhook_verified boolean,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  selected_form_id text,
  selected_form_name text,
  access_token text,
  page_id text,
  page_name text,
  page_access_token text,
  ad_account_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_org_id uuid;
  current_user_role organization_role;
BEGIN
  -- Get the current user's organization and role
  SELECT om.organization_id, om.role 
  INTO current_user_org_id, current_user_role
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;
  
  -- Return integrations with tokens masked based on role
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
    -- Only owners and admins can see access tokens
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN fi.access_token
      ELSE NULL
    END as access_token,
    fi.page_id,
    fi.page_name,
    -- Only owners and admins can see page access tokens
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN fi.page_access_token
      ELSE NULL
    END as page_access_token,
    fi.ad_account_id
  FROM public.facebook_integrations fi
  WHERE fi.organization_id = current_user_org_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated;