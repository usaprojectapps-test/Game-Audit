import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

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
        status: 400,
        headers: corsHeaders
      });
    }

    // 2. Send notification email
    await supabase.auth.admin.generateLink({
      type: "email_change_current",
      email
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
