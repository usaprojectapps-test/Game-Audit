// users.js — Final Production Version (UUID + Location Name Display)
// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { ROLES } from "./roles.js";
import { applyModuleAccess } from "./moduleAccess.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// SESSION CONTEXT
// -------------------------------------------------------------
const loggedInRole = sessionStorage.getItem("role");
const loggedInLocation = sessionStorage.getItem("location_id");
const loggedInUserId = sessionStorage.getItem("user_id");

// -------------------------------------------------------------
// DOM ELEMENTS
// -------------------------------------------------------------
const searchInput = document.getElementById("searchUser");
const filterRoleSelect = document.getElementById("filterRole");
const userTableBody = document.getElementById("userTableBody");

const userNameInput = document.getElementById("userName");
const userEmailInput = document.getElementById("userEmail");
const userPasswordInput = document.getElementById("userPassword");
const userRoleSelect = document.getElementById("userRole");
const userDepartmentInput = document.getElementById("userDepartment");
const userLocationSelect = document.getElementById("userLocation");
const userStatusSelect = document.getElementById("userStatus");

const saveUserBtn = document.getElementById("saveUser");
const deleteUserBtn = document.getElementById("deleteUser");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentEditingUserId = null;
let locationMap = {}; // UUID → Location Name

// -------------------------------------------------------------
// PRELOAD LOCATION NAMES (UUID → Name)
// -------------------------------------------------------------
async function preloadLocationNames() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name");

  if (error) {
    console.error("Failed to load location names:", error);
    showToast("Failed to load location names.", "error");
    return;
  }

  locationMap = {};
  data.forEach(loc => {
    locationMap[loc.id] = loc.name;
  });
}

// -------------------------------------------------------------
// POPULATE ROLE DROPDOWN
// -------------------------------------------------------------
function populateRoleDropdown() {
  userRoleSelect.innerHTML = `<option value="">Select Role</option>`;
  filterRoleSelect.innerHTML = `<option value="">All Roles</option>`;

  Object.values(ROLES).forEach(role => {
    // Non-SuperAdmin cannot assign SuperAdmin
    if (loggedInRole !== ROLES.SUPER_ADMIN && role === ROLES.SUPER_ADMIN) return;

    const opt1 = document.createElement("option");
    opt1.value = role;
    opt1.textContent = role;
    userRoleSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = role;
    opt2.textContent = role;
    filterRoleSelect.appendChild(opt2);
  });
}

