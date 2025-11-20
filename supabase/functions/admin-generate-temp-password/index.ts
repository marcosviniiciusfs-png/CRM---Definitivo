import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TempPasswordRequest {
  userId: string;
  userEmail: string;
  customMessage?: string;
}

// Gerar senha aleatória segura
function generateSecurePassword(length: number = 12): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%&*";
  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = "";
  // Garantir pelo menos um de cada tipo
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Preencher o resto aleatoriamente
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Embaralhar a senha
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[admin-generate-temp-password] Iniciando processamento");

    // Criar cliente Supabase com service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Token de autorização ausente");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !adminUser) {
      throw new Error("Não autorizado");
    }

    // Verificar se é super admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUser.id)
      .eq("role", "super_admin")
      .single();

    if (roleError || !roleData) {
      throw new Error("Acesso negado: apenas super admins podem gerar senhas temporárias");
    }

    const { userId, userEmail, customMessage }: TempPasswordRequest = await req.json();

    console.log("[admin-generate-temp-password] Gerando senha temporária para:", userEmail);

    // Gerar senha temporária
    const tempPassword = generateSecurePassword(12);

    // Atualizar senha do usuário usando admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    );

    if (updateError) {
      console.error("[admin-generate-temp-password] Erro ao atualizar senha:", updateError);
      throw new Error(`Falha ao atualizar senha: ${updateError.message}`);
    }

    console.log("[admin-generate-temp-password] Senha atualizada com sucesso");

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
        subject: "Senha Temporária - Gerada pelo Administrador",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Senha Temporária Gerada</h2>
            <p>Olá,</p>
            <p>O administrador do sistema gerou uma senha temporária para sua conta.</p>
            ${customMessage ? `
              <div style="background-color: #F3F4F6; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #374151; font-style: italic;">
                  <strong>Mensagem do administrador:</strong><br>
                  ${customMessage.replace(/\n/g, '<br>')}
                </p>
              </div>
            ` : ''}
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold;">Sua senha temporária:</p>
              <p style="font-family: 'Courier New', monospace; font-size: 18px; color: #4F46E5; margin: 0; word-break: break-all;">
                ${tempPassword}
              </p>
            </div>
            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400E; font-weight: bold;">⚠️ IMPORTANTE:</p>
              <p style="margin: 5px 0 0 0; color: #92400E;">
                Por segurança, você DEVE trocar esta senha no seu primeiro login. 
                Não compartilhe esta senha com ninguém.
              </p>
            </div>
            <p>Para fazer login:</p>
            <ol style="line-height: 1.8;">
              <li>Acesse o sistema</li>
              <li>Use seu email e a senha temporária acima</li>
              <li>Você será solicitado a criar uma nova senha</li>
            </ol>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/auth" 
                 style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Acessar o Sistema
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              Se você não solicitou esta senha, entre em contato com o administrador imediatamente.
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.json();
      console.error("[admin-generate-temp-password] Erro ao enviar email:", emailError);
      // Ainda retornar sucesso, mas avisar que o email falhou
      return new Response(
        JSON.stringify({ 
          success: true,
          tempPassword: tempPassword,
          message: "Senha gerada, mas falha ao enviar email. Copie a senha abaixo:",
          emailError: emailError.message || "Erro desconhecido"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[admin-generate-temp-password] Email enviado com sucesso");

    return new Response(
      JSON.stringify({ 
        success: true,
        tempPassword: tempPassword,
        message: "Senha temporária gerada e enviada por email com sucesso" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[admin-generate-temp-password] Erro:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao gerar senha temporária" 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
