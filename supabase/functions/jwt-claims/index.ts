import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.text();
    console.log("RAW BODY:", body);

    // Parse form-encoded body
    const params = new URLSearchParams(body);
    const token = params.get("jwt");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing JWT" }), { status: 400 });
    }

    const payload = JSON.parse(atob(token.split(".")[1]));
    const uid = payload.sub;

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: roles } = await supabase
      .from("user_roles")
      .select("roles:role_id(name)")
      .eq("user_id", uid);

    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permission")
      .in("role_id", roles?.map((r) => r.roles.id) ?? []);

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
  } catch (err: any) {
    console.error("HOOK ERROR:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
