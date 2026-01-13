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
    const body = await req.json();

    const {
      name,
      email,
      password,
      role,
      location_id,
      status,
      phone,
      department
    } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
        status: 400
      });
    }

    const uid = authUser.user.id;

    // 2. Insert into DB
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
