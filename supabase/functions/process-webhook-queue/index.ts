import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca itens pendentes na fila (limite de 10 por execução)
    const { data: queueItems, error: fetchError } = await supabase
      .from('webhook_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('Error fetching queue:', fetchError);
      throw fetchError;
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending items in queue', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${queueItems.length} queued webhooks`);
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const item of queueItems) {
      try {
        // Marca como processando
        await supabase
          .from('webhook_queue')
          .update({ status: 'processing', attempts: item.attempts + 1 })
          .eq('id', item.id);

        // Processa baseado no tipo
        let functionName = '';
        switch (item.webhook_type) {
          case 'whatsapp':
            functionName = 'whatsapp-message-webhook';
            break;
          case 'facebook':
            functionName = 'facebook-leads-webhook';
            break;
          case 'form':
            functionName = 'form-webhook';
            break;
          default:
            throw new Error(`Unknown webhook type: ${item.webhook_type}`);
        }

        // Invoca a função correspondente
        const { error: invokeError } = await supabase.functions.invoke(functionName, {
          body: item.payload
        });

        if (invokeError) {
          throw invokeError;
        }

        // Marca como completado
        await supabase
          .from('webhook_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString() 
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'completed' });
        console.log(`Successfully processed queue item ${item.id}`);

      } catch (processError) {
        const errorMessage = processError instanceof Error ? processError.message : 'Unknown error';
        console.error(`Error processing queue item ${item.id}:`, errorMessage);
        
        const newStatus = item.attempts + 1 >= item.max_attempts ? 'failed' : 'pending';
        
        await supabase
          .from('webhook_queue')
          .update({ 
            status: newStatus,
            error_message: errorMessage
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: newStatus, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Queue processing completed',
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Queue processing error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
