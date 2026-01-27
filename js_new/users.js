// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";
import { applyModuleAccess } from "./moduleAccess.js";
import { callEdgeFunction } from "./edgeClient.js";

console.log("USERS JS LOADED");

// -------------------------------------------------------------
// GLOBAL STATE
// -------------------------------------------------------------
let tableBody, searchInput;
let nameInput, emailInput, passwordInput, roleSelect, departmentInput;
let locationSelect, statusSelect, phoneInput;
let btnSave, btnDelete, btnClear, btnResetPassword;

let selectedId = null;
let fullUserList = [];
let currentPage = 1;
const pageSize = 10;

// Logged-in session values
const loggedInUserId = sessionStorage.getItem("userId");
const loggedInRole = sessionStorage.getItem("role");
const currentLocation = sessionStorage.getItem("locationId");

// -------------------------------------------------------------
// ROLE CREATION RULES (FINAL)
// -------------------------------------------------------------
//
// SuperAdmin → can create all roles
// LocationAdmin → can create: Manager, AsstManager, Audit, MSP, Silver, SilverAgent
// Manager → can create: AsstManager, Audit, MSP, Silver, SilverAgent
// AsstManager → cannot create anyone
// Audit/MSP/Silver/SilverAgent → cannot create anyone
//
// -------------------------------------------------------------

const ROLE_HIERARCHY = {
  SuperAdmin: ["SuperAdmin", "LocationAdmin", "Manager", "AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  LocationAdmin: ["Manager", "AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  Manager: ["AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  AsstManager: [],
  Audit: [],
  MSP: [],
  Silver: [],
  SilverAgent: []
};

// -------------------------------------------------------------
// INIT MODULE
// -------------------------------------------------------------
window.addEventListener("usersModuleLoaded", () => {
  setTimeout(() => initUsersModule(), 50);
});

function initUsersModule() {
  console.log("Users module initialized");

  // FORM ELEMENTS
  tableBody = document.getElementById("usersTableBody");
  searchInput = document.getElementById("searchUser");

  nameInput = document.getElementById("userName");
  emailInput = document.getElementById("userEmail");
  passwordInput = document.getElementById("userPassword");
  roleSelect = document.getElementById("userRole");
  departmentInput = document.getElementById("userDepartment");
  locationSelect = document.getElementById("userLocation");
  statusSelect = document.getElementById("userStatus");
  phoneInput = document.getElementById("userPhone");

  btnSave = document.getElementById("saveUser");
  btnDelete = document.getElementById("deleteUser");
  btnClear = document.getElementById("clearUser");
  btnResetPassword = document.getElementById("resetPassword");

  // Phone auto-format
  phoneInput?.addEventListener("input", () => {
    let v = phoneInput.value.replace(/\D/g, "");
    if (v.length > 3 && v.length <= 6) v = v.replace(/(\d{3})(\d+)/, "$1-$2");
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
    phoneInput.value = v;
  });

  // EVENTS
  btnClear?.addEventListener("click", clearForm);
  btnSave?.addEventListener("click", saveUser);
  btnDelete?.addEventListener("click", deleteUser);
  btnResetPassword?.addEventListener("click", openResetModal);

  searchInput?.addEventListener("input", searchUsers);
  document.getElementById("filterRole")?.addEventListener("change", searchUsers);
  document.getElementById("filterLocation")?.addEventListener("change", searchUsers);

  document.getElementById("prevUsers")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderPaginatedTable();
    }
  });

  document.getElementById("nextUsers")?.addEventListener("click", () => {
    if (currentPage * pageSize < fullUserList.length) {
      currentPage++;
      renderPaginatedTable();
    }
  });

  document.getElementById("confirmReset")?.addEventListener("click", confirmResetPassword);
  document.getElementById("cancelReset")?.addEventListener("click", closeResetModal);

  loadLocations();
  loadUsers();
  setupFormAccess();
}

// -------------------------------------------------------------
// VALIDATION
// -------------------------------------------------------------
function validateForm(payload, isNew) {
  if (!payload.name) return "Name is required.";
  if (!payload.email) return "Email is required.";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.email)) return "Invalid email format.";

  if (!payload.role) return "Role is required.";
  if (!payload.status) return "Status is required.";

  // SuperAdmin must select a location for non-SuperAdmin users
  if (loggedInRole === "SuperAdmin") {
    if (payload.role !== "SuperAdmin" && !payload.location_id) {
      return "Please select a location.";
    }
  }

  if (isNew && !payload.password) return "Password is required for new users.";

  const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
  if (payload.phone && !phoneRegex.test(payload.phone)) {
    return "Phone must be in 000-000-0000 format.";
  }

  return null;
}

