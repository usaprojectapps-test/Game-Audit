import { supabase } from "./supabaseClient.js";

const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const errorMsg = document.getElementById("errorMsg");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  errorMsg.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    errorMsg.textContent = "Please enter both email and password.";
    loginBtn.disabled = false;
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    errorMsg.textContent = "Invalid credentials or inactive account.";
    loginBtn.disabled = false;
    return;
  }

  const user = data.user;
  const { name, role, location_id } = user.user_metadata;

  // Store session data
  sessionStorage.setItem("userId", user.id);
  sessionStorage.setItem("userName", name);
  sessionStorage.setItem("role", role);
  sessionStorage.setItem("locationId", location_id);

  // Redirect to dashboard
  window.location.href = "dashboard.html";
});
