// supabase/functions/jwt-claims/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { event } = await req.json();
    const uid = event.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", uid);

    // Fetch permissions
    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permission")
      .in(
        "role_id",
        roles?.map((r) => r.roles.id) ?? []
      );

    // Fetch location
    const { data: user } = await supabase
      .from("users")
      .select("location_id")
      .eq("id", uid)
      .single();

    return new Response(
      JSON.stringify({
        claims: {
          roles: roles?.map((r) => r.roles.name) ?? [],
          permissions: perms?.map((p) => p.permission) ?? [],
          location_id: user?.location_id ?? null,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
