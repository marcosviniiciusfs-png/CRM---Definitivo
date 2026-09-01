import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  getEvolutionApiKey,
  getEvolutionApiUrl,
} from "../_shared/evolution-config.ts";
import { isInternalServiceRoleRequest } from "../_shared/organization-auth.ts";

const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function isCronSecretRequest(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (!expected) return false;

  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const [scheme, bearerSecret, extra] = authorization.split(/\s+/);
  const legacyBearerSecret =
    scheme?.toLowerCase() === "bearer" && bearerSecret && !extra
      ? bearerSecret
      : "";

  return (headerSecret !== "" && constantTimeEqual(headerSecret, expected)) ||
    (legacyBearerSecret !== "" &&
      constantTimeEqual(legacyBearerSecret, expected));
}

interface CleanupResult {
  deletedFromApi: string[];
  deletedFromDb: string[];
  duplicatesRemoved: string[];
  errors: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const result: CleanupResult = {
    deletedFromApi: [],
    deletedFromDb: [],
    duplicatesRemoved: [],
    errors: [],
  };

  try {
    console.log("🧹 Starting WhatsApp orphan cleanup...");

    // This function mutates every organization's instances. A regular user JWT
    // must never authorize it, regardless of that user's role in the CRM.
    if (!isCronSecretRequest(req) && !isInternalServiceRoleRequest(req)) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createSupabaseAdmin();

    // Get Evolution API credentials
    const baseUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    // ========================================
    // STEP 1: Fetch all instances from Evolution API
    // ========================================
    console.log("📡 Fetching instances from Evolution API...");
    const fetchResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: "GET",
      headers: {
        "apikey": evolutionApiKey,
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(
        `Failed to fetch instances from Evolution API: ${fetchResponse.status}`,
      );
    }

    const apiInstances = await fetchResponse.json();
    const apiInstanceNames = new Set(
      Array.isArray(apiInstances)
        ? apiInstances.map((inst: any) => inst.instance?.instanceName).filter(
          Boolean,
        )
        : [],
    );

    console.log(`📋 Found ${apiInstanceNames.size} instances in Evolution API`);

    // ========================================
    // STEP 2: Fetch all instances from database
    // ========================================
    console.log("📡 Fetching instances from database...");
    const { data: dbInstances, error: dbError } = await supabase
      .from("whatsapp_instances")
      .select("*");

    if (dbError) {
      throw dbError;
    }

    console.log(`📋 Found ${dbInstances?.length || 0} instances in database`);

    // ========================================
    // STEP 3: Find and delete orphans in Evolution API (not in DB)
    // ========================================
    console.log("🔍 Finding orphans in Evolution API...");
    const crmInstanceNames = new Set(
      dbInstances?.map((inst) => inst.instance_name) || [],
    );

    for (const apiInstanceName of apiInstanceNames) {
      // Only cleanup CRM-related instances (start with crm-)
      if (!apiInstanceName.startsWith("crm-")) {
        continue;
      }

      if (!crmInstanceNames.has(apiInstanceName)) {
        console.log(
          `🗑️ Deleting orphan from Evolution API: ${apiInstanceName}`,
        );
        try {
          // Logout first
          await fetch(`${baseUrl}/instance/logout/${apiInstanceName}`, {
            method: "DELETE",
            headers: { "apikey": evolutionApiKey },
          });

          // Delete
          const deleteResponse = await fetch(
            `${baseUrl}/instance/delete/${apiInstanceName}`,
            {
              method: "DELETE",
              headers: { "apikey": evolutionApiKey },
            },
          );

          if (deleteResponse.ok || deleteResponse.status === 404) {
            result.deletedFromApi.push(apiInstanceName);
            console.log(`✅ Deleted orphan: ${apiInstanceName}`);
          } else {
            result.errors.push(
              `Failed to delete ${apiInstanceName}: ${deleteResponse.status}`,
            );
          }
        } catch (e) {
          result.errors.push(`Error deleting ${apiInstanceName}: ${e}`);
        }
      }
    }

    // ========================================
    // STEP 4: Find and delete disconnected instances (>24h old)
    // ========================================
    console.log("🔍 Finding disconnected instances...");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString();

    const disconnectedInstances = dbInstances?.filter(
      (inst) =>
        inst.status === "DISCONNECTED" && inst.updated_at < twentyFourHoursAgo,
    ) || [];

    for (const inst of disconnectedInstances) {
      console.log(`🗑️ Deleting disconnected instance: ${inst.instance_name}`);
      try {
        // Delete from Evolution API if exists
        if (apiInstanceNames.has(inst.instance_name)) {
          await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
            method: "DELETE",
            headers: { "apikey": evolutionApiKey },
          });

          await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
            method: "DELETE",
            headers: { "apikey": evolutionApiKey },
          });
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from("whatsapp_instances")
          .delete()
          .eq("id", inst.id);

        if (deleteError) {
          result.errors.push(
            `Failed to delete ${inst.instance_name} from DB: ${deleteError.message}`,
          );
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
    console.log("🔍 Finding duplicate instances...");
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
      instances.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Keep the most recent, delete the rest (only if status is not CONNECTED)
      const toDelete = instances.slice(1).filter((inst) =>
        inst.status !== "CONNECTED"
      );

      for (const inst of toDelete) {
        console.log(`🗑️ Deleting duplicate: ${inst.instance_name}`);
        try {
          // Delete from Evolution API if exists
          if (apiInstanceNames.has(inst.instance_name)) {
            await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
              method: "DELETE",
              headers: { "apikey": evolutionApiKey },
            });

            await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
              method: "DELETE",
              headers: { "apikey": evolutionApiKey },
            });
          }

          // Delete from database
          const { error: deleteError } = await supabase
            .from("whatsapp_instances")
            .delete()
            .eq("id", inst.id);

          if (deleteError) {
            result.errors.push(
              `Failed to delete duplicate ${inst.instance_name}: ${deleteError.message}`,
            );
          } else {
            result.duplicatesRemoved.push(inst.instance_name);
            console.log(`✅ Deleted duplicate: ${inst.instance_name}`);
          }
        } catch (e) {
          result.errors.push(
            `Error deleting duplicate ${inst.instance_name}: ${e}`,
          );
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log("🧹 Cleanup complete!");
    console.log(`  - Deleted from API: ${result.deletedFromApi.length}`);
    console.log(`  - Deleted from DB: ${result.deletedFromDb.length}`);
    console.log(`  - Duplicates removed: ${result.duplicatesRemoved.length}`);
    console.log(`  - Errors: ${result.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cleanup completed",
        result: {
          deletedFromApi: result.deletedFromApi.length,
          deletedFromDb: result.deletedFromDb.length,
          duplicatesRemoved: result.duplicatesRemoved.length,
          errors: result.errors.length,
          details: result,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("❌ Cleanup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
