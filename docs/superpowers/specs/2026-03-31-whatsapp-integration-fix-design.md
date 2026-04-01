# WhatsApp Integration Fix + Automatic Cleanup

**Date:** 2026-03-31
**Status:** Approved
**Author:** Claude Code

## Problem Statement

The CRM's WhatsApp integration has multiple issues:

1. **QR Code not appearing** - Users cannot connect WhatsApp
2. **Instances don't connect** - Even after scanning QR, connection fails
3. **Multiple orphan instances** - Old instances accumulating in Evolution API
4. **Wrong Evolution API URL** - Code uses old URL, but server changed to `161.97.148.99:8080`

## Root Cause Analysis

The Evolution API URL in the code points to `https://evolution01.kairozspace.com.br`, but the actual server is at `http://161.97.148.99:8080`. This causes all API calls to fail, resulting in:

- QR codes not being generated/retrieved
- Connection status not being updated
- Instances not being properly cleaned up

## Proposed Solution

### 1. Update Evolution API URL

**Files to modify:**
- `supabase/functions/check-whatsapp-status/index.ts`
- `supabase/functions/cleanup-invalid-instances/index.ts`
- `supabase/functions/create-whatsapp-instance/index.ts`
- `supabase/functions/delete-whatsapp-instance/index.ts`
- `supabase/functions/disconnect-whatsapp-instance/index.ts`

**Change:**
```typescript
// From:
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';

// To:
evolutionApiUrl = 'http://161.97.148.99:8080';
```

### 2. Improve Disconnect Function

**File:** `supabase/functions/disconnect-whatsapp-instance/index.ts`

**Enhancements:**
- Handle 404 errors gracefully (instance already deleted)
- Add detailed logging for debugging
- Ensure cleanup happens even if Evolution API is temporarily unavailable

### 3. Create Periodic Cleanup Function (NEW)

**File:** `supabase/functions/cleanup-whatsapp-orphans/index.ts` (NEW)

**Cleanup Rules:**
1. **Disconnected instances in DB:** Delete instances with status `DISCONNECTED` for more than 24 hours
2. **Orphan instances in Evolution API:** Delete instances that don't exist in the CRM database
3. **Duplicate instances:** Keep only the most recent instance per user, delete older ones

**Trigger:** Daily cron job (can be configured via Supabase pg_cron or external scheduler)

**Logic:**
```typescript
// 1. Fetch all instances from Evolution API
// 2. Fetch all instances from CRM database
// 3. Find orphans (in API but not in DB) -> delete from API
// 4. Find disconnected (in DB with status=DISCONNECTED for >24h) -> delete from DB and API
// 5. Find duplicates (same user_id, multiple instances) -> keep most recent, delete others
```

### 4. Diagnostic Script

Before implementing, run a diagnostic to:
1. List all instances in Evolution API at `161.97.148.99:8080`
2. List all instances in CRM database
3. Identify orphans and duplicates
4. Generate cleanup report

## Implementation Steps

1. **Diagnostic Phase:**
   - Run diagnostic script to assess current state
   - Document findings

2. **URL Update Phase:**
   - Update all Edge Functions with new Evolution API URL
   - Deploy changes

3. **Cleanup Function Phase:**
   - Create `cleanup-whatsapp-orphans` Edge Function
   - Test manually
   - Configure cron schedule

4. **Verification Phase:**
   - Test QR code generation
   - Test connection flow
   - Verify cleanup works correctly

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/check-whatsapp-status/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/cleanup-invalid-instances/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/create-whatsapp-instance/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/delete-whatsapp-instance/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/disconnect-whatsapp-instance/index.ts` | Modify | Update Evolution API URL + improve error handling |
| `supabase/functions/cleanup-whatsapp-orphans/index.ts` | Create | New periodic cleanup function |

## Success Criteria

- [ ] QR codes appear within 5 seconds of clicking "Connect"
- [ ] WhatsApp connects successfully after scanning QR
- [ ] Disconnected instances are cleaned up within 24 hours
- [ ] No orphan instances remain in Evolution API
- [ ] No duplicate instances per user

## Rollback Plan

If issues occur:
1. Revert Evolution API URL changes
2. Disable cron job for cleanup function
3. Manual cleanup via Evolution API dashboard

## API Credentials

- **Evolution API URL:** `http://161.97.148.99:8080`
- **API Key:** Configured in Supabase secrets as `EVOLUTION_API_KEY`
