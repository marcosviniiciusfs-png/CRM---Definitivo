import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin, formatPhoneToJid } from "../_shared/evolution-config.ts";

interface FetchProfilePictureRequest {
  instance_name: string;
  phone_number: string;
  lead_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, phone_number, lead_id } = await req.json() as FetchProfilePictureRequest;

    console.log('📸 Buscando foto de perfil:', { instance_name, phone_number, lead_id });

    // Validar entrada
    if (!instance_name || !phone_number || !lead_id) {
      throw new Error('instance_name, phone_number e lead_id são obrigatórios');
    }

    // Obter configurações
    const baseUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    // Formatar número no formato correto (com @s.whatsapp.net)
    const formattedNumber = phone_number.includes('@') ? phone_number : formatPhoneToJid(phone_number);

    console.log('📞 Número formatado:', formattedNumber);

    // Chamar Evolution API para buscar foto de perfil (fetchProfile)
    const profileUrl = `${baseUrl}/chat/fetchProfile/${instance_name}`;
    console.log('🔗 URL da Evolution API (fetchProfile):', profileUrl);

    const response = await fetch(profileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedNumber,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro na Evolution API (fetchProfile):', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Evolution API retornou ${response.status}: ${errorText}`);
    }

    const profileData = await response.json();
    console.log('✅ Resposta da Evolution API (fetchProfile):', profileData);

    // Evolution API pode retornar a URL da foto em diferentes campos
    const profilePictureUrl =
      profileData?.profilePictureUrl ||
      profileData?.picture ||
      profileData?.profilePicUrl ||
      null;

    if (!profilePictureUrl) {
      console.log('⚠️ Lead não possui foto de perfil pública ou Evolution não retornou URL de foto', profileData);
      return new Response(
        JSON.stringify({
          success: true,
          hasProfilePicture: false,
          message: 'Lead não possui foto de perfil pública ou Evolution não retornou URL de foto'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar avatar_url no banco de dados
    const supabase = createSupabaseAdmin();

    const { error: updateError } = await supabase
      .from('leads')
      .update({ avatar_url: profilePictureUrl })
      .eq('id', lead_id);

    if (updateError) {
      console.error('❌ Erro ao atualizar avatar no banco:', updateError);
      throw updateError;
    }

    console.log('✅ Avatar atualizado com sucesso no banco de dados');

    return new Response(
      JSON.stringify({
        success: true,
        hasProfilePicture: true,
        profilePictureUrl,
        message: 'Foto de perfil atualizada com sucesso',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro na função fetch-profile-picture:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
