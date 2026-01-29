// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentUser = null;
let currentRole = null;
let currentLocation = null;

// -------------------------------------------------------------
// VALIDATE SESSION
// -------------------------------------------------------------
async function validateSession() {
  // Always get session + error
  const { data, error } = await supabase.auth.getSession();

  // If no session → redirect to login
  if (error || !data.session) {
    sessionStorage.clear();
    window.location.href = "login.html";
    return;
  }

  // Session exists → store token safely
  const token = data.session.access_token;
  sessionStorage.setItem("access_token", token);

  // Store user info
  const user = data.session.user;
  sessionStorage.setItem("userId", user.id);
  sessionStorage.setItem("email", user.email);

  // Also store metadata if needed
  if (user.user_metadata) {
    sessionStorage.setItem("role", user.user_metadata.role);
    sessionStorage.setItem("location_id", user.user_metadata.location_id);
    sessionStorage.setItem("name", user.user_metadata.name);
  }
}
// -------------------------------------------------------------
// LOAD USER PROFILE (CLEAN + SAFE + CORRECT)
// -------------------------------------------------------------
async function loadUserProfile() {
  const sessionUserId = currentUser?.id;

  console.log("Loading profile for:", sessionUserId);

  if (!sessionUserId) {
    showToast("Unable to load user profile.", "error");
    return;
  }

  // -------------------------------------------------------------
  // 1. Load from USERS table (source of truth)
  // -------------------------------------------------------------
  const { data, error } = await supabase
    .from("users")
    .select("name, role, location_id")
    .eq("id", sessionUserId)
    .single();

  if (error) {
    console.error("Profile load error:", error);
    showToast("Unable to load user profile.", "error");
    return;
  }

  if (!data) {
    console.error("Profile load error: No user row found");
    showToast("Unable to load user profile.", "error");
    return;
  }

  console.log("Profile loaded:", data);

  // -------------------------------------------------------------
  // 2. Extract role + location
  // -------------------------------------------------------------
  currentRole = data.role?.trim() || "";
  currentLocation = data.location_id;

  // -------------------------------------------------------------
  // 3. Update header UI
  // -------------------------------------------------------------
  document.getElementById("headerUserName").textContent = data.name;
  document.getElementById("headerUserDept").textContent = currentRole;

  const locationEl = document.getElementById("headerLocationName");

  if (currentRole === "SuperAdmin") {
    locationEl.textContent = "All Locations";
  } else {
    // Load location name
    const { data: locData, error: locError } = await supabase
      .from("locations")
      .select("name")
      .eq("id", currentLocation)
      .single();

    if (locError) {
      console.warn("Location lookup failed:", locError);
    }

    locationEl.textContent = locData?.name || "Unknown Location";
  }

  // -------------------------------------------------------------
  // 4. Store in sessionStorage (correct keys)
  // -------------------------------------------------------------
  sessionStorage.setItem("name", data.name);
  sessionStorage.setItem("role", currentRole);
  sessionStorage.setItem("location_id", currentLocation); // FIXED KEY
}

// -------------------------------------------------------------
// DASHBOARD TILE ACCESS
// -------------------------------------------------------------
function applyDashboardTileAccess() {
  const role = sessionStorage.getItem("role");

  document.querySelectorAll(".dashboard-tile").forEach(tile => {
    const allowed = tile.getAttribute("data-dept")?.split(",") || [];
    if (!allowed.includes(role)) tile.style.display = "none";
  });
}

// -------------------------------------------------------------
// MODULE LOADER
// -------------------------------------------------------------
async function loadModule(moduleName) {
  const container = document.getElementById("moduleContainer");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading...</div>`;

  try {
    const response = await fetch(`/modals/${moduleName}.html`);
    if (!response.ok) {
      container.innerHTML = `<div class="error">Module not found</div>`;
      return;
    }

    const html = await response.text();
    container.innerHTML = html;

    const existingScript = document.querySelector(`script[data-module="${moduleName}"]`);
    if (existingScript) {
      window.dispatchEvent(new Event(`${moduleName}ModuleLoaded`));
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = `/js_new/${moduleName}.js?v=${Date.now()}`;
    script.setAttribute("data-module", moduleName);

    script.onload = () => {
      window.dispatchEvent(new Event(`${moduleName}ModuleLoaded`));
    };

    document.body.appendChild(script);
  } catch (err) {
    container.innerHTML = `<div class="error">Failed to load module</div>`;
  }
}

// -------------------------------------------------------------
// TILE NAVIGATION
// -------------------------------------------------------------
function setupTileNavigation() {
  document.querySelectorAll(".dashboard-tile").forEach(tile => {
    tile.onclick = () => {
      const moduleName = tile.dataset.module;
      if (moduleName) loadModule(moduleName);
    };
  });
}

// -------------------------------------------------------------
// LOGOUT
// -------------------------------------------------------------
function setupLogout() {
  const btn = document.getElementById("btnLogout");
  if (!btn) return;

  btn.onclick = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "login.html";
  };
}

// -------------------------------------------------------------
// CHANGE PASSWORD
// -------------------------------------------------------------
function setupChangePassword() {
  const btn = document.getElementById("btnChangePassword");
  if (!btn) return;

  btn.onclick = loadChangePasswordModal;
}

async function loadChangePasswordModal() {
  const container = document.getElementById("modalContainer");
  if (!container) return;

  const res = await fetch("/modals/changePassword.html");
  container.innerHTML = await res.text();

  const modal = container.querySelector(".modal");
  const cancel = modal.querySelector("#cancelChangePassword");
  const save = modal.querySelector("#saveChangePassword");
  const status = modal.querySelector("#changePasswordStatus");

  cancel.onclick = () => modal.remove();

  save.onclick = async () => {
    const newPass = modal.querySelector("#newPassword").value;
    const confirm = modal.querySelector("#confirmPassword").value;

    if (newPass !== confirm) {
      status.textContent = "Passwords do not match";
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPass });

    if (error) {
      status.textContent = "Password update failed";
    } else {
      status.textContent = "Password updated successfully";
      setTimeout(() => modal.remove(), 1200);
    }
  };
}

// -------------------------------------------------------------
// LIVE CLOCK
// -------------------------------------------------------------
function startClock() {
  const el = document.getElementById("headerDateTime");
  if (!el) return;

  setInterval(() => {
    el.textContent = new Date().toLocaleString();
  }, 1000);
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await validateSession();
  await loadUserProfile();
  applyDashboardTileAccess();
  setupTileNavigation();
  setupLogout();
  setupChangePassword();
  startClock();
});
