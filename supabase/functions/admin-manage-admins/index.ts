import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    // Check super_admin role using service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", callerId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(
        JSON.stringify({ error: "Acesso negado: apenas super admins" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // GET - list all super_admins
    if (req.method === "GET") {
      const { data: admins, error } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "super_admin");

      if (error) throw error;

      // Get emails for each admin
      const adminDetails = [];
      for (const admin of admins || []) {
        const {
          data: { user },
        } = await adminClient.auth.admin.getUserById(admin.user_id);
        adminDetails.push({
          user_id: admin.user_id,
          email: user?.email || "unknown",
          created_at: user?.created_at,
        });
      }

      return new Response(JSON.stringify({ admins: adminDetails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - create or delete admin
    if (req.method === "POST") {
      const { action, email, password, userId } = await req.json();

      if (action === "create") {
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: "Email e senha são obrigatórios" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (password.length < 8) {
          return new Response(
            JSON.stringify({
              error: "A senha deve ter pelo menos 8 caracteres",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Check if user already exists
        const { data: existingUsers } =
          await adminClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(
          (u) => u.email === email
        );

        let targetUserId: string;

        if (existingUser) {
          targetUserId = existingUser.id;
        } else {
          // Create user
          const { data: newUser, error: createError } =
            await adminClient.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
          if (createError) throw createError;
          targetUserId = newUser.user.id;
        }

        // Insert super_admin role
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: targetUserId, role: "super_admin" });

        if (roleError && roleError.code !== "23505") {
          // 23505 = unique violation (already has role)
          throw roleError;
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Admin criado com sucesso",
            user_id: targetUserId,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (action === "delete") {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: "userId é obrigatório" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Prevent self-removal
        if (userId === callerId) {
          return new Response(
            JSON.stringify({
              error: "Você não pode remover a si mesmo da lista de admins",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const { error: deleteError } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "super_admin");

        if (deleteError) throw deleteError;

        return new Response(
          JSON.stringify({
            success: true,
            message: "Admin removido com sucesso",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[admin-manage-admins] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
