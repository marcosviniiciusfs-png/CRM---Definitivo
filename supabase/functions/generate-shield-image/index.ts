import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type } = await req.json(); // "gold" | "silver"
    
    if (!type || !["gold", "silver"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Must be 'gold' or 'silver'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-shield-image] Generating ${type} shield...`);

    // Prompts específicos para cada tipo de escudo
    const prompts = {
      gold: `Create a luxurious golden gaming rank shield with these exact specifications:
- Hexagonal shield shape with ornate golden metallic finish
- Decorative angel wings on both sides made of gold
- A royal crown on top with gems
- Intricate gold filigree and baroque decorative details
- CRITICAL: A perfectly circular empty transparent cutout in the CENTER of the shield for profile photo placement (about 40% of shield width)
- The circular cutout must have a golden decorative border/frame around it
- 3D render style with shiny metallic reflections
- Dark gradient background fading to fully transparent edges
- Premium quality, high detail, photorealistic metallic texture
- PNG format with transparent background
- Aspect ratio 1:1.2 (portrait orientation)`,
      
      silver: `Create an elegant silver gaming rank shield with these exact specifications:
- Hexagonal shield shape with polished silver metallic finish
- Ornate silver decorative elements and engravings
- Subtle platinum highlights
- CRITICAL: A perfectly circular empty transparent cutout in the CENTER of the shield for profile photo placement (about 40% of shield width)
- The circular cutout must have a silver decorative border/frame around it
- 3D render style with shiny metallic reflections
- Dark gradient background fading to fully transparent edges
- Premium quality, high detail, photorealistic metallic texture
- PNG format with transparent background
- Aspect ratio 1:1.2 (portrait orientation)`,
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [{ role: "user", content: prompts[type as keyof typeof prompts] }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[generate-shield-image] AI gateway error: ${response.status}`, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log(`[generate-shield-image] AI response received`);

    const imageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageBase64) {
      console.error("[generate-shield-image] No image in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "No image generated. AI response did not contain an image." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optionally save to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && supabaseServiceRoleKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
        
        // Extract base64 data (remove data:image/png;base64, prefix if present)
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        const fileName = `shield-${type}-${Date.now()}.png`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("shields")
          .upload(fileName, binaryData, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error("[generate-shield-image] Storage upload error:", uploadError);
        } else {
          console.log(`[generate-shield-image] Shield saved to storage: ${fileName}`);
          
          // Get public URL
          const { data: publicUrlData } = supabase.storage
            .from("shields")
            .getPublicUrl(fileName);
          
          return new Response(
            JSON.stringify({ 
              success: true,
              type,
              image: imageBase64,
              storagePath: fileName,
              publicUrl: publicUrlData?.publicUrl,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (storageError) {
        console.error("[generate-shield-image] Storage error:", storageError);
      }
    }

    // Return base64 image if storage failed or not configured
    return new Response(
      JSON.stringify({ 
        success: true,
        type,
        image: imageBase64,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-shield-image] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
