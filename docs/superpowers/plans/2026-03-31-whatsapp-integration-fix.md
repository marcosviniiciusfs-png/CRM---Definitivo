# WhatsApp Integration Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix WhatsApp integration by updating Evolution API URL and implementing automatic cleanup of orphan instances.

**Architecture:** Update all Edge Functions to use the new Evolution API URL (`http://161.97.148.99:8080`), create a new cleanup function for orphan instances, and improve disconnect handling.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Evolution API, PostgreSQL

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/check-whatsapp-status/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/cleanup-invalid-instances/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/create-whatsapp-instance/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/delete-whatsapp-instance/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/disconnect-whatsapp-instance/index.ts` | Modify | Update Evolution API URL + improve error handling |
| `supabase/functions/fetch-presence-status/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/fetch-profile-picture/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/fix-webhook-config/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/fix-webhook-config-v2/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/process-automation-rules/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/send-scheduled-reminders/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/send-whatsapp-media/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/send-whatsapp-message/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/send-whatsapp-reaction/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/set-whatsapp-presence/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/test-webhook-evolution/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/whatsapp-message-webhook/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/whatsapp-qr-webhook/index.ts` | Modify | Update Evolution API URL |
| `supabase/functions/cleanup-whatsapp-orphans/index.ts` | Create | New periodic cleanup function |

---

## Task 1: Update Evolution API URL in check-whatsapp-status

**Files:**
- Modify: `supabase/functions/check-whatsapp-status/index.ts:57-58`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/check-whatsapp-status/index.ts
git commit -m "fix: update Evolution API URL in check-whatsapp-status"
```

---

## Task 2: Update Evolution API URL in cleanup-invalid-instances

**Files:**
- Modify: `supabase/functions/cleanup-invalid-instances/index.ts:68`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/cleanup-invalid-instances/index.ts
git commit -m "fix: update Evolution API URL in cleanup-invalid-instances"
```

---

## Task 3: Update Evolution API URL in create-whatsapp-instance

**Files:**
- Modify: `supabase/functions/create-whatsapp-instance/index.ts:172`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/create-whatsapp-instance/index.ts
git commit -m "fix: update Evolution API URL in create-whatsapp-instance"
```

---

## Task 4: Update Evolution API URL in delete-whatsapp-instance

**Files:**
- Modify: `supabase/functions/delete-whatsapp-instance/index.ts:67`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/delete-whatsapp-instance/index.ts
git commit -m "fix: update Evolution API URL in delete-whatsapp-instance"
```

---

## Task 5: Update Evolution API URL and Improve Error Handling in disconnect-whatsapp-instance

**Files:**
- Modify: `supabase/functions/disconnect-whatsapp-instance/index.ts:67,80-115`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line 67 with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Improve logout error handling to handle 404 gracefully**

Find lines 80-99 (the logout try-catch block):
```typescript
// STEP 1: Logout from Evolution API
try {
  console.log('🔓 Logging out instance:', instance.instance_name);
  const logoutResponse = await fetch(`${baseUrl}/instance/logout/${instance.instance_name}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionApiKey,
    },
  });

  if (logoutResponse.ok) {
    console.log('✅ Instance logged out successfully');
  } else {
    console.warn('⚠️ Logout failed:', logoutResponse.status);
  }
} catch (logoutError) {
  console.warn('⚠️ Error during logout:', logoutError);
  // Continue to delete even if logout fails
}
```

Replace with:
```typescript
// STEP 1: Logout from Evolution API
try {
  console.log('🔓 Logging out instance:', instance.instance_name);
  const logoutResponse = await fetch(`${baseUrl}/instance/logout/${instance.instance_name}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionApiKey,
    },
  });

  if (logoutResponse.ok) {
    console.log('✅ Instance logged out successfully');
  } else if (logoutResponse.status === 404) {
    console.log('ℹ️ Instance not found in Evolution API (already deleted)');
  } else {
    console.warn('⚠️ Logout failed:', logoutResponse.status);
  }
} catch (logoutError) {
  console.warn('⚠️ Error during logout:', logoutError);
  // Continue to delete even if logout fails
}
```

- [ ] **Step 3: Improve delete error handling to handle 404 gracefully**

Find lines 101-119 (the delete response handling):
```typescript
// STEP 2: Delete instance from Evolution API
console.log('🗑️ Deleting instance from Evolution API:', instance.instance_name);
const deleteResponse = await fetch(`${baseUrl}/instance/delete/${instance.instance_name}`, {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'apikey': evolutionApiKey,
  },
});

