// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// HANDLE LOGIN
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.querySelector("#email").value.trim();
    const password = form.querySelector("#password").value.trim();

    if (!email || !password) {
      showToast("Please enter email and password.", "error");
      return;
    }

    // 1. Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData?.user) {
      showToast("Invalid email or password.", "error");
      return;
    }

    const user = authData.user;

    // 2. Load profile from users table
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("name, role, location_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      showToast("No user profile found.", "error");
      return;
    }

    const role = profile.role?.trim() || "";
    const locationId = profile.location_id || null;

    // 3. Store in sessionStorage
    sessionStorage.setItem("userId", user.id);
    sessionStorage.setItem("email", user.email);
    sessionStorage.setItem("name", profile.name);
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("locationId", locationId);

    // 4. Redirect to dashboard
    showToast("Login successful.", "success");
    window.location.href = "dashboard.html";
  });
});
