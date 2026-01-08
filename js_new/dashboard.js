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
// NAVIGATION HANDLERS
// -------------------------------------------------------------
function setupNavigation() {
  const navMap = {
    "tile-locations": "locations.html",
    "tile-vendors": "vendors.html",
    "tile-machines": "machines.html",
    "tile-users": "users.html",
    "tile-audit": "audit.html",
    "tile-msp": "msp.html",
    "tile-silver": "silver.html",
    "tile-silverAgent": "silverAgent.html",
    "tile-silverPurchase": "silverPurchase.html"
  };

  Object.keys(navMap).forEach(tileId => {
    const tile = document.getElementById(tileId);
    if (tile) {
      tile.addEventListener("click", () => {
        window.location.href = navMap[tileId];
      });
    }
  });
}

// -------------------------------------------------------------
// LOGOUT HANDLER
// -------------------------------------------------------------
function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
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
