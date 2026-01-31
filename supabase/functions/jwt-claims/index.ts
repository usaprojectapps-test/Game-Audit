import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const signature = req.headers.get("X-Supabase-Signature");
    const secret = Deno.env.get("HOOK_SECRET")!;

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), { status: 401 });
    }

    const body = await req.text();

    // --- Correct Supabase HMAC SHA256 verification ---
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(
      atob(signature),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(body)
    );

    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }
    // -------------------------------------------------

    const data = JSON.parse(body);
    const token = data?.jwt;

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing JWT" }), { status: 401 });
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
