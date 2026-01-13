import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ CORS headers block — paste this right after imports
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", // or your domain
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// ✅ Handle preflight OPTIONS request
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  // ... your function logic starts here
});

serve(async (req) => {
  try {
    const { id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Delete from Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 400
      });
    }

    // 2. Delete from DB
    const { error: dbError } = await supabase.from("users").delete().eq("id", id);
    if (dbError) {
      return new Response(JSON.stringify({ error: dbError }), {
        status: 400
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500
    });
  }
});
