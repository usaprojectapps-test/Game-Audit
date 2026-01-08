// supabase/functions/delete-user/index.ts

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
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response("Missing user_id", { status: 400 });
    }

    // 1) Delete from users table
    const { error: dbError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", user_id);

    if (dbError) {
      console.error("delete-user DB error:", dbError);
      return new Response("Failed to delete user from DB", { status: 500 });
    }

    // 2) Delete from Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (authError) {
      console.error("delete-user Auth error:", authError);
      return new Response("Failed to delete user from Auth", { status: 500 });
    }

    return new Response("User deleted successfully", { status: 200 });
  } catch (err) {
    console.error("delete-user exception:", err);
    return new Response("Invalid request", { status: 400 });
  }
});
