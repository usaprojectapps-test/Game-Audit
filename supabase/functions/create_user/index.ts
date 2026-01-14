import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Parse request body
    const {
      name,
      email,
      password,
      role,
      location_id,
      status,
      phone,
      department
    } = await req.json();

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // 1. Create Auth user
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, location_id }
      });

    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const uid = authUser.user.id;

    // 2. Insert into public.users table
    const { error: dbError } = await supabase.from("users").insert({
      id: uid,
      name,
      email,
      role,
      location_id,
      status,
      phone,
      department
    });

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError }), {
        status: 400,
        headers: corsHeaders
      });
    }

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
