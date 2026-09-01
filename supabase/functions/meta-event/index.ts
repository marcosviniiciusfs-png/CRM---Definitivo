// Tombstone: function aposentada. CAPI agora roda no Cloudflare Worker.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  return new Response(
    JSON.stringify({
      error: "Gone",
      message: "Esta function foi aposentada. CAPI moved to Cloudflare Worker.",
    }),
    { status: 410, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
