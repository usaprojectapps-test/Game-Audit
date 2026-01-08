// users.js — Final Production Version
// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { ROLES } from "./roles.js";
import { applyModuleAccess } from "./moduleAccess.js";

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

const userForm = document.getElementById("userForm");
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

// -------------------------------------------------------------
// POPULATE ROLE DROPDOWN
// -------------------------------------------------------------
function populateRoleDropdown() {
  userRoleSelect.innerHTML = `<option value="">Select Role</option>`;
  filterRoleSelect.innerHTML = `<option value="">All Roles</option>`;

  Object.values(ROLES).forEach(role => {
    // Only SuperAdmin can assign SuperAdmin
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
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("code, name")
    .order("code", { ascending: true });

  if (error) {
    console.error("Failed to load locations:", error);
    return;
  }

  userLocationSelect.innerHTML = `<option value="">Select Location</option>`;

  data.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.code;
    opt.textContent = `${loc.code} - ${loc.name}`;
    userLocationSelect.appendChild(opt);
  });

  // Non-SuperAdmin → lock to their location
  if (loggedInRole !== ROLES.SUPER_ADMIN) {
    userLocationSelect.value = loggedInLocation;
    userLocationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// ROLE-BASED UI
// -------------------------------------------------------------
function setupRoleBasedUI() {
  // Delete button visibility
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

  let query = supabase.from("users").select("*");

  // Location restriction
  if (loggedInRole !== ROLES.SUPER_ADMIN) {
    query = query.eq("location_id", loggedInLocation);
  }

  // Role filter
  const filterRole = filterRoleSelect.value;
  if (filterRole) query = query.eq("role", filterRole);

  // Search filter
  const searchTerm = searchInput.value.trim();
  if (searchTerm) {
    query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Failed to load users:", error);
    userTableBody.innerHTML = `<tr><td colspan="5">Failed to load users.</td></tr>`;
    return;
  }

  if (!data.length) {
    userTableBody.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
    return;
  }

  userTableBody.innerHTML = "";

  data.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.location_id}</td>
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
  userLocationSelect.value = user.location_id;
  userStatusSelect.value = user.status;

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
    alert("Please fill all required fields.");
    return;
  }

  if (loggedInRole !== ROLES.SUPER_ADMIN) {
    locationId = loggedInLocation;
  }

  // UPDATE
  if (currentEditingUserId) {
    const { error } = await supabase
      .from("users")
      .update({ name, role, department, status, location_id: locationId })
      .eq("id", currentEditingUserId);

    if (error) {
      console.error(error);
      alert("Failed to update user.");
      return;
    }

    alert("User updated.");
    await loadUsers();
    return;
  }

  // CREATE
  if (!password) {
    alert("Password is required for new users.");
    return;
  }

  // Create in Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role, department, location_id: locationId, status }
    }
  });

  if (authError) {
    console.error(authError);
    alert("Failed to create user.");
    return;
  }

  const userId = authData.user.id;

  // Insert into users table
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
    alert("User created in Auth but failed in DB.");
    return;
  }

  alert("User created.");
  clearForm();
  await loadUsers();
});

// -------------------------------------------------------------
// DELETE USER (WITH APPROVAL WORKFLOW)
// -------------------------------------------------------------
deleteUserBtn.addEventListener("click", async () => {
  if (!currentEditingUserId) {
    alert("Select a user first.");
    return;
  }

  // SuperAdmin & LocationAdmin → direct delete
  if (loggedInRole === ROLES.SUPER_ADMIN || loggedInRole === ROLES.LOCATION_ADMIN) {
    await deleteUser(currentEditingUserId);
    return;
  }

  // Manager → create delete request
  if (loggedInRole === ROLES.MANAGER) {
    await createDeleteRequest(currentEditingUserId);
    alert("Delete request sent to Location Admin.");
    return;
  }

  alert("You do not have permission to delete users.");
});

// -------------------------------------------------------------
// CREATE DELETE REQUEST (MANAGER)
// -------------------------------------------------------------
async function createDeleteRequest(userId) {
  await supabase.from("user_delete_requests").insert({
    user_id: userId,
    requested_by: loggedInUserId,
    location_id: loggedInLocation,
    status: "Pending"
  });
}

// -------------------------------------------------------------
// DELETE USER (ADMIN)
// -------------------------------------------------------------
async function deleteUser(userId) {
  await supabase.from("users").delete().eq("id", userId);

  await supabase
    .from("user_delete_requests")
    .update({ status: "Approved" })
    .eq("user_id", userId);

  alert("User deleted.");
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
  applyModuleAccess(loggedInRole, "Users", userForm, null);
  populateRoleDropdown();
  await loadLocations();
  setupRoleBasedUI();
  await loadUsers();
})();
