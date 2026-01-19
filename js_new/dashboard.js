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
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    sessionStorage.clear();
    window.location.href = "login.html";
    return;
  }

  currentUser = data.session.user;
}

// -------------------------------------------------------------
// LOAD USER PROFILE
// -------------------------------------------------------------
async function loadUserProfile() {
  const { data, error } = await supabase
    .from("users")
    .select("name, role, location_id")
    .eq("id", currentUser.id)
    .single();

  if (error || !data) {
    console.error("Profile load error:", error);
    showToast("Unable to load user profile.", "error");
    return;
  }

  currentRole = data.role.trim();
  currentLocation = data.location_id;

  document.getElementById("headerUserName").textContent = data.name;
  document.getElementById("headerUserDept").textContent = currentRole;

  const locationEl = document.getElementById("headerLocationName");
  if (currentRole === "SuperAdmin") {
    locationEl.textContent = "All Locations";
  } else {
    const { data: locData } = await supabase
      .from("locations")
      .select("name")
      .eq("id", currentLocation)
      .single();

    locationEl.textContent = locData?.name || "Unknown Location";
  }

  sessionStorage.setItem("name", data.name);
  sessionStorage.setItem("role", currentRole);
  sessionStorage.setItem("locationId", currentLocation);
  sessionStorage.setItem("userId", currentUser.id);
}

// -------------------------------------------------------------
// HIDE TILES BASED ON ROLE
// -------------------------------------------------------------
function applyDashboardTileAccess() {
  const role = sessionStorage.getItem("role");

  document.querySelectorAll(".dashboard-tile").forEach(tile => {
    const allowed = tile.getAttribute("data-dept")?.split(",");
    if (!allowed.includes(role)) {
      tile.style.display = "none";
    }
  });
}

// -------------------------------------------------------------
// MODULE LOADER (FINAL FIXED VERSION)
// -------------------------------------------------------------
async function loadModule(moduleName) {
  const container = document.getElementById("moduleContainer");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading...</div>`;

  try {
    const response = await fetch(`/modals/${moduleName}.html`);
    if (!response.ok) {
      container.innerHTML = `<div class="error">Module not found: ${moduleName}</div>`;
      return;
    }

    const html = await response.text();
    container.innerHTML = html;

    // Load module JS and dispatch event only after it finishes loading
    const script = document.createElement("script");
    script.type = "module";
    script.src = `/js_new/${moduleName}.js?v=${Date.now()}`;

    script.onload = () => {
      // Now the module script has executed and its listener is attached
      window.dispatchEvent(new Event(moduleName + "ModuleLoaded"));
    };

    script.onerror = () => {
      console.error("Failed to load module script:", script.src);
      container.innerHTML = `<div class="error">Failed to load module script.</div>`;
    };

    document.body.appendChild(script);

  } catch (err) {
    console.error("Module load error:", err);
    container.innerHTML = `<div class="error">Failed to load module.</div>`;
  }
}


// -------------------------------------------------------------
// TILE NAVIGATION (DIRECT OPEN)
// -------------------------------------------------------------
function setupTileNavigation() {
  const tiles = document.querySelectorAll(".dashboard-tile");

  tiles.forEach(tile => {
    tile.style.cursor = "pointer";

    tile.addEventListener("click", () => {
      const moduleName = tile.getAttribute("data-module");
      if (moduleName) loadModule(moduleName);
    });
  });
}

// -------------------------------------------------------------
// LOGOUT
// -------------------------------------------------------------
function setupLogout() {
  const btnLogout = document.getElementById("btnLogout");
  if (!btnLogout) return;

  btnLogout.addEventListener("click", async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "login.html";
  });
}

// -------------------------------------------------------------
// CHANGE PASSWORD BUTTON
// -------------------------------------------------------------
function setupChangePassword() {
  const btn = document.getElementById("btnChangePassword");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await loadChangePasswordModal();
  });
}

// -------------------------------------------------------------
// LOAD CHANGE PASSWORD MODAL
// -------------------------------------------------------------
async function loadChangePasswordModal() {
  const container = document.getElementById("modalContainer");
  if (!container) return;

  const response = await fetch("/modals/changePassword.html");
  const html = await response.text();
  container.innerHTML = html;

  setTimeout(() => {
    const modal = container.querySelector(".modal");
    if (!modal) return;

    const closeBtn = modal.querySelector(".close");
    const cancelBtn = modal.querySelector("#cancelChangePassword");
    const saveBtn = modal.querySelector("#saveChangePassword");
    const status = modal.querySelector("#changePasswordStatus");

    if (closeBtn) closeBtn.onclick = () => modal.remove();
    if (cancelBtn) cancelBtn.onclick = () => modal.remove();

    if (saveBtn) {
      saveBtn.onclick = async () => {
        const oldPass = modal.querySelector("#oldPassword").value.trim();
        const newPass = modal.querySelector("#newPassword").value.trim();
        const confirmPass = modal.querySelector("#confirmPassword").value.trim();

        if (!oldPass || !newPass || !confirmPass) {
          status.textContent = "Fill all fields.";
          status.className = "error-text";
          return;
        }

        if (newPass !== confirmPass) {
          status.textContent = "Passwords do not match.";
          status.className = "error-text";
          return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPass });

        if (error) {
          status.textContent = "Password update failed.";
          status.className = "error-text";
        } else {
          status.textContent = "Password updated successfully.";
          status.className = "success-text";
          setTimeout(() => modal.remove(), 1200);
        }
      };
    }
  }, 50);
}

// -------------------------------------------------------------
// LIVE DATE & TIME
// -------------------------------------------------------------
function startClock() {
  const clockEl = document.getElementById("headerDateTime");
  if (!clockEl) return;

  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleString();
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
async function initDashboard() {
  await validateSession();
  await loadUserProfile();
  applyDashboardTileAccess();
  setupTileNavigation();
  setupLogout();
  setupChangePassword();
  startClock();
}

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
});
