import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  userId: string;
  userEmail: string;
  customMessage?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[admin-reset-password] Iniciando processamento");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verificar autenticação usando o token do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Token de autorização ausente");
    }

    // Criar um client com o token do usuário para validar a sessão
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: adminUser }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !adminUser) {
      console.error("[admin-reset-password] Erro de autenticação:", authError);
      throw new Error("Não autorizado");
    }

    console.log("[admin-reset-password] Usuário autenticado:", adminUser.id);

    // Criar cliente admin para operações privilegiadas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar se é super admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUser.id)
      .eq("role", "super_admin")
      .single();

    if (roleError || !roleData) {
      console.error("[admin-reset-password] Usuário não é super admin:", roleError);
      throw new Error("Acesso negado: apenas super admins podem resetar senhas");
    }

    const { userId, userEmail, customMessage }: ResetPasswordRequest = await req.json();

    console.log("[admin-reset-password] Gerando link de reset para:", userEmail);

    // Gerar link de reset usando o admin API
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: userEmail,
      options: {
        redirectTo: `${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/auth`,
      }
    });

    if (resetError || !resetData) {
      console.error("[admin-reset-password] Erro ao gerar link:", resetError);
      throw new Error(`Falha ao gerar link de reset: ${resetError?.message || "erro desconhecido"}`);
    }

    console.log("[admin-reset-password] Link gerado com sucesso");

    // Enviar email usando a API do Resend diretamente
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "CRM <onboarding@resend.dev>",
        to: [userEmail],
        subject: "Redefinição de Senha - Solicitado pelo Administrador",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Redefinição de Senha</h2>
            <p>Olá,</p>
            <p>O administrador do sistema solicitou a redefinição da sua senha.</p>
            ${customMessage ? `
              <div style="background-color: #F3F4F6; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #374151; font-style: italic;">
                  <strong>Mensagem do administrador:</strong><br>
                  ${customMessage.replace(/\n/g, '<br>')}
                </p>
              </div>
            ` : ''}
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetData.properties.action_link}" 
                 style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Redefinir Senha
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              Este link expira em 1 hora. Se você não solicitou esta redefinição, ignore este email.
            </p>
            <p style="color: #666; font-size: 14px;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${resetData.properties.action_link}" style="color: #4F46E5; word-break: break-all;">
                ${resetData.properties.action_link}
              </a>
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.json();
      console.error("[admin-reset-password] Erro ao enviar email:", emailError);
      throw new Error(`Falha ao enviar email: ${emailError.message || 'erro desconhecido'}`);
    }

    console.log("[admin-reset-password] Email enviado com sucesso");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Email de redefinição enviado com sucesso" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[admin-reset-password] Erro:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao enviar email de redefinição" 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
