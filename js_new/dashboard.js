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
// LOAD USER PROFILE (FROM users TABLE)
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

  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = data.name;

  const roleEl = document.getElementById("headerUserDept");
  if (roleEl) roleEl.textContent = currentRole;

  const locationEl = document.getElementById("headerLocationName");
  if (locationEl) {
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
// MODULE LOADER
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

    const script = document.createElement("script");
    script.type = "module";
    script.src = `/js_new/${moduleName}.js?v=${Date.now()}`;
    document.body.appendChild(script);
  } catch (err) {
    console.error("Module load error:", err);
    container.innerHTML = `<div class="error">Failed to load module.</div>`;
  }
}

// -------------------------------------------------------------
// TILE NAVIGATION
// -------------------------------------------------------------
function setupTileNavigation() {
  const tiles = document.querySelectorAll(".dashboard-tile");

  tiles.forEach(tile => {
    tile.style.cursor = "pointer";

    tile.addEventListener("click", () => {
      const moduleName = tile.getAttribute("data-module");

      if (tile.classList.contains("expandable")) {
        toggleSubTiles(tile.id.replace("tile-", ""));
        return;
      }

      if (moduleName) loadModule(moduleName);
    });
  });

  const subTiles = document.querySelectorAll(".sub-tile");
  subTiles.forEach(sub => {
    sub.style.cursor = "pointer";
    sub.addEventListener("click", () => {
      const moduleName = sub.getAttribute("data-module");
      if (moduleName) loadModule(moduleName);
    });
  });
}

// -------------------------------------------------------------
// EXPAND / COLLAPSE SUB‑TILES
// -------------------------------------------------------------
function toggleSubTiles(parent) {
  const container = document.querySelector(`.sub-tile-container[data-parent="${parent}"]`);
  if (!container) return;
  container.classList.toggle("open");
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
    console.log("Change Password clicked");
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
  if (!response.ok) {
    console.error("changePassword.html not found");
    return;
  }

  const html = await response.text();
  container.innerHTML = html;

  const modal = container.querySelector(".modal");
  if (!modal) {
    console.error("Modal element not found in loaded HTML");
    return;
  }

  const closeBtn = modal.querySelector(".close");
  const cancelBtn = modal.querySelector("#cancelChangePassword");
  const saveBtn = modal.querySelector("#saveChangePassword");
  const status = modal.querySelector("#changePasswordStatus");

  if (closeBtn) closeBtn.onclick = () => modal.remove();
  if (cancelBtn) cancelBtn.onclick = () => modal.remove();

  if (saveBtn) {
    saveBtn.onclick = async () => {
      console.log("Save clicked");

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
        console.error(error);
        status.textContent = "Password update failed.";
        status.className = "error-text";
      } else {
        status.textContent = "Password updated successfully.";
        status.className = "success-text";
        setTimeout(() => modal.remove(), 1200);
      }
    };
  } else {
    console.error("Save button not found in modal");
  }
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
