/**
 * Edge Function: admin-generate-temp-password
 *
 * Gera uma senha temporária para um usuário e envia por email.
 * Requer: x-admin-token válido (mesmo sistema do admin-panel-rpc).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

function generateSecurePassword(length = 12): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%&*";
  const allChars = uppercase + lowercase + numbers + symbols;

  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const errorResp = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Validar token admin
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken) return errorResp("Token admin ausente", 401);

    const { data: isValid, error: tokenError } = await adminClient.rpc(
      "validate_admin_token",
      { p_token: adminToken }
    );
    if (tokenError || !isValid) return errorResp("Token admin inválido ou expirado", 401);

    const { userId, userEmail, customMessage } = await req.json();

    if (!userId || !userEmail) return errorResp("userId e userEmail são obrigatórios");

    const tempPassword = generateSecurePassword(12);

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    );
    if (updateError) throw new Error(`Falha ao atualizar senha: ${updateError.message}`);

    // Enviar email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "https://kairozcrm.com.br";

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "CRM Kairoz <noreply@kairozspace.com.br>",
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
              <a href="${siteUrl}/auth"
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
      return new Response(
        JSON.stringify({
          success: true,
          tempPassword,
          message: "Senha gerada, mas falha ao enviar email. Copie a senha abaixo:",
          emailError: emailError.message || "Erro desconhecido",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        tempPassword,
        message: "Senha temporária gerada e enviada por email com sucesso",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[admin-generate-temp-password] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar senha temporária" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
