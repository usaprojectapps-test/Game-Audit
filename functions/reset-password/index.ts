// supabase/functions/reset-password/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Environment variables (automatically injected by Supabase)
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Admin client (service role)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      return new Response("Missing user_id or new_password", { status: 400 });
    }

    // Update password using Admin API
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password
    });

    if (error) {
      console.error("reset-password error:", error);
      return new Response("Failed to reset password", { status: 500 });
    }

    return new Response("Password reset successfully", { status: 200 });
  } catch (err) {
    console.error("reset-password exception:", err);
    return new Response("Invalid request", { status: 400 });
  }
});
