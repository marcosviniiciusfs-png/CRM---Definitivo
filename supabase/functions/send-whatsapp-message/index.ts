import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendMessageRequest {
  number: string;
  text: string;
  userId: string;
  leadId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { number, text, userId, leadId }: SendMessageRequest = await req.json();

    console.log('Received request:', { number, text, userId, leadId });

    // Clean phone number - only digits
    const cleanNumber = number.replace(/\D/g, '');
    
    if (!cleanNumber) {
      throw new Error('Invalid phone number');
    }

    console.log('Cleaned number:', cleanNumber);

    // Initialize Supabase client first to get instance info
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the connected WhatsApp instance
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('status', 'CONNECTED')
      .single();

    if (instanceError || !instance) {
      console.error('No connected WhatsApp instance found:', instanceError);
      throw new Error('No connected WhatsApp instance found. Please connect WhatsApp first.');
    }

    console.log('Using instance:', instance.instance_name);

    // Get Evolution API credentials from environment
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API credentials not configured');
    }

    // Send message via Evolution API using the correct instance name
    const evolutionResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instance.instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: text,
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.status} - ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log('Evolution API response:', evolutionData);

    // Extract messageId from Evolution response
    const messageId = evolutionData.key?.id || evolutionData.messageId || null;

    // Save message to database
    const { error: dbError } = await supabase
      .from('mensagens_chat')
      .insert({
        id_lead: leadId,
        direcao: 'SAIDA',
        corpo_mensagem: text,
        evolution_message_id: messageId,
        status_entrega: 'SENT',
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log('Message saved to database with messageId:', messageId);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
        evolutionData: evolutionData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Error in send-whatsapp-message:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
