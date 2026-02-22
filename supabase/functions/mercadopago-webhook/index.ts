import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MERCADOPAGO-WEBHOOK] ${step}${detailsStr}`);
};

const PLAN_CONFIG: Record<string, { maxCollaborators: number }> = {
  star: { maxCollaborators: 5 },
  pro: { maxCollaborators: 15 },
  elite: { maxCollaborators: 30 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Webhook received");

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");

    // Validate webhook signature
    const WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (WEBHOOK_SECRET) {
      const xSignature = req.headers.get("x-signature") || "";
      const xRequestId = req.headers.get("x-request-id") || "";
      const url = new URL(req.url);
      const dataId = url.searchParams.get("data.id") || "";

      // Parse x-signature: "ts=...,v1=..."
      const parts: Record<string, string> = {};
      xSignature.split(",").forEach(part => {
        const [key, val] = part.trim().split("=", 2);
        if (key && val) parts[key] = val;
      });
      const ts = parts["ts"] || "";
      const v1 = parts["v1"] || "";

      if (ts && v1) {
        // Build manifest: "id:[dataId];request-id:[xRequestId];ts:[ts];"
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(WEBHOOK_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
        const computedHash = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");

        if (computedHash !== v1) {
          logStep("Invalid signature", { expected: computedHash, received: v1 });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }
        logStep("Signature validated successfully");
      } else {
        logStep("No signature parts found, skipping validation");
      }
    } else {
      logStep("WEBHOOK_SECRET not configured, skipping signature validation");
    }

    // Parse the notification
    const body = await req.json();
    logStep("Notification body", body);

    const { type, data } = body;

    if (type === "preapproval") {
      const preapprovalId = data?.id;
      if (!preapprovalId) {
        logStep("No preapproval ID in notification");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Fetch preapproval details from Mercado Pago
      const mpResponse = await fetch(
        `https://api.mercadopago.com/preapproval/${preapprovalId}`,
        {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        }
      );

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        logStep("Error fetching preapproval from MP", { status: mpResponse.status, error: errorText });
        throw new Error(`MP API error: ${mpResponse.status}`);
      }

      const preapproval = await mpResponse.json();
      logStep("Preapproval details", {
        id: preapproval.id,
        status: preapproval.status,
        payer_email: preapproval.payer_email,
        reason: preapproval.reason,
        auto_recurring: preapproval.auto_recurring,
      });

      // Extract plan_id from external_reference or reason
      const externalRef = preapproval.external_reference || "";
      // Format: "user_id|plan_id|extra_collaborators"
      const refParts = externalRef.split("|");
      const userId = refParts[0] || null;
      const planId = refParts[1] || "star";
      const extraCollaborators = parseInt(refParts[2] || "0", 10);

      // Map MP status to our status
      let status = "pending";
      if (preapproval.status === "authorized") status = "authorized";
      else if (preapproval.status === "paused") status = "paused";
      else if (preapproval.status === "cancelled") status = "cancelled";
      else if (preapproval.status === "pending") status = "pending";

      // Get organization_id for this user
      let organizationId: string | null = null;
      if (userId) {
        const { data: orgData } = await supabaseAdmin
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("role", "owner")
          .eq("is_active", true)
          .limit(1)
          .single();
        
        if (orgData) {
          organizationId = orgData.organization_id;
        }
      }

      const amount = preapproval.auto_recurring?.transaction_amount || 0;

      // Upsert subscription
      const { error: upsertError } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            organization_id: organizationId,
            mp_preapproval_id: preapprovalId,
            mp_payer_email: preapproval.payer_email,
            plan_id: planId,
            status: status,
            amount: amount,
            extra_collaborators: extraCollaborators,
            start_date: preapproval.date_created,
            end_date: preapproval.end_date || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "mp_preapproval_id" }
        );

      if (upsertError) {
        logStep("Error upserting subscription", { error: upsertError.message });
        throw upsertError;
      }

      logStep("Subscription upserted successfully", { userId, planId, status });
    } else if (type === "payment") {
      // For payment notifications, we can also update status
      logStep("Payment notification received", { dataId: data?.id });
      // Payments are handled implicitly through preapproval status updates
    } else {
      logStep("Unhandled notification type", { type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Always return 200 to MP to avoid retries on our errors
    return new Response(JSON.stringify({ received: true, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
