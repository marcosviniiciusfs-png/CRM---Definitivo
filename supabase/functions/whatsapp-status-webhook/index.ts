import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔒 VALIDAÇÃO DE AUTENTICAÇÃO
  const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
  const authHeader = req.headers.get('x-api-key');

  if (!webhookSecret || !authHeader || authHeader !== webhookSecret) {
    console.error('❌ Unauthorized webhook access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload = await req.json();
    
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    // Extract event type and data from Evolution API webhook
    const event = payload.event;
    const data = payload.data;

    // Check if this is a status update event
    if (!event || !data) {
      console.log('Invalid payload structure');
      return new Response(
        JSON.stringify({ success: true, message: 'Ignored - invalid payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle message status updates (MESSAGES_UPDATE or similar)
    if (event === 'messages.update' || event === 'messages.upsert') {
      const messageId = data.key?.id || data.messageId;
      const status = data.status;

      if (!messageId) {
        console.log('No messageId found in payload');
        return new Response(
          JSON.stringify({ success: true, message: 'Ignored - no messageId' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Map Evolution API status to internal status
      let internalStatus = null;
      
      switch (status) {
        case 'SERVER_ACK':
        case 'SENT':
          internalStatus = 'SENT';
          break;
        case 'DELIVERY_ACK':
        case 'delivered':
          internalStatus = 'DELIVERED';
          break;
        case 'READ':
        case 'read':
          internalStatus = 'READ';
          break;
        default:
          console.log(`Unknown status: ${status}`);
          // Don't update for unknown statuses
          return new Response(
            JSON.stringify({ success: true, message: `Ignored - unknown status: ${status}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
      }

      console.log(`Updating message ${messageId} to status ${internalStatus}`);

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Update message status in database
      const { data: updateData, error: updateError } = await supabase
        .from('mensagens_chat')
        .update({ status_entrega: internalStatus })
        .eq('evolution_message_id', messageId);

      if (updateError) {
        console.error('Error updating message status:', updateError);
        throw updateError;
      }

      console.log(`Successfully updated message ${messageId} to ${internalStatus}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Status updated successfully',
          messageId,
          newStatus: internalStatus
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // For other event types, just acknowledge receipt
    console.log(`Event type ${event} - no action taken`);
    return new Response(
      JSON.stringify({ success: true, message: `Event ${event} acknowledged` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in whatsapp-status-webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
