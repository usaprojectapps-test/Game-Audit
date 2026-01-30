import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

console.log("USING ADMIN CLIENT FOR ALL INSERTS");

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    console.log("Incoming payload:", body);

    let {
      name,
      email,
      password,
      role,
      location_id,
      status,
      phone,
      department
    } = body;

    // ADMIN CLIENT (service role)
    const admin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // If SuperAdmin → override location BEFORE inserts
    if (role === "SuperAdmin") {
      location_id = "00000000-0000-0000-0000-000000000000";
    }

    // 1. Create Auth user
    const { data: authUser, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, location_id }
      });

    if (authError) {
      console.log("Auth error:", authError);
      return new Response(JSON.stringify({ error: authError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const uid = authUser.user.id;

    // 2. Insert into users table
    const { error: dbError } = await admin.from("users").insert({
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
      console.log("Users insert error:", dbError);
      return new Response(JSON.stringify({ error: dbError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 3. Insert into profiles
    await admin.from("profiles").insert({
      user_id: uid,
      role,
      location_id,
      full_name: name
    });

    // 4. Insert into user_access
    console.log("INSERT PAYLOAD:", {
      user_id: uid,
      email,
      role,
      location_id
    });

    const { error: accessError } = await admin
      .from("user_access")
      .insert({
        user_id: uid,
        email,
        role,
        location_id
      });

    console.log("user_access insert error:", accessError);

    if (accessError) {
      return new Response(JSON.stringify({ error: accessError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    console.log("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
