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

  // Update welcome message
  const welcomeEl = document.getElementById("welcomeName");
  if (welcomeEl) {
    welcomeEl.textContent = `Welcome, ${data.name}`;
  }

  // Store in session
  sessionStorage.setItem("name", data.name);
  sessionStorage.setItem("role", data.role);
  sessionStorage.setItem("location_id", data.location_id);
  sessionStorage.setItem("user_id", currentUser.id);
}

// -------------------------------------------------------------
// TILE NAVIGATION
// -------------------------------------------------------------
function setupTileNavigation() {
  const navMap = {
    "tile-vendors": "vendors.html",
    "tile-machines": "machines.html",
    "tile-users": "users.html",
    "tile-audit": "audit.html",
    "tile-msp": "msp.html",
    "tile-silver": "silver.html",
    "tile-silverAgent": "silver_agents.html",
    "tile-silverPurchase": "silver_purchase.html",
    "tile-reports": "reports.html",
    "tile-general": "general.html",
    "tile-locations": "locations.html"
  };

  Object.entries(navMap).forEach(([id, page]) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        window.location.href = page;
      });
    }
  });
}

// -------------------------------------------------------------
// INITIALIZE DASHBOARD
// -------------------------------------------------------------
async function initDashboard() {
  await validateSession();
  await loadUserProfile();
  setupTileNavigation();
}

initDashboard();
