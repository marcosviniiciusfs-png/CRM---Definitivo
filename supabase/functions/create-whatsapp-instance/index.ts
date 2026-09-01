import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabasePublicUrl } from "../_shared/supabase-urls.ts";
import {
  createSupabaseAdmin,
  getEvolutionApiKey,
  getEvolutionApiUrl,
  normalizeUrl,
} from "../_shared/evolution-config.ts";

const CHANNEL_COLORS = ["#25D366", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

interface CreateInstanceRequest {
  userId: string;
  accepts_leads?: boolean;
}

async function getOrCreateOrganizationId(
  // Tipagem propositalmente frouxa: Edge Functions não usam os tipos gerados do banco
  // e o inference pode virar `never` dependendo dos generics do createClient.
  supabase: any,
  user: { id: string; email?: string | null },
): Promise<string | null> {
  // PREVENÇÃO DE DUPLICATAS: Primeiro verificar se já é OWNER de alguma organização.
  // CRITICO: usar order + limit(1) e NAO maybeSingle(). Se o user tiver 2+ orgs como
  // owner (caso ja documentado de duplicacao), maybeSingle() retorna null sem erro
  // util e o codigo cai no fallback que CRIA UMA NOVA ORG, multiplicando o problema.
  // Pegamos sempre a mais antiga para dar consistencia: o canal sempre vai para a
  // mesma org, evitando que conexoes consecutivas espalhem em orgs diferentes.
  const { data: ownerRows, error: ownerError } = await supabase
    .from("organization_members")
    .select("organization_id, created_at")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ownerError) {
    throw new Error(
      `Could not validate organization ownership: ${ownerError.message}`,
    );
  }

  const existingOwner = (ownerRows && ownerRows.length > 0)
    ? ownerRows[0]
    : null;

  // Se já for owner, retornar a organização existente (NÃO criar nova)
  if (existingOwner?.organization_id) {
    console.log(
      "✅ User already owns an organization:",
      existingOwner.organization_id,
    );
    return existingOwner.organization_id;
  }

  // 1) Happy path: membership already linked by user_id (como membro).
  // Mesmo cuidado que acima — usar order + limit(1) ao inves de maybeSingle().
  const { data: memberRows, error: memberByUserError } = await supabase
    .from("organization_members")
    .select("id, organization_id, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (memberByUserError) {
    throw new Error(
      `Could not validate organization membership: ${memberByUserError.message}`,
    );
  }

  const memberByUser = (memberRows && memberRows.length > 0)
    ? memberRows[0]
    : null;

  if (memberByUser?.organization_id) {
    return memberByUser.organization_id;
  }

  // 2) Fallback: user was invited (email match) but membership not linked yet
  const email = user.email?.toLowerCase().trim();
  if (email) {
    const { data: inviteByEmail, error: inviteByEmailError } = await supabase
      .from("organization_members")
      .select("id, organization_id")
      .eq("email", email)
      .is("user_id", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (inviteByEmailError) {
      throw new Error(
        `Could not validate organization invitation: ${inviteByEmailError.message}`,
      );
    }

    if (inviteByEmail?.organization_id) {
      const { error: linkError } = await supabase
        .from("organization_members")
        .update({ user_id: user.id })
        .eq("id", inviteByEmail.id);

      if (linkError) {
        throw new Error(
          `Could not activate organization invitation: ${linkError.message}`,
        );
      }

      console.log("✅ Linked invited organization membership to user_id");
      return inviteByEmail.organization_id;
    }
  }

  // A disabled membership/invitation must not fall through into the automatic
  // organization-creation path, which would effectively bypass deactivation.
  const { count: existingMembershipCount, error: existingMembershipError } =
    await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

  if (existingMembershipError) {
    throw new Error(
      `Could not validate existing memberships: ${existingMembershipError.message}`,
    );
  }
  if ((existingMembershipCount ?? 0) > 0) {
    throw new Error("Active organization membership is required");
  }

  if (email) {
    const { count: existingInviteCount, error: existingInviteError } =
      await supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("email", email)
        .is("user_id", null);

    if (existingInviteError) {
      throw new Error(
        `Could not validate organization invitations: ${existingInviteError.message}`,
      );
    }
    if ((existingInviteCount ?? 0) > 0) {
      throw new Error("Active organization membership is required");
    }
  }

  // 3) Last resort: create a new organization for this user
  // NOTA: Isso só acontece se o usuário NÃO for owner de nenhuma org
  console.warn(
    "⚠️ User has no organization and is not an owner. Creating a new organization...",
  );

  const orgName = email
    ? `${email}'s Organization`
    : `Organização ${user.id.substring(0, 8)}`;
  const { data: newOrg, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (orgError || !newOrg?.id) {
    console.error("❌ Failed to create organization:", orgError);
    throw new Error(
      "Could not create an organization for the authenticated user",
    );
  }

  const { error: memberInsertError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: newOrg.id,
      user_id: user.id,
      role: "owner",
      email: email ?? null,
      is_active: true,
    });

  if (memberInsertError) {
    await supabase.from("organizations").delete().eq("id", newOrg.id);
    throw new Error(
      `Could not create active organization membership: ${memberInsertError.message}`,
    );
  }

  console.log("✅ Organization created and user assigned as owner:", newOrg.id);
  return newOrg.id;
}

// Clean Base64 string
function cleanBase64(rawBase64: string): string {
  // CRÍTICO: Remover aspas duplas literais no início e fim
  let cleaned = rawBase64;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remover prefixo data:image se existir
  cleaned = cleaned.replace(/^data:image\/[a-z]+;base64,/i, "");

  // Remover espaços, aspas e caracteres inválidos
  cleaned = cleaned.replace(/\s/g, "");
  cleaned = cleaned.replace(/['"]/g, "");
  cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, "");

  return cleaned;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createSupabaseAdmin();

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      throw new Error("Invalid authorization token");
    }

    console.log("Creating instance for user:", user.id);

    // Get Evolution API credentials: try env vars first, fallback to database config
    let evolutionApiUrl: string | undefined;
    let evolutionApiKey: string | undefined;

    // 1) Try environment variables
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch {
      console.log(
        "⚠️ Evolution API env vars not configured, trying database fallback...",
      );
    }

    // 2) Fallback: try database config table (app_config)
    if (!evolutionApiUrl || !evolutionApiKey) {
      console.log(
        "🔍 Checking app_config table for Evolution API credentials...",
      );

      const { data: config, error: configError } = await supabase
        .from("app_config")
        .select("config_key, config_value")
        .in("config_key", ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"])
        .limit(2);

      if (configError) {
        console.error("❌ Error fetching config from database:", configError);
      } else if (config && config.length > 0) {
        config.forEach((item) => {
          const value = item.config_value?.trim();
          if (value && value.length > 0) {
            if (item.config_key === "EVOLUTION_API_URL") {
              evolutionApiUrl = value;
            }
            if (item.config_key === "EVOLUTION_API_KEY") {
              evolutionApiKey = value;
            }
          }
        });

        if (evolutionApiUrl && evolutionApiKey) {
          console.log("✅ Evolution API credentials loaded from database");
        } else {
          console.warn(
            "⚠️ Evolution API credentials found in database but are empty",
          );
        }
      }
    }

    // Final validation
    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error(
        "❌ Missing credentials - URL:",
        !!evolutionApiUrl,
        "Key:",
        !!evolutionApiKey,
      );
      throw new Error(
        "Evolution API credentials not configured. Please configure them in Settings > Evolution API Configuration",
      );
    }
    const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new Error(
        "EVOLUTION_WEBHOOK_SECRET is required before creating an instance",
      );
    }

    // Normalize URL using shared function
    const baseUrl = normalizeUrl(evolutionApiUrl);

    // Webhook URLs
    const supabasePublicUrl = getSupabasePublicUrl();
    const qrWebhookUrl =
      `${supabasePublicUrl}/functions/v1/whatsapp-qr-webhook`;
    const messageWebhookUrl =
      `${supabasePublicUrl}/functions/v1/whatsapp-message-webhook`;

    console.log("Using Evolution API URL:", baseUrl);
    console.log("QR Webhook:", qrWebhookUrl);
    console.log("Message Webhook:", messageWebhookUrl);

    // ========================================
    // STEP 1: CLEANUP OLD INSTANCES (NON-BLOCKING)
    // ========================================
    // OTIMIZAÇÃO: Executar limpeza de forma não-bloqueante
    // A limpeza será feita em background enquanto criamos a nova instância
    console.log("🧹 Agendando limpeza de instâncias antigas (non-blocking)...");

    // Capturar dados necessários para cleanup antes de prosseguir
    const cleanupData = {
      userId: user.id,
      baseUrl,
      evolutionApiKey,
    };

    // Função de limpeza que será executada em background
    const performCleanup = async () => {
      try {
        // Multi-channel mode: only clean up STALE instances (CREATING/WAITING_QR/DISCONNECTED).
        // CONNECTED instances belong to other channels owned by the user and MUST be preserved —
        // wiping them would break the multi-WhatsApp feature.
        const { data: dbInstances, error: dbFetchError } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("user_id", cleanupData.userId)
          .neq("status", "CONNECTED");

        if (dbFetchError) {
          console.error(
            "❌ [CLEANUP] Error fetching instances from database:",
            dbFetchError,
          );
          return;
        }

        console.log(
          `📋 [CLEANUP] Found ${
            dbInstances?.length || 0
          } stale instances to clean up (CONNECTED preserved)`,
        );

        // Fetch all instances from Evolution API
        const fetchInstancesResponse = await fetch(
          `${cleanupData.baseUrl}/instance/fetchInstances`,
          {
            method: "GET",
            headers: {
              "apikey": cleanupData.evolutionApiKey,
            },
          },
        );

        if (!fetchInstancesResponse.ok) {
          console.warn(
            "⚠️ [CLEANUP] Could not fetch instances:",
            fetchInstancesResponse.status,
          );
          return;
        }

        const allInstances = await fetchInstancesResponse.json();
        const dbInstanceNames = dbInstances?.map((inst) =>
          inst.instance_name
        ) || [];

        // Match only by DB instance_name (already filtered to non-CONNECTED).
        // The previous prefix-based match would also catch the user's own CONNECTED
        // channels in the Evolution API, breaking multi-channel.
        const userInstances = Array.isArray(allInstances)
          ? allInstances.filter((inst: any) => {
            const instanceName = inst.instance?.instanceName;
            return instanceName && dbInstanceNames.includes(instanceName);
          })
          : [];

        console.log(
          `🔍 [CLEANUP] Found ${userInstances.length} stale instances to clean up`,
        );

        // Delete each old instance (don't block on these)
        for (const oldInstance of userInstances) {
          const oldInstanceName = oldInstance.instance?.instanceName;
          if (!oldInstanceName) continue;

          try {
            // Logout first
            await fetch(
              `${cleanupData.baseUrl}/instance/logout/${oldInstanceName}`,
              {
                method: "DELETE",
                headers: { "apikey": cleanupData.evolutionApiKey },
              },
            );

            // Delete instance
            await fetch(
              `${cleanupData.baseUrl}/instance/delete/${oldInstanceName}`,
              {
                method: "DELETE",
                headers: { "apikey": cleanupData.evolutionApiKey },
              },
            );

            console.log(`✅ [CLEANUP] Deleted: ${oldInstanceName}`);
          } catch (e) {
            console.warn(`⚠️ [CLEANUP] Error cleaning ${oldInstanceName}:`, e);
          }
        }

        // CORREÇÃO: Deletar apenas as instâncias antigas capturadas NO INÍCIO do cleanup.
        // Antes: .delete().eq('user_id', ...) apagava QUALQUER instância incluindo a nova
        // criada em paralelo pelo fluxo principal — race condition.
        if (dbInstances && dbInstances.length > 0) {
          const oldInstanceNames = dbInstances.map((inst: any) =>
            inst.instance_name
          ).filter(Boolean);
          if (oldInstanceNames.length > 0) {
            await supabase
              .from("whatsapp_instances")
              .delete()
              .eq("user_id", cleanupData.userId)
              .in("instance_name", oldInstanceNames);
          }
        }

        console.log("✅ [CLEANUP] Background cleanup completed");
      } catch (error) {
        console.error("❌ [CLEANUP] Background cleanup failed:", error);
      }
    };

    // ========================================
    // STEP 2: RESOLVE ORG + VALIDATE CHANNEL LIMIT
    // ========================================
    // Resolve org and enforce the 5-channel cap BEFORE talking to Evolution API,
    // so a hit on the limit doesn't leak an orphan instance on Evolution's side.
    const orgId = await getOrCreateOrganizationId(supabase, {
      id: user.id,
      email: user.email,
    });

    if (!orgId) {
      throw new Error("Active organization membership is required");
    }
    const { data: activeMembership, error: activeMembershipError } =
      await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

    if (activeMembershipError || !activeMembership) {
      throw new Error("Active organization membership is required");
    }
    console.log("✅ Active organization membership validated:", orgId);

    // Start cleanup only after authorization is fully established.
    performCleanup().catch((err) =>
      console.error("❌ [CLEANUP] Error in background cleanup:", err)
    );

    let channelColor = CHANNEL_COLORS[0];
    const { count, error: countError } = await supabase
      .from("whatsapp_instances")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);

    if (countError) {
      throw new Error(
        `Could not validate WhatsApp channel limit: ${countError.message}`,
      );
    } else if (count && count >= 5) {
      throw new Error(
        "Limite de 5 canais WhatsApp atingido. Desconecte um canal para conectar um novo.",
      );
    }

    channelColor = CHANNEL_COLORS[(count || 0) % CHANNEL_COLORS.length];

    // ========================================
    // STEP 3: CREATE NEW INSTANCE
    // ========================================
    // Generate unique instance name using user ID and timestamp
    const instanceName = `crm-${user.id.substring(0, 8)}-${Date.now()}`;
    console.log("Creating fresh instance with name:", instanceName);

    // Extract channel_name from request body
    let body: {
      userId?: string;
      channel_name?: string;
      accepts_leads?: boolean;
    } = {};
    try {
      body = await req.clone().json();
    } catch {}
    const channelName = body.channel_name?.trim() || `Canal ${Date.now()}`;
    const acceptsLeads = body.accepts_leads !== false;

    // Create instance in Evolution API (WITHOUT webhook - will be configured separately)
    const evolutionResponse = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName: instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error("Evolution API error:", errorText);
      throw new Error(
        `Evolution API error: ${evolutionResponse.status} - ${errorText}`,
      );
    }

    const evolutionData = await evolutionResponse.json();
    console.log("Evolution API response:", evolutionData);

    // ========================================
    // PRIORITY: IMMEDIATE QR CODE EXTRACTION
    // ========================================
    // OTIMIZAÇÃO: Extrair QR ANTES de qualquer outra operação
    // Isso garante que o QR code seja retornado o mais rápido possível

    let qrCodeBase64: string | null = null;

    if (evolutionData?.qrcode) {
      const qrData = evolutionData.qrcode;
      console.log("🔍 QR Data structure:", JSON.stringify(qrData, null, 2));

      // Priority extraction: base64 > qrcode > code
      const rawQR = qrData.base64 || qrData.qrcode || qrData.code;

      if (typeof rawQR === "string" && rawQR.length > 0) {
        // CRITICAL: Rigorously clean Base64 string - remove prefix, whitespace, quotes, invalid chars
        qrCodeBase64 = cleanBase64(rawQR);
        console.log(
          "✅ QR Code extracted IMMEDIATELY - Length:",
          qrCodeBase64.length,
        );
        console.log(
          "📦 QR Code preview:",
          qrCodeBase64.substring(0, 100) + "...",
        );
      } else {
        console.warn(
          "⚠️ QR Code found but invalid format:",
          typeof rawQR,
          rawQR?.substring?.(0, 50),
        );
      }
    } else {
      console.warn("⚠️ No qrcode field in Evolution API response");
    }

    // ========================================
    // STEP 4: PARALLEL OPERATIONS (NON-BLOCKING)
    // ========================================
    // OTIMIZAÇÃO: Executar webhook e presença em PARALELO
    // Isso economiza vários segundos de latência

    console.log("⚡ Executando operações paralelas (webhook, presença)...");

    // Configurar webhook é obrigatório: uma instância sem callback autenticado
    // aparenta sucesso, mas perde todas as mensagens recebidas.
    const configureWebhook = async () => {
      const webhookConfig = {
        webhook: {
          enabled: true,
          url: messageWebhookUrl,
          webhook_by_events: true,
          webhook_base64: false,
          events: [
            "QRCODE_UPDATED",
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "SEND_MESSAGE",
          ],
          // PRESENCE_UPDATE removido: a versao da Evolution API em uso
          // rejeita esse evento na config (o webhook inteiro nao registra),
          // fazendo a instancia nao receber NENHUMA mensagem. O handler
          // do evento foi mantido em whatsapp-message-webhook caso a
          // Evolution suporte futuramente.
          headers: {
            "x-api-key": webhookSecret,
          },
        },
      };

      const webhookResponse = await fetch(
        `${baseUrl}/webhook/set/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": evolutionApiKey!,
          },
          body: JSON.stringify(webhookConfig),
        },
      );

      if (!webhookResponse.ok) {
        const webhookError = await webhookResponse.text();
        throw new Error(
          `Evolution webhook configuration failed (${webhookResponse.status}): ${
            webhookError.slice(0, 500)
          }`,
        );
      }

      await webhookResponse.text().catch(() => "");
      console.log("✅ Webhook configured successfully");
    };

    // Definir presença (não-bloqueante)
    const setPresence = async () => {
      const presenceResponse = await fetch(
        `${baseUrl}/instance/setPresence/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": evolutionApiKey!,
          },
          body: JSON.stringify({ presence: "unavailable" }),
        },
      );

      if (presenceResponse.ok) {
        console.log("✅ Presença definida como unavailable");
      } else {
        console.warn("⚠️ Falha ao definir presença:", presenceResponse.status);
      }
    };

    try {
      await configureWebhook();
    } catch (webhookError) {
      console.error(
        "❌ Webhook configuration failed; removing unusable instance:",
        webhookError,
      );
      try {
        const deleteResponse = await fetch(
          `${baseUrl}/instance/delete/${instanceName}`,
          {
            method: "DELETE",
            headers: { "apikey": evolutionApiKey! },
          },
        );
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.error(
            "❌ Failed to remove instance after webhook failure:",
            deleteResponse.status,
          );
        }
      } catch (cleanupError) {
        console.error(
          "❌ Exception removing instance after webhook failure:",
          cleanupError,
        );
      }
      throw webhookError;
    }

    // Presence is best-effort and does not affect message delivery.
    await setPresence().catch((error) =>
      console.warn("⚠️ Falha ao definir presença:", error)
    );

    // CRITICAL: Em algumas versoes da Evolution API, criar uma nova instancia
    // tem efeito colateral no webhook das instancias existentes (config global
    // sobrescrita ou outro bug nao-documentado). Sintoma observado: depois de
    // conectar Canal 2, Canal 1 (que estava recebendo mensagens normalmente)
    // parou de receber. Para mitigar, re-configuramos os webhooks de TODAS as
    // outras instancias CONNECTED da mesma org logo apos criar a nova.
    if (orgId) {
      const { data: otherConnected } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("organization_id", orgId)
        .eq("status", "CONNECTED")
        .neq("instance_name", instanceName);

      if (otherConnected && otherConnected.length > 0) {
        console.log(
          `🔄 Reconfigurando webhook de ${otherConnected.length} canal(is) existente(s) da org para evitar regressao...`,
        );
        const reconfigPromises = otherConnected.map(async (inst: any) => {
          try {
            const reconfigUrl = `${baseUrl}/webhook/set/${inst.instance_name}`;
            const resp = await fetch(reconfigUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": evolutionApiKey!,
              },
              body: JSON.stringify({
                webhook: {
                  enabled: true,
                  url: messageWebhookUrl,
                  webhook_by_events: true,
                  webhook_base64: false,
                  events: [
                    "QRCODE_UPDATED",
                    "CONNECTION_UPDATE",
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "SEND_MESSAGE",
                  ],
                  ...(webhookSecret
                    ? { headers: { "x-api-key": webhookSecret } }
                    : {}),
                },
              }),
            });
            if (resp.ok) {
              console.log(`✅ Webhook re-aplicado em ${inst.instance_name}`);
            } else {
              console.warn(
                `⚠️ Falha ao re-aplicar webhook em ${inst.instance_name}: ${resp.status}`,
              );
            }
          } catch (e) {
            console.warn(
              `⚠️ Excecao ao re-aplicar webhook em ${inst.instance_name}:`,
              e,
            );
          }
        });
        await Promise.allSettled(reconfigPromises);
      }
    }

    // ========================================
    // IMMEDIATE DATABASE SAVE
    // ========================================
    // Save to database IMMEDIATELY - no delays, no waiting
    console.log("💾 Saving to database NOW - QR Code present:", !!qrCodeBase64);

    // CRÍTICO: Salvar o QR Code como string pura, não como JSON
    if (orgId && acceptsLeads) {
      await supabase
        .from("whatsapp_instances")
        .update({ accepts_leads: false })
        .eq("organization_id", orgId);
    }

    const { data: instanceData, error: dbError } = await supabase
      .from("whatsapp_instances")
      .insert({
        user_id: user.id,
        organization_id: orgId,
        instance_name: instanceName,
        status: qrCodeBase64 ? "WAITING_QR" : "CREATING",
        webhook_url: qrWebhookUrl,
        qr_code: qrCodeBase64, // String pura, já limpa
        channel_name: channelName,
        channel_color: channelColor,
        accepts_leads: acceptsLeads,
      })
      .select()
      .single();

    if (dbError) {
      console.error("❌ Database error:", dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log("✅ Instance saved to database:", instanceData.id);
    console.log(
      "⏱️ QR Code in DB:",
      !!qrCodeBase64,
      "- Ready for immediate display",
    );

    if (qrCodeBase64) {
      console.log(
        "✅ QR Code captured in initial response - NO POLLING NEEDED",
      );
      console.log("🚀 Returning fresh QR Code immediately");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: qrCodeBase64
          ? "Instance created with QR Code."
          : "Instance created. QR Code will be available shortly.",
        instance: {
          id: instanceData.id,
          instanceName: instanceName,
          status: instanceData.status,
          qrCode: qrCodeBase64,
        },
        evolutionData: evolutionData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("Error in create-whatsapp-instance:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
