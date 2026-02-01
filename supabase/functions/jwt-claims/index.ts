import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (_req) => {
  // Hard‑coded, always‑successful response
  return new Response(
    JSON.stringify({
      claims: {
        roles: [],
        permissions: [],
        location_id: null,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
