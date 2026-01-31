// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";
// rbac.js should define: function can(perm) { ... } using window.permissions
// <script type="module" src="rbac.js"></script> should be loaded before this

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentUser = null;
let currentRole = null;
let currentLocation = null;

// -------------------------------------------------------------
// LOAD RBAC FROM JWT (roles, permissions, location_id)
// -------------------------------------------------------------
async function loadRBACFromJWT() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    console.warn("Unable to load user for RBAC:", error);
    return;
  }

  const user = data.user;
  currentUser = user;

  // These are injected by your JWT Claims hook
  const roles = user.app_metadata?.roles || [];
  const permissions = user.app_metadata?.permissions || [];
  const locationId = user.app_metadata?.location_id || null;

  // Expose globally so rbac.js and modules can use them
  window.roles = roles;
  window.permissions = permissions;
  window.locationId = locationId;

  console.log("RBAC from JWT →", { roles, permissions, locationId });
}

// -------------------------------------------------------------
// VALIDATE SESSION
// -------------------------------------------------------------
async function validateSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    sessionStorage.clear();
    window.location.href = "login.html";
    return;
  }

  const token = data.session.access_token;
  sessionStorage.setItem("access_token", token);

  const user = data.session.user;
  currentUser = user;
  sessionStorage.setItem("userId", user.id);
  sessionStorage.setItem("email", user.email);

  // Keep this for backward compatibility if you still use user_metadata
  if (user.user_metadata) {
    sessionStorage.setItem("role", user.user_metadata.role || "");
    sessionStorage.setItem("location_id", user.user_metadata.location_id || "");
    sessionStorage.setItem("name", user.user_metadata.name || "");
  }
}

// -------------------------------------------------------------
// LOAD USER PROFILE (still from users table for name/header)
// -------------------------------------------------------------
async function loadUserProfile() {
  const sessionUserId = sessionStorage.getItem("userId");

  console.log("Loading profile for:", sessionUserId);

  if (!sessionUserId) {
    showToast("Unable to load user profile.", "error");
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .select("name, role, location_id")
    .eq("id", sessionUserId)
    .single();

  if (error || !data) {
    console.error("Profile load error:", error || "No user row found");
    showToast("Unable to load user profile.", "error");
    return;
  }

  console.log("Profile loaded:", data);

  currentRole = data.role?.trim() || "";
  currentLocation = data.location_id;

  // Header UI
  document.getElementById("headerUserName").textContent = data.name;
  document.getElementById("headerUserDept").textContent = currentRole;

  const locationEl = document.getElementById("headerLocationName");

  if (currentRole === "SuperAdmin") {
    locationEl.textContent = "All Locations";
  } else {
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

  // Store in sessionStorage
  sessionStorage.setItem("name", data.name);
  sessionStorage.setItem("role", currentRole);
  sessionStorage.setItem("location_id", currentLocation);
}

// -------------------------------------------------------------
// DASHBOARD TILE ACCESS (now permission-based)
// Each tile should have: class="dashboard-tile" data-perm="msp.read" etc.
// -------------------------------------------------------------
function applyDashboardTileAccess() {
  document.querySelectorAll(".dashboard-tile").forEach(tile => {
    const requiredPerm = tile.getAttribute("data-perm");
    if (!requiredPerm) return; // no perm → leave as-is

    // `can` comes from rbac.js and uses window.permissions
    if (!window.can || !can(requiredPerm)) {
      tile.style.display = "none";
    }
  });
}

// -------------------------------------------------------------
// PENDING DELETE REQUESTS (RBAC + COUNT LOADING)
// -------------------------------------------------------------
async function loadPendingDeleteRequests() {
  const card = document.getElementById("pendingRequestsCard");
  if (!card) return;

  // If user does NOT have permission → hide card and stop
  if (!window.can || !can("delete_requests.read")) {
    card.style.display = "none";
    return;
  }

  // User has permission → show card
  card.style.display = "block";

  // Load count from DB
  const { data, error } = await supabase
    .from("delete_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("Failed to load pending delete requests:", error);
    return;
  }

  const count = data?.length ?? 0;

  // Update UI
  document.getElementById("pendingRequestsCount").textContent = count;

  const badge = document.getElementById("pendingBadge");
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
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

    const existingScript = document.querySelector(
      `script[data-module="${moduleName}"]`
    );
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
    console.error("Module load error:", err);
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
  await loadRBACFromJWT();
  await loadUserProfile();
  applyDashboardTileAccess();
  await loadPendingDeleteRequests();   // <-- NEW
  setupTileNavigation();
  setupLogout();
  setupChangePassword();
  startClock();
});
