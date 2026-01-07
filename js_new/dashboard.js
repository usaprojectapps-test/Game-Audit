import { supabase } from "./supabaseClient.js";

// Elements
const userNameEl = document.getElementById("userName");
const userRoleEl = document.getElementById("userRole");
const userLocationEl = document.getElementById("userLocation");
const logoutBtn = document.getElementById("logoutBtn");

// Dashboard module cards
const usersCard = document.getElementById("cardUsers");
const vendorsCard = document.getElementById("cardVendors");
const machinesCard = document.getElementById("cardMachines");
const reportsCard = document.getElementById("cardReports");

// Logged-in user info
const role = sessionStorage.getItem("role");
const locationId = sessionStorage.getItem("locationId");
const name = sessionStorage.getItem("name");

// ---------------------------------------------------------
// 1️⃣ LOAD USER INFO INTO HEADER
// ---------------------------------------------------------
function loadHeader() {
  if (name) userNameEl.textContent = name;
  if (role) userRoleEl.textContent = role;
  if (locationId) userLocationEl.textContent = locationId;
}
loadHeader();

// ---------------------------------------------------------
// 2️⃣ ROLE-BASED MODULE VISIBILITY
// ---------------------------------------------------------
function setupRoleBasedModules() {
  if (!role) return;

  // Super Admin → sees everything
  if (role === "SuperAdmin") return;

  // Location Admin → sees Users, Vendors, Machines
  if (role === "LocationAdmin") {
    reportsCard.style.display = "none";
    return;
  }

  // Manager → sees Vendors + Machines
  if (role === "Manager") {
    usersCard.style.display = "none";
    reportsCard.style.display = "none";
    return;
  }

  // Viewer → sees only Machines
  if (role === "Viewer") {
    usersCard.style.display = "none";
    vendorsCard.style.display = "none";
    reportsCard.style.display = "none";
    return;
  }

  // Operator → sees only Machines
  if (role === "Operator") {
    usersCard.style.display = "none";
    vendorsCard.style.display = "none";
    reportsCard.style.display = "none";
    return;
  }
}
setupRoleBasedModules();

// ---------------------------------------------------------
// 3️⃣ LOGOUT
// ---------------------------------------------------------
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  sessionStorage.clear();
  window.location.href = "login.html";
});
