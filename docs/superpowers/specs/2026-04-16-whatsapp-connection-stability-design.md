---
name: WhatsApp Connection Stability Fix
description: Fix random WhatsApp disconnections caused by unprotected webhook status updates and missing auto-reconnection logic
date: 2026-04-16
status: approved
---

# WhatsApp Connection Stability Fix

## Problem

WhatsApp instances disconnect randomly in the CRM. Users report needing to reconnect frequently without clear cause.

## Root Cause Analysis

### Cause 1: Webhook CONNECTION_UPDATE overwrites CONNECTED status without protection

`supabase/functions/whatsapp-message-webhook/index.ts` lines 256-301: When Evolution API sends a transient `CONNECTION_UPDATE` event (state = `connecting`, `close`, etc.), the handler immediately overwrites the database status to DISCONNECTED or CREATING, even when the instance was previously CONNECTED.

The Baileys library sends transient states during:
- Network micro-interruptions
- Encryption renegotiation
- Internal WhatsApp reconnects
- Server maintenance

Unlike `check-whatsapp-status` which has `.neq('status', 'CONNECTED')` guards, the webhook handler has **zero protection**.

### Cause 2: Unknown state defaults to DISCONNECTED

Line 267: `let newStatus = 'DISCONNECTED'` — any unrecognized, null, or undefined state is treated as disconnection.

### Cause 3: No auto-reconnection logic

When disconnection occurs, users must manually reconnect. No automatic retry or restart mechanism exists.

## Solution

### Fix 1: Protect webhook CONNECTION_UPDATE handler

File: `supabase/functions/whatsapp-message-webhook/index.ts`

- Add `.neq('status', 'CONNECTED')` guard when updating to non-connected states
- Do NOT overwrite CONNECTED with transient states (`connecting`)
- Ignore null/undefined/empty states entirely (keep current status)
- Only accept `close` or `disconnected` as real disconnection signals

```typescript
// Only update if not already CONNECTED (prevent transient state overwrite)
if (newStatus !== 'CONNECTED') {
  const { error } = await supabase
    .from('whatsapp_instances')
    .update(updatePayload)
    .eq('instance_name', instance)
    .neq('status', 'CONNECTED');
}
```

### Fix 2: Double-check before marking as DISCONNECTED

When webhook receives `close`/`disconnected`:

1. Call Evolution API `/instance/connectionState/{instance}` to confirm
2. If API confirms disconnected → update to DISCONNECTED
3. If API returns `open` → ignore (false positive, transient state)
4. If API is unreachable → keep current status (don't assume disconnected)

### Fix 3: Auto-reconnection via new Edge Function

New file: `supabase/functions/auto-reconnect-whatsapp/index.ts`

When connection drops for real:

1. Call Evolution API `/instance/restart/{instance}` to attempt reconnect
2. Wait 5 seconds, then check connection state
3. If reconnected → update database to CONNECTED
4. If still disconnected → mark DISCONNECTED, notify user via Realtime
5. Max 3 retry attempts with 10-second intervals

### Fix 4: Enhanced check-whatsapp-status protection

File: `supabase/functions/check-whatsapp-status/index.ts`

- Before marking DISCONNECTED, attempt `/instance/restart/{instance}`
- Only update to DISCONNECTED if restart also fails
- Keep existing `.neq('status', 'CONNECTED')` guards

## Files to Modify

1. `supabase/functions/whatsapp-message-webhook/index.ts` — Fix 1 + Fix 2
2. `supabase/functions/check-whatsapp-status/index.ts` — Fix 4
3. `supabase/functions/auto-reconnect-whatsapp/index.ts` — Fix 3 (new file)

## Testing Plan

1. Connect WhatsApp normally
2. Simulate network interruption on Evolution API server
3. Verify connection stays CONNECTED during transient states
4. Verify auto-reconnect works when real disconnection occurs
5. Verify user notification when reconnection fails after 3 attempts