// -------------------------------------------------------------
// ROLE PERMISSION CHECK
// -------------------------------------------------------------
function canCreateRole(selectedRole) {
  const allowed = ROLE_HIERARCHY[loggedInRole] || [];
  return allowed.includes(selectedRole);
}
// -------------------------------------------------------------
// LOAD USERS (with SuperAdmin location filter)
// -------------------------------------------------------------
async function loadUsers() {
  const roleFilter = document.getElementById("filterRole").value;
  const locationFilter = document.getElementById("filterLocation")?.value;

  let query = supabase.from("users").select("*");

  // SuperAdmin → can filter by any location
  if (loggedInRole === "SuperAdmin") {
    if (locationFilter) {
      query = query.eq("location_id", locationFilter);
    }
  }

  // Other roles → always restricted to their own location
  else {
    query = query.eq("location_id", currentLocation);
  }

  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  const { data, error } = await query;

  if (error) {
    showToast("Failed to load users.", "error");
    return;
  }

  fullUserList = data;
  currentPage = 1;
  renderPaginatedTable();
}

// -------------------------------------------------------------
// PAGINATION
// -------------------------------------------------------------
function renderPaginatedTable() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = data.slice(start, end);

  renderTable(pageRows);

  document.getElementById("prevUsers").disabled = currentPage === 1;
  document.getElementById("nextUsers").disabled = end >= fullUserList.length;

  document.getElementById("machines-pagination-text").textContent =
    `Showing ${pageRows.length} of ${fullUserList.length}`;

  document.getElementById("machines-current-page").textContent = currentPage;
}

// -------------------------------------------------------------
// LOAD LOCATIONS (SuperAdmin sees all, others locked)
// -------------------------------------------------------------
async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return;

  // Populate form dropdown
  locationSelect.innerHTML = "";

  data.forEach(loc => {
    const option = document.createElement("option");
    option.value = loc.id;
    option.textContent = loc.name;
    locationSelect.appendChild(option);
  });

  // Populate left-side filter dropdown
  const filterLocation = document.getElementById("filterLocation");
  if (filterLocation) {
    filterLocation.innerHTML = `<option value="">All Locations</option>`;
    data.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      filterLocation.appendChild(opt);
    });

    // Only SuperAdmin can use the filter
    if (loggedInRole !== "SuperAdmin") {
      filterLocation.value = currentLocation;
      filterLocation.disabled = true;
    }
  }

  // Form dropdown behavior
  if (loggedInRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  } else {
    locationSelect.disabled = false;
  }
}