if (!deleteResponse.ok) {
  const errorText = await deleteResponse.text();
  console.error('Evolution API delete error:', errorText);
  throw new Error(`Evolution API delete error: ${deleteResponse.status} - ${errorText}`);
}

const evolutionData = await deleteResponse.json();
console.log('✅ Evolution API delete response:', evolutionData);
```

Replace with:
```typescript
// STEP 2: Delete instance from Evolution API
console.log('🗑️ Deleting instance from Evolution API:', instance.instance_name);
const deleteResponse = await fetch(`${baseUrl}/instance/delete/${instance.instance_name}`, {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'apikey': evolutionApiKey,
  },
});

if (!deleteResponse.ok) {
  const errorText = await deleteResponse.text();

  // Handle 404 - instance already deleted (not an error)
  if (deleteResponse.status === 404) {
    console.log('ℹ️ Instance not found in Evolution API (already deleted)');
  } else {
    console.error('Evolution API delete error:', errorText);
    throw new Error(`Evolution API delete error: ${deleteResponse.status} - ${errorText}`);
  }
} else {
  const evolutionData = await deleteResponse.json();
  console.log('✅ Evolution API delete response:', evolutionData);
}
```

- [ ] **Step 4: Commit the change**

```bash
git add supabase/functions/disconnect-whatsapp-instance/index.ts
git commit -m "fix: update Evolution API URL and improve error handling in disconnect-whatsapp-instance"
```

---

## Task 6: Update Evolution API URL in fetch-presence-status

**Files:**
- Modify: `supabase/functions/fetch-presence-status/index.ts:36`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/fetch-presence-status/index.ts
git commit -m "fix: update Evolution API URL in fetch-presence-status"
```

---

## Task 7: Update Evolution API URL in fetch-profile-picture

**Files:**
- Modify: `supabase/functions/fetch-profile-picture/index.ts:35`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/fetch-profile-picture/index.ts
git commit -m "fix: update Evolution API URL in fetch-profile-picture"
```

---

## Task 8: Update Evolution API URL in fix-webhook-config

**Files:**
- Modify: `supabase/functions/fix-webhook-config/index.ts:55`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/fix-webhook-config/index.ts
git commit -m "fix: update Evolution API URL in fix-webhook-config"
```

---

## Task 9: Update Evolution API URL in fix-webhook-config-v2

**Files:**
- Modify: `supabase/functions/fix-webhook-config-v2/index.ts:55`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/fix-webhook-config-v2/index.ts
git commit -m "fix: update Evolution API URL in fix-webhook-config-v2"
```

---

## Task 10: Update Evolution API URL in process-automation-rules

**Files:**
- Modify: `supabase/functions/process-automation-rules/index.ts:255`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/process-automation-rules/index.ts
git commit -m "fix: update Evolution API URL in process-automation-rules"
```

---

## Task 11: Update Evolution API URL in send-scheduled-reminders

**Files:**
- Modify: `supabase/functions/send-scheduled-reminders/index.ts:98`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/send-scheduled-reminders/index.ts
git commit -m "fix: update Evolution API URL in send-scheduled-reminders"
```

---

## Task 12: Update Evolution API URL in send-whatsapp-media

**Files:**
- Modify: `supabase/functions/send-whatsapp-media/index.ts:55,69`

- [ ] **Step 1: Update the Evolution API fallback URL on line 55**

Find line with:
```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Update the Evolution API fallback URL on line 69**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 3: Commit the change**

```bash
git add supabase/functions/send-whatsapp-media/index.ts
git commit -m "fix: update Evolution API URL in send-whatsapp-media"
```

---

## Task 13: Update Evolution API URL in send-whatsapp-message

