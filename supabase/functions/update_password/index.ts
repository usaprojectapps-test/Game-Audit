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
    const { id, newPassword, email } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Update password
    const { error: pwError } = await supabase.auth.admin.updateUser(id, {
      password: newPassword
    });

    if (pwError) {
      return new Response(JSON.stringify({ error: pwError }), {
        status: 400
      });
    }

    // 2. Send simple notification email
    await supabase.auth.admin.generateLink({
      type: "email_change_current",
      email
    });

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
