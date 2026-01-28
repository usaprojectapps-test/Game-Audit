import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();

    const {
      user_id,
      name,
      email,
      role,
      location_id,
      status,
      phone,
      department,
      password,
      editor_role,
      editor_location_id
    } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // -------------------------------------------------------------
    // 1. Load existing user to enforce role hierarchy
    // -------------------------------------------------------------
    const { data: existingUser, error: loadError } = await supabase
      .from("users")
      .select("role, location_id")
      .eq("id", user_id)
      .single();

    if (loadError || !existingUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const targetRole = existingUser.role;
    const targetLocation = existingUser.location_id;

    // -------------------------------------------------------------
    // 2. Permission checks
    // -------------------------------------------------------------

    // Only SuperAdmin can modify a SuperAdmin
    if (targetRole === "SuperAdmin" && editor_role !== "SuperAdmin") {
      return new Response(
        JSON.stringify({
          error: "Only SuperAdmin can modify a SuperAdmin"
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    // LocationAdmin cannot modify users outside their location
    if (
      editor_role === "LocationAdmin" &&
      targetLocation !== editor_location_id
    ) {
      return new Response(
        JSON.stringify({
          error: "LocationAdmin cannot modify users from other locations"
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    // -------------------------------------------------------------
    // 3. Update AUTH metadata (name, role, location_id)
    // -------------------------------------------------------------
    const { error: authError } = await supabase.auth.admin.updateUserById(
      user_id,
      {
        email,
        user_metadata: {
          name,
          role,
          location_id
        }
      }
    );

    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // 4. Update USERS table
    // -------------------------------------------------------------
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        name,
        email,
        role,
        location_id,
        status,
        phone,
        department
      })
      .eq("id", user_id);

    if (userUpdateError) {
      return new Response(JSON.stringify({ error: userUpdateError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // 5. Update USER_ACCESS table
    // -------------------------------------------------------------
    const { error: accessUpdateError } = await supabase
      .from("user_access")
      .update({
        email,
        role,
        location_id
      })
      .eq("user_id", user_id);

    if (accessUpdateError) {
      return new Response(JSON.stringify({ error: accessUpdateError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // 6. Update PROFILES table
    // -------------------------------------------------------------
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: name,
        role,
        location_id
      })
      .eq("user_id", user_id);

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // -------------------------------------------------------------
    // 7. Optional password update
    // -------------------------------------------------------------
    if (password && password.trim() !== "") {
      const { error: passError } = await supabase.auth.admin.updateUserById(
        user_id,
        { password }
      );

      if (passError) {
        return new Response(
          JSON.stringify({
            warning: "User updated, but password change failed",
            error: passError
          }),
          { status: 200, headers: corsHeaders }
        );
      }
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
