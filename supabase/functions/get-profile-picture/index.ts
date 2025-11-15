import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, instanceName } = await req.json();

    if (!phoneNumber || !instanceName) {
      throw new Error('phoneNumber e instanceName são obrigatórios');
    }

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados');
    }

    console.log('📸 Buscando foto de perfil para:', phoneNumber);

    // Formatar número para o formato correto (@s.whatsapp.net)
    const formattedNumber = phoneNumber.includes('@') 
      ? phoneNumber 
      : `${phoneNumber}@s.whatsapp.net`;

    // Buscar foto de perfil via Evolution API
    const profilePicUrl = `${evolutionApiUrl}/chat/fetchProfilePictureUrl/${instanceName}`;
    
    const response = await fetch(profilePicUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedNumber
      })
    });

    if (!response.ok) {
      console.error('❌ Erro ao buscar foto de perfil:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao buscar foto de perfil',
          avatarUrl: null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const data = await response.json();
    console.log('✅ Resposta da Evolution API:', data);

    // A Evolution API pode retornar a URL da foto de diferentes formas
    const avatarUrl = data.profilePictureUrl || data.url || data.picture || null;

    if (avatarUrl) {
      console.log('✅ Foto de perfil encontrada:', avatarUrl);
    } else {
      console.log('⚠️ Foto de perfil não encontrada para:', phoneNumber);
    }

    return new Response(
      JSON.stringify({
        success: true,
        avatarUrl: avatarUrl
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Erro em get-profile-picture:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        avatarUrl: null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});