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

  if (isNew && !payload.password) return "Password is required for new users.";

  const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
  if (payload.phone && !phoneRegex.test(payload.phone)) {
    return "Phone must be in 000-000-0000 format.";
  }

  return null;
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  let query = supabase.from("users").select("*");

  if (loggedInRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const roleFilter = document.getElementById("filterRole").value;
  if (roleFilter) query = query.eq("role", roleFilter);

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

  const pageRows = fullUserList.slice(start, end);

  renderTable(pageRows);

  document.getElementById("prevUsers").disabled = currentPage === 1;
  document.getElementById("nextUsers").disabled = end >= fullUserList.length;

  document.getElementById("machines-pagination-text").textContent =
    `Showing ${pageRows.length} of ${fullUserList.length}`;

  document.getElementById("machines-current-page").textContent = currentPage;
}

// -------------------------------------------------------------
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return;

  locationSelect.innerHTML = "";

  data.forEach(loc => {
    const option = document.createElement("option");
    option.value = loc.id;
    option.textContent = loc.name;
    locationSelect.appendChild(option);
  });

  if (loggedInRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
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
// LOAD FORM
// -------------------------------------------------------------
function loadForm(row) {
  selectedId = row.id;

  nameInput.value = row.name;
  emailInput.value = row.email;
  roleSelect.value = row.role;
  departmentInput.value = row.department || "";
  locationSelect.value = row.location_id;
  statusSelect.value = row.status;
  phoneInput.value = row.phone || "";
  passwordInput.value = "";

  if (loggedInRole !== "SuperAdmin") {
    locationSelect.disabled = true;
  }

  passwordInput.disabled = row.id !== loggedInUserId;

  if (
    (loggedInRole === "LocationAdmin" || loggedInRole === "Manager") &&
    row.id !== loggedInUserId
  ) {
    btnResetPassword.style.display = "inline-block";
  } else {
    btnResetPassword.style.display = "none";
  }
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
function clearForm() {
  selectedId = null;
  nameInput.value = "";
  emailInput.value = "";
  passwordInput.value = "";
  roleSelect.value = "";
  departmentInput.value = "";
  statusSelect.value = "Active";
  phoneInput.value = "";

  if (loggedInRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  } else {
    locationSelect.disabled = false;
    locationSelect.value = "";
  }

  passwordInput.disabled = false;
  btnResetPassword.style.display = "none";
}

// -------------------------------------------------------------
// CREATE USER (AUTH + DB)
// -------------------------------------------------------------
async function createUser(payload) {
  const result = await callEdgeFunction("create_user", payload);

  if (result?.error) {
    console.error(result.error);
    return { error: true };
  }

  const authUserId = result?.data?.user?.id;
  if (!authUserId) return { error: true };

  // Insert into users table
  const { error: userErr } = await supabase.from("users").insert({
    id: authUserId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    department: payload.department,
    phone: payload.phone,
    location_id: payload.location_id,
    status: payload.status
  });

  if (userErr) return { error: true };

  // Insert into user_access table
  const { error: accessErr } = await supabase.from("user_access").insert({
    email: payload.email,
    role: payload.role,
    location_id: payload.location_id
  });

  if (accessErr) return { error: true };

  return { success: true };
}

// -------------------------------------------------------------
// SAVE USER
// -------------------------------------------------------------
async function saveUser() {
  const isNew = !selectedId;

  const payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    password: passwordInput.value.trim(),
    role: roleSelect.value,
    department: departmentInput.value.trim(),
    phone: phoneInput.value.trim(),
    location_id: roleSelect.value === "SuperAdmin" ? null : currentLocation,
    status: statusSelect.value
  };

  const validationError = validateForm(payload, isNew);
  if (validationError) {
    showToast(validationError, "warning");
    return;
  }

  // CREATE NEW USER
  if (isNew) {
    const result = await createUser(payload);

    if (result.error) {
      showToast("Failed to create user.", "error");
      return;
    }

    showToast("User created successfully.", "success");
  }

  // UPDATE EXISTING USER
  else {
    const { error } = await supabase
      .from("users")
      .update({
        name: payload.name,
        email: payload.email,
        role: payload.role,
        department: payload.department,
        phone: payload.phone,
        location_id: payload.location_id,
        status: payload.status
      })
      .eq("id", selectedId);

    if (error) {
      showToast("Failed to update user.", "error");
      return;
    }

    if (payload.password) {
      if (selectedId === loggedInUserId) {
        const result = await callEdgeFunction("update_password", {
          id: selectedId,
          newPassword: payload.password,
          email: payload.email
        });

        if (result?.error) {
          showToast("Password update failed.", "error");
        } else {
          showToast("Your password has been updated.", "success");
        }
      } else {
        showToast("Use Reset Password to update another user's password.", "warning");
      }
    } else {
      showToast("User updated successfully.", "success");
    }
  }

  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// DELETE USER
// -------------------------------------------------------------
async function deleteUser() {
  if (!selectedId) {
    showToast("Select a user first.", "warning");
    return;
  }

  const result = await callEdgeFunction("delete_user", { id: selectedId });

  if (result.error) {
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted.", "success");
  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// SEARCH USERS
// -------------------------------------------------------------
async function searchUsers() {
  const term = searchInput.value.toLowerCase();
  const roleFilter = document.getElementById("filterRole").value;

  let query = supabase.from("users").select("*");

  if (loggedInRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const { data } = await query;

  let filtered = data;

  if (term) {
    filtered = filtered.filter(row =>
      row.name.toLowerCase().includes(term) ||
      row.email.toLowerCase().includes(term)
    );
  }

  if (roleFilter) {
    filtered = filtered.filter(row => row.role === roleFilter);
  }

  fullUserList = filtered;
  currentPage = 1;
  renderPaginatedTable();
}

// -------------------------------------------------------------
// RESET PASSWORD MODAL
// -------------------------------------------------------------
function openResetModal() {
  if (!selectedId) {
    showToast("Select a user first.", "warning");
    return;
  }

  if (selectedId === loggedInUserId) {
    showToast("Use Change Password to update your own password.", "info");
    return;
  }

  if (loggedInRole !== "LocationAdmin" && loggedInRole !== "Manager") {
    showToast("You are not authorized to reset passwords.", "warning");
    return;
  }

  document.getElementById("resetEmailUser").value = emailInput.value;
  document.getElementById("resetModal").style.display = "flex";
}

function closeResetModal() {
  document.getElementById("resetModal").style.display = "none";
}

async function confirmResetPassword() {
  const email = document.getElementById("resetEmailUser").value;

  const { error } = await supabase.functions.invoke("reset_password", {
    body: { email }
  });

  if (error) {
    showToast("Failed to send reset email.", "error");
    return;
  }

  showToast("Password reset email sent.", "success");
  closeResetModal();
}

// -------------------------------------------------------------
// FORM ACCESS CONTROL
// -------------------------------------------------------------
function setupFormAccess() {
  applyModuleAccess(loggedInRole, "Users", document.getElementById("userForm"));
  btnResetPassword.style.display = "none";
}
