import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface UpdateMemberRequest {
  memberId: string;
  name?: string;
  email?: string;
  newPassword?: string;
  role?: "owner" | "admin" | "member";
  is_active?: boolean;
  custom_role_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to get user info
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentUserId = user.id;

    // Parse body
    const body: UpdateMemberRequest = await req.json();
    const { memberId, name, email, newPassword, role, is_active, custom_role_id } = body;

    if (!memberId) {
      return new Response(JSON.stringify({ error: "ID do membro é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user's role and organization
    const { data: currentUserMember, error: currentUserError } = await adminClient
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (currentUserError || !currentUserMember) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado na organização" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permissions - only owner or admin can edit
    if (currentUserMember.role !== "owner" && currentUserMember.role !== "admin") {
      return new Response(JSON.stringify({ error: "Apenas proprietários e administradores podem editar colaboradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target member
    const { data: targetMember, error: targetMemberError } = await adminClient
      .from("organization_members")
      .select("id, user_id, organization_id, role, is_active")
      .eq("id", memberId)
      .maybeSingle();

    if (targetMemberError || !targetMember) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure same organization
    if (targetMember.organization_id !== currentUserMember.organization_id) {
      return new Response(JSON.stringify({ error: "Membro não pertence à sua organização" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deactivation
    if (targetMember.user_id === currentUserId && is_active === false) {
      return new Response(JSON.stringify({ error: "Você não pode desativar sua própria conta" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admins cannot edit owners
    if (currentUserMember.role === "admin" && targetMember.role === "owner") {
      return new Response(JSON.stringify({ error: "Administradores não podem editar proprietários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only owners can change roles
    if (role !== undefined && currentUserMember.role !== "owner") {
      return new Response(JSON.stringify({ error: "Apenas proprietários podem alterar cargos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update organization_members table (role, is_active, custom_role_id, and display_name for users without user_id)
    const memberUpdates: Record<string, unknown> = {};
    if (role !== undefined) memberUpdates.role = role;
    if (is_active !== undefined) memberUpdates.is_active = is_active;
    if (custom_role_id !== undefined) memberUpdates.custom_role_id = custom_role_id;
    
    // If no user_id, store name in display_name column
    if (!targetMember.user_id && name !== undefined) {
      memberUpdates.display_name = name;
    }

    if (Object.keys(memberUpdates).length > 0) {
      const { error: memberUpdateError } = await adminClient
        .from("organization_members")
        .update(memberUpdates)
        .eq("id", memberId);

      if (memberUpdateError) {
        console.error("Error updating member:", memberUpdateError);
        return new Response(JSON.stringify({ error: "Erro ao atualizar membro" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If there's a user_id, update auth and profile
    if (targetMember.user_id) {
      // Update profile name - use upsert to handle missing profiles
      if (name !== undefined) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .upsert({ 
            user_id: targetMember.user_id, 
            full_name: name 
          }, { 
            onConflict: 'user_id' 
          });

        if (profileError) {
          console.error("Error updating profile:", profileError);
          // Don't fail the whole operation, just log
        }
      }

      // Update auth user (email and/or password)
      const authUpdates: Record<string, unknown> = {};
      if (email !== undefined) authUpdates.email = email;
      if (newPassword && newPassword.length >= 6) authUpdates.password = newPassword;

      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await adminClient.auth.admin.updateUserById(
          targetMember.user_id,
          authUpdates
        );

        if (authError) {
          console.error("Error updating auth user:", authError);
          return new Response(JSON.stringify({ error: `Erro ao atualizar credenciais: ${authError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Colaborador atualizado com sucesso" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in update-organization-member:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
