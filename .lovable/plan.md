

## Fix: Remove Invalid Facebook OAuth Scope

### Problem
The Facebook OAuth flow is failing because `pages_manage_metadata` is listed as a requested scope, but Meta considers it invalid for the current API version (v18.0). The error message confirms: *"Invalid Scopes: pages_manage_metadata"*.

### Solution
Remove `pages_manage_metadata` from the scopes array in the `facebook-oauth-initiate` Edge Function. The remaining scopes are sufficient for the leads and ads integration.

### Technical Details

**File:** `supabase/functions/facebook-oauth-initiate/index.ts`

Update the scopes array from:
```
leads_retrieval, pages_manage_ads, pages_show_list, 
pages_read_engagement, pages_manage_metadata, 
business_management, ads_read
```

To:
```
leads_retrieval, pages_manage_ads, pages_show_list, 
pages_read_engagement, business_management, ads_read
```

This is a single-line change -- removing `pages_manage_metadata` from the scopes list. The function will then be redeployed automatically.

