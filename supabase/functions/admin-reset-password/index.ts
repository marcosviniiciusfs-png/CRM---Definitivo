/**
 * Edge Function: admin-reset-password
 *
 * Gera um link de redefinição de senha e envia por email.
 * Requer: x-admin-token válido (mesmo sistema do admin-panel-rpc).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

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

    // Gerar link de reset
    const siteUrl = Deno.env.get("SITE_URL") || "https://kairozcrm.com.br";
    const { data: resetData, error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: userEmail,
      options: { redirectTo: `${siteUrl}/auth` },
    });

    if (resetError || !resetData) {
      throw new Error(`Falha ao gerar link de reset: ${resetError?.message || "erro desconhecido"}`);
    }

    // Enviar email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "CRM Kairoz <noreply@kairozspace.com.br>",
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
      throw new Error(`Falha ao enviar email: ${emailError.message || 'erro desconhecido'}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email de redefinição enviado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[admin-reset-password] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao enviar email de redefinição" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