**Files:**
- Modify: `supabase/functions/send-whatsapp-message/index.ts:72`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/send-whatsapp-message/index.ts
git commit -m "fix: update Evolution API URL in send-whatsapp-message"
```

---

## Task 14: Update Evolution API URL in send-whatsapp-reaction

**Files:**
- Modify: `supabase/functions/send-whatsapp-reaction/index.ts:116`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = "https://evolution01.kairozspace.com.br";
```

Replace with:
```typescript
evolutionApiUrl = "http://161.97.148.99:8080";
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/send-whatsapp-reaction/index.ts
git commit -m "fix: update Evolution API URL in send-whatsapp-reaction"
```

---

## Task 15: Update Evolution API URL in set-whatsapp-presence

**Files:**
- Modify: `supabase/functions/set-whatsapp-presence/index.ts:59`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/set-whatsapp-presence/index.ts
git commit -m "fix: update Evolution API URL in set-whatsapp-presence"
```

---

## Task 16: Update Evolution API URL in test-webhook-evolution

**Files:**
- Modify: `supabase/functions/test-webhook-evolution/index.ts:23`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
evolutionApiUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/test-webhook-evolution/index.ts
git commit -m "fix: update Evolution API URL in test-webhook-evolution"
```

---

## Task 17: Update Evolution API URL in whatsapp-message-webhook

**Files:**
- Modify: `supabase/functions/whatsapp-message-webhook/index.ts:167`

- [ ] **Step 1: Update the Evolution API fallback URL**

Find line with:
```typescript
serverUrl = 'https://evolution01.kairozspace.com.br';
```

Replace with:
```typescript
serverUrl = 'http://161.97.148.99:8080';
```

