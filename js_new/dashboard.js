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

  currentRole = data.role;
  currentLocation = data.location_id;

  // Update header: name
  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = data.name;

  // Update header: role
  const roleEl = document.getElementById("headerUserDept");
  if (roleEl) roleEl.textContent = data.role;

  // Update header: location name (not code)
  const locationEl = document.getElementById("headerLocationName");
  if (locationEl) {
    if (data.role === "SuperAdmin") {
      locationEl.textContent = "All Locations";
    } else {
      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select("name")
        .eq("id", data.location_id)
        .single();

      locationEl.textContent = locData?.name || "Unknown Location";
    }
  }

  // Store in session
  sessionStorage.setItem("name", data.name);
  sessionStorage.setItem("role", data.role);
  sessionStorage.setItem("location_id", data.location_id);
  sessionStorage.setItem("user_id", currentUser.id);
}


// -------------------------------------------------------------
// MODULE LOADER
// -------------------------------------------------------------
async function loadModule(moduleName) {
  const container = document.getElementById("moduleContainer");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading...</div>`;

  try {
    // Load HTML
    const response = await fetch(`/modals/${moduleName}.html`);
    if (!response.ok) {
      container.innerHTML = `<div class="error">Module not found: ${moduleName}</div>`;
      return;
    }

    const html = await response.text();
    container.innerHTML = html;

    // Load JS
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
// TILE NAVIGATION (LOAD MODULES)
// -------------------------------------------------------------
function setupTileNavigation() {
  const tiles = document.querySelectorAll(".dashboard-tile");

  tiles.forEach(tile => {
    tile.style.cursor = "pointer";

    tile.addEventListener("click", () => {
      const moduleName = tile.getAttribute("data-module");

      // Expandable tiles (Audit, MSP, Silver)
      if (tile.classList.contains("expandable")) {
        toggleSubTiles(tile.id.replace("tile-", ""));
        return;
      }

      if (moduleName) {
        loadModule(moduleName);
      }
    });
  });

  // Sub‑tile clicks
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
document.getElementById("btnLogout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  sessionStorage.clear();
  window.location.href = "login.html";
});

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
async function initDashboard() {
  await validateSession();
  await loadUserProfile();
  setupTileNavigation();
}

initDashboard();
