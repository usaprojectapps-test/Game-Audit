// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { ROLES } from "./roles.js";
import { applyDashboardVisibility } from "./dashboardVisibility.js"; 
import { supabase } from "./supabaseClient.js";

// -------------------------------------------------------------
// GLOBAL USER SESSION
// -------------------------------------------------------------
let currentUser = null;
let currentRole = null;
let currentLocation = null;

// -------------------------------------------------------------
// INITIALIZE DASHBOARD
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await validateSession();
  await loadUserProfile();
  applyDashboardVisibility(currentRole);
  setupNavigation();
  setupLogout();
});

// -------------------------------------------------------------
// SESSION VALIDATION
// -------------------------------------------------------------
async function validateSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = session.user;
}

// -------------------------------------------------------------
// LOAD USER PROFILE (ROLE + LOCATION)
// -------------------------------------------------------------
async function loadUserProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("user_id", currentUser.id)
    .single();

  if (error || !data) {
    console.error("Profile load error:", error);
    alert("Unable to load user profile.");
    return;
  }

  currentRole = data.role;
  currentLocation = data.location_id;

  sessionStorage.setItem("role", currentRole);
  sessionStorage.setItem("location_id", currentLocation);
}

// -------------------------------------------------------------
// MODULE LOADER (HTML + JS)
// -------------------------------------------------------------
async function loadModule(moduleName) {
  try {
    // Load HTML
    const htmlResponse = await fetch(`/modals/${moduleName}.html`);
    if (!htmlResponse.ok) {
      console.error(`Failed to load HTML for module: ${moduleName}`);
      alert(`Module HTML not found: ${moduleName}.html`);
      return;
    }

    const html = await htmlResponse.text();
    document.getElementById("moduleContainer").innerHTML = html;

    // Load JS
    await import(`/js_new/${moduleName}.js`);
  } catch (err) {
    console.error("Module load error:", err);
    alert("Failed to load module.");
  }
}

// -------------------------------------------------------------
// NAVIGATION HANDLERS
// -------------------------------------------------------------
function setupNavigation() {
  const navMap = {
    "tile-locations": "locations",
    "tile-vendors": "vendors",
    "tile-machines": "machines",
    "tile-users": "users",
    "tile-audit": "audit",
    "tile-msp": "msp",
    "tile-silver": "silver",
    "tile-silverAgent": "silverAgent",
    "tile-silverPurchase": "silverPurchase"
  };

  Object.keys(navMap).forEach(tileId => {
    const tile = document.getElementById(tileId);
    if (tile) {
      tile.addEventListener("click", () => {
        loadModule(navMap[tileId]);
      });
    }
  });
}

// -------------------------------------------------------------
// LOGOUT HANDLER
// -------------------------------------------------------------
function setupLogout() {
  const logoutBtn = document.getElementById("btnLogout");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "login.html";
  });
}

// -------------------------------------------------------------
// LOCATION FILTERING (USED BY MODULES)
// -------------------------------------------------------------
export function getLocationFilter() {
  if (currentRole === ROLES.SUPER_ADMIN) {
    return null; // no restriction
  }

  if (currentRole === ROLES.LOCATION_ADMIN) {
    return currentLocation; // restrict to assigned location
  }

  return null; // other roles see all data unless module restricts
}