// -------------------------------------------------------------
// LOAD LOCATIONS (UUID)
// -------------------------------------------------------------
async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name")
    .order("code", { ascending: true });

  if (error) {
    console.error("Failed to load locations:", error);
    showToast("Failed to load locations.", "error");
    return;
  }

  userLocationSelect.innerHTML = `<option value="">Select Location</option>`;

  data.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id; // UUID
    opt.textContent = `${loc.code} - ${loc.name}`;
    userLocationSelect.appendChild(opt);
  });

  // LocationAdmin / others → lock to their UUID
  if (loggedInRole !== ROLES.SUPER_ADMIN) {
    userLocationSelect.value = loggedInLocation;
    userLocationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// ROLE-BASED UI
// -------------------------------------------------------------
function setupRoleBasedUI() {
  if (loggedInRole === ROLES.SUPER_ADMIN || loggedInRole === ROLES.LOCATION_ADMIN) {
    deleteUserBtn.style.display = "inline-block";
  } else {
    deleteUserBtn.style.display = "none";
  }
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  userTableBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  await preloadLocationNames();

  let query = supabase.from("users").select("*");

  // Non-SuperAdmin → restricted to their location
  if (loggedInRole !== ROLES.SUPER_ADMIN) {
    query = query.eq("location_id", loggedInLocation);
  }

  const filterRole = filterRoleSelect.value;
  if (filterRole) query = query.eq("role", filterRole);

  const searchTerm = searchInput.value.trim();
  if (searchTerm) {
    query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Failed to load users:", error);
    userTableBody.innerHTML = `<tr><td colspan="5">Failed to load users.</td></tr>`;
    showToast("Failed to load users.", "error");
    return;
  }

  if (!data.length) {
    userTableBody.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
    return;
  }

  userTableBody.innerHTML = "";

  data.forEach(user => {
    const tr = document.createElement("tr");

    const locationName = user.role === ROLES.SUPER_ADMIN
      ? "All Locations"
      : locationMap[user.location_id] || "—";

    tr.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${locationName}</td>
      <td>${user.status}</td>
    `;

    tr.addEventListener("click", () => fillFormForEdit(user));
    userTableBody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// FILL FORM FOR EDIT
// -------------------------------------------------------------
function fillFormForEdit(user) {
  currentEditingUserId = user.id;

  userNameInput.value = user.name;
  userEmailInput.value = user.email;
  userEmailInput.disabled = true;

  userRoleSelect.value = user.role;
  userDepartmentInput.value = user.department || "";
  userStatusSelect.value = user.status || "Active";

  // Ensure locations are loaded before setting
  setTimeout(() => {
    userLocationSelect.value = user.location_id;
  }, 150);

  userPasswordInput.value = "";
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
function clearForm() {
  currentEditingUserId = null;

  userNameInput.value = "";
  userEmailInput.value = "";
  userEmailInput.disabled = false;

  userPasswordInput.value = "";
  userRoleSelect.value = "";
  userDepartmentInput.value = "";
  userStatusSelect.value = "Active";

  if (loggedInRole === ROLES.SUPER_ADMIN) {
    userLocationSelect.disabled = false;
    userLocationSelect.value = "";
  } else {
    userLocationSelect.disabled = true;
    userLocationSelect.value = loggedInLocation;
  }
}

// -------------------------------------------------------------
// SAVE USER (CREATE OR UPDATE)
// -------------------------------------------------------------
saveUserBtn.addEventListener("click", async () => {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const password = userPasswordInput.value.trim();
  const role = userRoleSelect.value;
  const department = userDepartmentInput.value.trim();
  const status = userStatusSelect.value;

  let locationId = userLocationSelect.value;

  if (!name || !email || !role || !status) {
    showToast("Please fill all required fields.", "warning");
    return;
  }

  // SuperAdmin role → no specific location assignment
  if (role === ROLES.SUPER_ADMIN) {
    locationId = null;
  }

  // Logged-in non-SuperAdmin cannot move users outside their location
  if (loggedInRole !== ROLES.SUPER_ADMIN && role !== ROLES.SUPER_ADMIN) {
    locationId = loggedInLocation;
  }

  const payload = {
    name,
    role,
    department,
    status,
    location_id: locationId
  };

  // UPDATE FLOW
  if (currentEditingUserId) {
    const { error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", currentEditingUserId);

    if (error) {
      console.error(error);
      showToast("Failed to update user.", "error");
      return;
    }

    showToast("User updated successfully.", "success");
    clearForm();
    await loadUsers();
    return;
  }

  // CREATE FLOW
  if (!password) {
    showToast("Password is required for new users.", "warning");
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role, department, location_id: locationId, status }
    }
  });

  if (authError) {
    console.error(authError);
    showToast("Failed to create user in Auth.", "error");
    return;
  }

  const userId = authData.user.id;

  const { error: dbError } = await supabase.from("users").insert({
    id: userId,
    name,
    email,
    role,
    department,
    location_id: locationId,
    status
  });

  if (dbError) {
    console.error(dbError);
    showToast("User created in Auth but failed in DB.", "error");
    return;
  }

  showToast("User created successfully.", "success");
  clearForm();
  await loadUsers();
});

// -------------------------------------------------------------
// DELETE USER
// -------------------------------------------------------------
deleteUserBtn.addEventListener("click", async () => {
  if (!currentEditingUserId) {
    showToast("Select a user first.", "warning");
    return;
  }

  if (loggedInRole === ROLES.SUPER_ADMIN || loggedInRole === ROLES.LOCATION_ADMIN) {
    await deleteUser(currentEditingUserId);
    return;
  }

  showToast("You do not have permission to delete users.", "warning");
});

// -------------------------------------------------------------
// DELETE USER (ADMIN)
// -------------------------------------------------------------
async function deleteUser(userId) {
  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) {
    console.error(error);
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted successfully.", "success");
  clearForm();
  await loadUsers();
}

// -------------------------------------------------------------
// SEARCH & FILTER
// -------------------------------------------------------------
searchInput.addEventListener("input", loadUsers);
filterRoleSelect.addEventListener("change", loadUsers);

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
(async function init() {
  applyModuleAccess(loggedInRole, "Users", null, null);
  populateRoleDropdown();
  await loadLocations();
  setupRoleBasedUI();
  await loadUsers();
})();
