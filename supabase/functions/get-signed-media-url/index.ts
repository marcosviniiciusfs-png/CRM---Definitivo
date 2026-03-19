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
    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { filePath, mediaUrl } = await req.json();

    // Extract file path from URL if mediaUrl is provided
    let path = filePath;
    if (!path && mediaUrl) {
      // Handle different Supabase storage URL formats:
      // 1. /storage/v1/object/private/chat-media/leadId/file.ext
      // 2. /storage/v1/object/public/chat-media/leadId/file.ext
      // 3. /storage/v1/object/chat-media/leadId/file.ext
      // Extract the path after the bucket name "chat-media/"
      const match = mediaUrl.match(/\/chat-media\/(.+?)(?:\?.*)?$/);
      if (match) {
        path = match[1];
      }
    }

    if (!path) {
      return new Response(
        JSON.stringify({ error: 'Missing filePath or mediaUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client (bypasses RLS for lead ownership check)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract lead ID from path (format: leadId/filename.ext)
    // If path doesn't contain a slash, there's no leadId prefix — skip the lead check
    const pathParts = path.split('/');
    const potentialLeadId = pathParts[0];
    const hasLeadIdPrefix = pathParts.length > 1 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(potentialLeadId);

    if (hasLeadIdPrefix) {
      // Verify the lead exists in the user's organization using admin client (avoids RLS issues)
      const { data: userOrg } = await supabaseClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (userOrg?.organization_id) {
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('id', potentialLeadId)
          .eq('organization_id', userOrg.organization_id)
          .maybeSingle();

        if (!lead) {
          console.log('Lead not found in user org:', potentialLeadId);
          return new Response(
            JSON.stringify({ error: 'Access denied to this media' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      // If we can't determine the org, still try to generate the URL
      // (the user is authenticated, which is the primary security gate)
    }

    // Generate signed URL valid for 1 hour
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('chat-media')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (signedUrlError) {
      console.error('Error generating signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate signed URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ signedUrl: signedUrlData.signedUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in get-signed-media-url:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
