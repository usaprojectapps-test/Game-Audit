import { supabase } from "./supabaseClient.js";

// ---------------------------------------------------------
// 1️⃣ CHECK SESSION
// ---------------------------------------------------------
async function checkSession() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    sessionStorage.clear();
    window.location.href = "login.html";
    return;
  }

  const user = data.session.user;

  // Load metadata
  const name = user.user_metadata.name;
  const role = user.user_metadata.role;
  const locationId = user.user_metadata.location_id;

  // Store in session
  sessionStorage.setItem("name", name);
  sessionStorage.setItem("role", role);
  sessionStorage.setItem("locationId", locationId);
}

checkSession();