- [ ] **Step 2: Commit the change**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "fix: update Evolution API URL in whatsapp-message-webhook"
```

---

## Task 18: Update Evolution API URL in whatsapp-qr-webhook

**Files:**
- Modify: `supabase/functions/whatsapp-qr-webhook/index.ts:193`

- [ ] **Step 1: Verify the URL handling in whatsapp-qr-webhook**

The file uses `Deno.env.get('EVOLUTION_API_URL')` without a hardcoded fallback. No change needed if environment variable is set correctly. If a fallback is needed, add it.

- [ ] **Step 2: Commit if any changes made**

```bash
git add supabase/functions/whatsapp-qr-webhook/index.ts
git commit -m "fix: update Evolution API URL in whatsapp-qr-webhook" || echo "No changes needed"
```

---

## Task 19: Create cleanup-whatsapp-orphans Edge Function

**Files:**
- Create: `supabase/functions/cleanup-whatsapp-orphans/index.ts`

- [ ] **Step 1: Create the function directory**

```bash
mkdir -p supabase/functions/cleanup-whatsapp-orphans
```

- [ ] **Step 2: Create the Edge Function file**

Create `supabase/functions/cleanup-whatsapp-orphans/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CleanupResult {
  deletedFromApi: string[];
  deletedFromDb: string[];
  duplicatesRemoved: string[];
  errors: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const result: CleanupResult = {
    deletedFromApi: [],
    deletedFromDb: [],
    duplicatesRemoved: [],
    errors: [],
  };

  try {
    console.log('🧹 Starting WhatsApp orphan cleanup...');

    // Optional: Verify authorization for manual triggers
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    // If called manually (not by cron), verify auth
    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        // Check if it's a cron secret
        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
          console.log('✅ Authorized via CRON_SECRET');
        } else {
          throw new Error('Unauthorized');
        }
      }
    } else if (cronSecret) {
      // No auth header but cron secret exists - require auth
      throw new Error('Authorization required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Evolution API credentials
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      evolutionApiUrl = 'http://161.97.148.99:8080';
    }

    if (!evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');

    // ========================================
    // STEP 1: Fetch all instances from Evolution API
    // ========================================
    console.log('📡 Fetching instances from Evolution API...');
    const fetchResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch instances from Evolution API: ${fetchResponse.status}`);
    }

    const apiInstances = await fetchResponse.json();
    const apiInstanceNames = new Set(
      Array.isArray(apiInstances)
        ? apiInstances.map((inst: any) => inst.instance?.instanceName).filter(Boolean)
        : []
    );

    console.log(`📋 Found ${apiInstanceNames.size} instances in Evolution API`);

    // ========================================
    // STEP 2: Fetch all instances from database
    // ========================================
    console.log('📡 Fetching instances from database...');
    const { data: dbInstances, error: dbError } = await supabase
      .from('whatsapp_instances')
      .select('*');

    if (dbError) {
      throw dbError;
    }

    console.log(`📋 Found ${dbInstances?.length || 0} instances in database`);

    // ========================================
    // STEP 3: Find and delete orphans in Evolution API (not in DB)
    // ========================================
    console.log('🔍 Finding orphans in Evolution API...');
    const crmInstanceNames = new Set(dbInstances?.map(inst => inst.instance_name) || []);

    for (const apiInstanceName of apiInstanceNames) {
      // Only cleanup CRM-related instances (start with crm-)
      if (!apiInstanceName.startsWith('crm-')) {
        continue;
      }

      if (!crmInstanceNames.has(apiInstanceName)) {
        console.log(`🗑️ Deleting orphan from Evolution API: ${apiInstanceName}`);
        try {
          // Logout first
          await fetch(`${baseUrl}/instance/logout/${apiInstanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          // Delete
          const deleteResponse = await fetch(`${baseUrl}/instance/delete/${apiInstanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          if (deleteResponse.ok || deleteResponse.status === 404) {
            result.deletedFromApi.push(apiInstanceName);
            console.log(`✅ Deleted orphan: ${apiInstanceName}`);
          } else {
            result.errors.push(`Failed to delete ${apiInstanceName}: ${deleteResponse.status}`);
          }
        } catch (e) {
          result.errors.push(`Error deleting ${apiInstanceName}: ${e}`);
        }
      }
    }

    // ========================================
    // STEP 4: Find and delete disconnected instances (>24h old)
    // ========================================
    console.log('🔍 Finding disconnected instances...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const disconnectedInstances = dbInstances?.filter(
      inst => inst.status === 'DISCONNECTED' && inst.updated_at < twentyFourHoursAgo
    ) || [];

    for (const inst of disconnectedInstances) {
      console.log(`🗑️ Deleting disconnected instance: ${inst.instance_name}`);
      try {
        // Delete from Evolution API if exists
        if (apiInstanceNames.has(inst.instance_name)) {
          await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });

          await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
          });
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', inst.id);

        if (deleteError) {
          result.errors.push(`Failed to delete ${inst.instance_name} from DB: ${deleteError.message}`);
        } else {
          result.deletedFromDb.push(inst.instance_name);
          console.log(`✅ Deleted disconnected: ${inst.instance_name}`);
        }
      } catch (e) {
        result.errors.push(`Error deleting ${inst.instance_name}: ${e}`);
      }
    }

    // ========================================
    // STEP 5: Find and remove duplicates (same user, keep most recent)
    // ========================================
    console.log('🔍 Finding duplicate instances...');
    const instancesByUser = new Map<string, typeof dbInstances>();

    for (const inst of dbInstances || []) {
      const userId = inst.user_id;
      if (!instancesByUser.has(userId)) {
        instancesByUser.set(userId, []);
      }
      instancesByUser.get(userId)!.push(inst);
    }

    for (const [userId, instances] of instancesByUser) {
      // Only process if user has multiple instances
      if (instances.length <= 1) continue;

      // Sort by created_at descending (most recent first)
      instances.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Keep the most recent, delete the rest (only if status is not CONNECTED)
      const toDelete = instances.slice(1).filter(inst => inst.status !== 'CONNECTED');

      for (const inst of toDelete) {
        console.log(`🗑️ Deleting duplicate: ${inst.instance_name}`);
        try {
          // Delete from Evolution API if exists
          if (apiInstanceNames.has(inst.instance_name)) {
            await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
              method: 'DELETE',
              headers: { 'apikey': evolutionApiKey },
            });

            await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
              method: 'DELETE',
              headers: { 'apikey': evolutionApiKey },
            });
          }

          // Delete from database
          const { error: deleteError } = await supabase
            .from('whatsapp_instances')
            .delete()
            .eq('id', inst.id);

          if (deleteError) {
            result.errors.push(`Failed to delete duplicate ${inst.instance_name}: ${deleteError.message}`);
          } else {
            result.duplicatesRemoved.push(inst.instance_name);
            console.log(`✅ Deleted duplicate: ${inst.instance_name}`);
          }
        } catch (e) {
          result.errors.push(`Error deleting duplicate ${inst.instance_name}: ${e}`);
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log('🧹 Cleanup complete!');
    console.log(`  - Deleted from API: ${result.deletedFromApi.length}`);
    console.log(`  - Deleted from DB: ${result.deletedFromDb.length}`);
    console.log(`  - Duplicates removed: ${result.duplicatesRemoved.length}`);
    console.log(`  - Errors: ${result.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completed',
        result: {
          deletedFromApi: result.deletedFromApi.length,
          deletedFromDb: result.deletedFromDb.length,
          duplicatesRemoved: result.duplicatesRemoved.length,
          errors: result.errors.length,
          details: result,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Cleanup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
```

- [ ] **Step 3: Commit the new function**

```bash
git add supabase/functions/cleanup-whatsapp-orphans/index.ts
git commit -m "feat: add cleanup-whatsapp-orphans Edge Function for periodic cleanup"
```

---

## Task 20: Deploy Edge Functions and Verify

**Files:**
- None (deployment step)

- [ ] **Step 1: Deploy all modified Edge Functions**

```bash
npx supabase functions deploy check-whatsapp-status
npx supabase functions deploy cleanup-invalid-instances
npx supabase functions deploy create-whatsapp-instance
npx supabase functions deploy delete-whatsapp-instance
npx supabase functions deploy disconnect-whatsapp-instance
npx supabase functions deploy fetch-presence-status
npx supabase functions deploy fetch-profile-picture
npx supabase functions deploy fix-webhook-config
npx supabase functions deploy fix-webhook-config-v2
npx supabase functions deploy process-automation-rules
npx supabase functions deploy send-scheduled-reminders
npx supabase functions deploy send-whatsapp-media
npx supabase functions deploy send-whatsapp-message
npx supabase functions deploy send-whatsapp-reaction
npx supabase functions deploy set-whatsapp-presence
npx supabase functions deploy test-webhook-evolution
npx supabase functions deploy whatsapp-message-webhook
npx supabase functions deploy whatsapp-qr-webhook
npx supabase functions deploy cleanup-whatsapp-orphans
```

- [ ] **Step 2: Test QR Code generation**

1. Open CRM in browser
2. Go to Integrations page
3. Click "Connect" on WhatsApp
4. Verify QR Code appears within 5 seconds

- [ ] **Step 3: Test connection flow**

1. Scan QR Code with WhatsApp
2. Verify connection succeeds
3. Verify status updates to "Connected"

- [ ] **Step 4: Test cleanup function**

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/cleanup-whatsapp-orphans \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

---

## Task 21: Final Commit with All Changes

- [ ] **Step 1: Create a summary commit if needed**

```bash
git status
# If there are uncommitted changes:
git add -A
git commit -m "fix: update Evolution API URL to 161.97.148.99:8080 and add orphan cleanup"
```

---

## Success Criteria Checklist

- [ ] QR codes appear within 5 seconds of clicking "Connect"
- [ ] WhatsApp connects successfully after scanning QR
- [ ] Disconnected instances are cleaned up within 24 hours
- [ ] No orphan instances remain in Evolution API
- [ ] No duplicate instances per user

---

## Rollback Plan

If issues occur:

1. Revert all URL changes:
```bash
git revert HEAD~21  # Revert all commits from this plan
```

2. Or manually restore old URL in each file:
```
http://161.97.148.99:8080 → https://evolution01.kairozspace.com.br
```

3. Redeploy Edge Functions

4. Disable cron job for cleanup-whatsapp-orphans (if configured)
