import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

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

    /* const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );*/

    const admin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    await admin.from("user_access").insert({
      user_id: uid,
      email,
      role,
      location_id
    });

    // If SuperAdmin → override location BEFORE inserts
    if (role === "SuperAdmin") {
      location_id = "00000000-0000-0000-0000-000000000000";
    }

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

    // 2. Insert into users table
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

    // 2A. Insert into profiles
    await supabase.from("profiles").insert({
      user_id: uid,
      role,
      location_id,
      full_name: name
    });

    // 3. Insert into user_access (MUST include user_id)
    /*const { error: accessError } = await supabase
      .from("user_access")
      .insert({
        user_id: uid,
        email,
        role,
        location_id
      });

    if (accessError) {
      return new Response(JSON.stringify({ error: accessError }), {
        status: 400,
        headers: corsHeaders
      });
    }*/

      const { data: existingAccess } = await supabase
  .from("user_access")
  .select("user_id")
  .eq("user_id", uid)
  .single();

if (!existingAccess) {
  const { error: accessError } = await supabase
    .from("user_access")
    .insert({ user_id: uid, email, role, location_id });

  if (accessError) {
    return new Response(JSON.stringify({ error: accessError }), {
      status: 400,
      headers: corsHeaders
    });
  }}


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