// -------------------------------------------------------------
// RENDER TABLE
// -------------------------------------------------------------
async function renderTable(rows) {
  tableBody.innerHTML = "";

  for (const row of rows) {
    const { data: locData } = await supabase
      .from("locations")
      .select("name")
      .eq("id", row.location_id)
      .single();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.email}</td>
      <td>${row.role}</td>
      <td>${locData?.name || "—"}</td>
      <td>${row.status}</td>
    `;
    tr.addEventListener("click", () => loadForm(row));
    tableBody.appendChild(tr);
  }
}
// -------------------------------------------------------------
// LOAD FORM WHEN ROW CLICKED
// -------------------------------------------------------------
function loadForm(row) {
  selectedId = row.id;

  nameInput.value = row.name;
  emailInput.value = row.email;
  roleSelect.value = row.role;
  departmentInput.value = row.department || "";
  statusSelect.value = row.status;
  phoneInput.value = row.phone || "";

  // Location handling
  if (row.role === "SuperAdmin") {
    locationSelect.value = "";
    locationSelect.disabled = true;
  } else {
    locationSelect.value = row.location_id || "";
    locationSelect.disabled = loggedInRole !== "SuperAdmin";
  }

  btnDelete.style.display = "inline-block";
  btnResetPassword.style.display = "inline-block";

  applyRoleRestrictions(row.role);
}

// -------------------------------------------------------------
// APPLY ROLE RESTRICTIONS WHEN SELECTING ROLE
// -------------------------------------------------------------
roleSelect?.addEventListener("change", () => {
  const selectedRole = roleSelect.value;

  // If logged-in user cannot create this role
  if (!canCreateRole(selectedRole)) {
    showToast("You are not allowed to create this role.", "warning");
    roleSelect.value = "";
    return;
  }

  // SuperAdmin creating SuperAdmin → location disabled
  if (loggedInRole === "SuperAdmin" && selectedRole === "SuperAdmin") {
    locationSelect.value = "";
    locationSelect.disabled = true;
  }

  // SuperAdmin creating other roles → must choose location
  if (loggedInRole === "SuperAdmin" && selectedRole !== "SuperAdmin") {
    locationSelect.disabled = false;
  }

  // Non-SuperAdmin → location always locked
  if (loggedInRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  }
});

// -------------------------------------------------------------
// APPLY EDIT RESTRICTIONS
// -------------------------------------------------------------
function applyRoleRestrictions(targetRole) {
  // SuperAdmin can edit anyone
  if (loggedInRole === "SuperAdmin") return;

  // Manager can edit only: Audit, MSP, Silver, SilverAgent
  if (loggedInRole === "Manager") {
    if (["Audit", "MSP", "Silver", "SilverAgent"].includes(targetRole)) return;
    disableFormEditing();
    return;
  }

  // LocationAdmin can edit: Manager, AsstManager, Audit, MSP, Silver, SilverAgent
  if (loggedInRole === "LocationAdmin") {
    if (["Manager", "AsstManager", "Audit", "MSP", "Silver", "SilverAgent"].includes(targetRole)) return;
    disableFormEditing();
    return;
  }

  // AsstManager can edit: Audit, MSP, Silver, SilverAgent
  if (loggedInRole === "AsstManager") {
    if (["Audit", "MSP", "Silver", "SilverAgent"].includes(targetRole)) return;
    disableFormEditing();
    return;
  }

  // Lower roles cannot edit anyone
  disableFormEditing();
}

function disableFormEditing() {
  nameInput.disabled = true;
  emailInput.disabled = true;
  passwordInput.disabled = true;
  roleSelect.disabled = true;
  departmentInput.disabled = true;
  locationSelect.disabled = true;
  statusSelect.disabled = true;
  phoneInput.disabled = true;

  btnSave.style.display = "none";
  btnDelete.style.display = "none";
  btnResetPassword.style.display = "none";
}

// -------------------------------------------------------------
// SAVE USER (CREATE OR UPDATE)
// -------------------------------------------------------------
async function saveUser() {
  const isNew = !selectedId;

  const payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    password: passwordInput.value.trim(),
    role: roleSelect.value,
    department: departmentInput.value.trim(),
    location_id: locationSelect.value || null,
    status: statusSelect.value,
    phone: phoneInput.value.trim()
  };

  // Validate
  const validationError = validateForm(payload, isNew);
  if (validationError) {
    showToast(validationError, "warning");
    return;
  }

  // Check role creation permission
  if (!canCreateRole(payload.role)) {
    showToast("You are not allowed to create this role.", "warning");
    return;
  }

  // Non-SuperAdmin → force location
  if (loggedInRole !== "SuperAdmin") {
    payload.location_id = currentLocation;
  }

  // SuperAdmin creating SuperAdmin → location null
  if (loggedInRole === "SuperAdmin" && payload.role === "SuperAdmin") {
    payload.location_id = null;
  }

  if (isNew) {
    await createUser(payload);
  } else {
    await updateUser(payload);
  }

  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// CREATE USER (AUTH + users table + user_access)
// -------------------------------------------------------------
async function createUser(payload) {
  // 1. Create Auth user
  const { data: authUser, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password
  });

  if (authError) {
    showToast("Failed to create auth user.", "error");
    return;
  }

  const newUserId = authUser.user.id;

  // 2. Insert into users table
  const { error: insertError } = await supabase.from("users").insert({
    id: newUserId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    department: payload.department,
    location_id: payload.location_id,
    status: payload.status,
    phone: payload.phone
  });

  if (insertError) {
    showToast("Failed to save user.", "error");
    return;
  }

  // 3. Insert into user_access table
  await supabase.from("user_access").insert({
    user_id: newUserId,
    role: payload.role,
    location_id: payload.location_id
  });

  showToast("User created successfully.", "success");
}

// -------------------------------------------------------------
// UPDATE USER
// -------------------------------------------------------------
async function updateUser(payload) {
  const { error } = await supabase
    .from("users")
    .update({
      name: payload.name,
      role: payload.role,
      department: payload.department,
      location_id: payload.location_id,
      status: payload.status,
      phone: payload.phone
    })
    .eq("id", selectedId);

  if (error) {
    showToast("Failed to update user.", "error");
    return;
  }

  // Update user_access
  await supabase
    .from("user_access")
    .update({
      role: payload.role,
      location_id: payload.location_id
    })
    .eq("user_id", selectedId);

  showToast("User updated successfully.", "success");
}
// -------------------------------------------------------------
// DELETE USER
// -------------------------------------------------------------
async function deleteUser() {
  if (!selectedId) {
    showToast("No user selected.", "warning");
    return;
  }

  if (selectedId === loggedInUserId) {
    showToast("You cannot delete your own account.", "warning");
    return;
  }

  const confirmDelete = confirm("Are you sure you want to delete this user?");
  if (!confirmDelete) return;

  // 1. Delete from user_access
  await supabase.from("user_access").delete().eq("user_id", selectedId);

  // 2. Delete from users table
  const { error } = await supabase.from("users").delete().eq("id", selectedId);

  if (error) {
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted successfully.", "success");

  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// RESET PASSWORD (OPEN MODAL)
// -------------------------------------------------------------
function openResetModal() {
  if (!selectedId) {
    showToast("Select a user first.", "warning");
    return;
  }

  document.getElementById("resetPasswordModal").style.display = "flex";
}

// -------------------------------------------------------------
// CLOSE RESET MODAL
// -------------------------------------------------------------
function closeResetModal() {
  document.getElementById("resetPasswordModal").style.display = "none";
  document.getElementById("newPassword").value = "";
}

// -------------------------------------------------------------
// CONFIRM RESET PASSWORD
// -------------------------------------------------------------
async function confirmResetPassword() {
  const newPass = document.getElementById("newPassword").value.trim();

  if (!newPass) {
    showToast("Password cannot be empty.", "warning");
    return;
  }

  const { data, error } = await callEdgeFunction("reset-password", {
    user_id: selectedId,
    new_password: newPass
  });

  if (error) {
    showToast("Failed to reset password.", "error");
    return;
  }

  showToast("Password reset successfully.", "success");
  closeResetModal();
}

// -------------------------------------------------------------
// SEARCH USERS
// -------------------------------------------------------------
function searchUsers() {
  const term = searchInput.value.toLowerCase();
  const roleFilter = document.getElementById("filterRole").value;
  const locationFilter = document.getElementById("filterLocation").value;

  let filtered = fullUserList;

  if (term) {
    filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  }

  if (roleFilter) {
    filtered = filtered.filter(u => u.role === roleFilter);
  }

  if (loggedInRole === "SuperAdmin" && locationFilter) {
    filtered = filtered.filter(u => String(u.location_id) === String(locationFilter));
  }

  if (loggedInRole !== "SuperAdmin") {
    filtered = filtered.filter(u => String(u.location_id) === String(currentLocation));
  }

  fullUserList = filtered;
  currentPage = 1;
  renderPaginatedTable(filtered);
}
// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
function clearForm() {
  selectedId = null;

  nameInput.disabled = false;
  emailInput.disabled = false;
  passwordInput.disabled = false;
  roleSelect.disabled = false;
  departmentInput.disabled = false;
  statusSelect.disabled = false;
  phoneInput.disabled = false;

  nameInput.value = "";
  emailInput.value = "";
  passwordInput.value = "";
  roleSelect.value = "";
  departmentInput.value = "";
  statusSelect.value = "Active";
  phoneInput.value = "";

  // Location logic
  if (loggedInRole === "SuperAdmin") {
    locationSelect.disabled = false;
    locationSelect.value = "";
  } else {
    locationSelect.disabled = true;
    locationSelect.value = currentLocation;
  }

  btnSave.style.display = "inline-block";
  btnDelete.style.display = "none";
  btnResetPassword.style.display = "none";
}

// -------------------------------------------------------------
// SETUP FORM ACCESS BASED ON LOGGED-IN ROLE
// -------------------------------------------------------------
function setupFormAccess() {
  // SuperAdmin → full access
  if (loggedInRole === "SuperAdmin") {
    roleSelect.disabled = false;
    locationSelect.disabled = false;
    return;
  }

  // LocationAdmin / Manager / AsstManager → restricted
  roleSelect.disabled = false;
  locationSelect.disabled = true;
  locationSelect.value = currentLocation;

  // AsstManager cannot create anyone
  if (loggedInRole === "AsstManager") {
    roleSelect.disabled = true;
  }

  // Lower roles cannot create anyone
  if (["Audit", "MSP", "Silver", "SilverAgent"].includes(loggedInRole)) {
    roleSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// HELPER: FILTER ROLE DROPDOWN BASED ON CREATION RULES
// -------------------------------------------------------------
function filterRoleDropdown() {
  const allowedRoles = ROLE_HIERARCHY[loggedInRole] || [];

  [...roleSelect.options].forEach(opt => {
    if (!opt.value) return; // skip placeholder

    // AsstManager visibility rule (Option B)
    if (opt.value === "AsstManager") {
      if (!["SuperAdmin", "LocationAdmin", "Manager"].includes(loggedInRole)) {
        opt.style.display = "none";
        return;
      }
    }

    // Hide roles user cannot create
    opt.style.display = allowedRoles.includes(opt.value) ? "block" : "none";
  });
}

filterRoleDropdown();

// -------------------------------------------------------------
// END OF FILE
// -------------------------------------------------------------
console.log("Users.js fully loaded.");
