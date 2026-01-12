import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";
import { applyModuleAccess } from "./moduleAccess.js";

let tableBody, searchInput, form;
let nameInput, emailInput, passwordInput, roleSelect, departmentInput;
let locationSelect, statusSelect, phoneInput;
let btnSave, btnDelete, btnClear;

let selectedId = null;
const currentRole = sessionStorage.getItem("role");
const currentLocation = sessionStorage.getItem("location_id");

// -------------------------------------------------------------
// INIT MODULE
// -------------------------------------------------------------
setTimeout(() => initUsersModule(), 50);

function initUsersModule() {
  console.log("Users module initialized");

  tableBody = document.getElementById("usersTableBody");
  searchInput = document.getElementById("searchUser");

  form = document.getElementById("userForm");
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

  // Phone auto-format
  phoneInput?.addEventListener("input", () => {
    let value = phoneInput.value.replace(/\D/g, "");
    if (value.length > 3 && value.length <= 6) {
      value = value.replace(/(\d{3})(\d+)/, "$1-$2");
    } else if (value.length > 6) {
      value = value.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
    }
    phoneInput.value = value;
  });

  btnClear?.addEventListener("click", clearForm);
  btnSave?.addEventListener("click", saveUser);
  btnDelete?.addEventListener("click", deleteUser);
  searchInput?.addEventListener("input", searchUsers);

  loadUsers();
  loadLocations();
  setupFormAccess();
}

// -------------------------------------------------------------
// CREATE USER VIA EDGE FUNCTION
// -------------------------------------------------------------
async function createUserSync(payload) {
  const { data, error } = await supabase.functions.invoke("create_user", {
    body: payload
  });

  if (error) return { error };
  return data;
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  let query = supabase.from("users").select("*");

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const { data, error } = await query;

  if (error) {
    showToast("Failed to load users.", "error");
    return;
  }

  renderTable(data);
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

  if (currentRole !== "SuperAdmin") {
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

  if (currentRole !== "SuperAdmin") {
    locationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
function clearForm() {
  selectedId = null;
  form.reset();
  phoneInput.value = "";

  if (currentRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  }
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

  // NEW USER → Edge Function
  if (isNew) {
    if (!payload.password) {
      showToast("Password is required for new users.", "warning");
      return;
    }

    const result = await createUserSync(payload);

    if (result?.error) {
      alert("ERROR: " + JSON.stringify(result.error, null, 2));
      showToast("Failed to create user.", "error");
      return;
    }

    showToast("User created successfully.", "success");
  }

  // EXISTING USER → update DB only
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
      alert("ERROR: " + JSON.stringify(error, null, 2));
      showToast("Failed to update user.", "error");
      return;
    }

    showToast("User updated successfully.", "success");
  }

  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// DELETE USER VIA EDGE FUNCTION
// -------------------------------------------------------------
async function deleteUser() {
  if (!selectedId) {
    showToast("Select a user first.", "warning");
    return;
  }

  const { data, error } = await supabase.functions.invoke("delete_user", {
    body: { id: selectedId }
  });

  if (error) {
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted.", "success");
  clearForm();
  loadUsers();
}

// -------------------------------------------------------------
// SEARCH
// -------------------------------------------------------------
async function searchUsers() {
  const term = searchInput.value.toLowerCase();

  let query = supabase.from("users").select("*");

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const { data } = await query;

  const filtered = data.filter(row =>
    row.name.toLowerCase().includes(term) ||
    row.email.toLowerCase().includes(term)
  );

  renderTable(filtered);
}

// -------------------------------------------------------------
// FORM ACCESS CONTROL
// -------------------------------------------------------------
function setupFormAccess() {
  applyModuleAccess(currentRole, "Users", form);
}
