import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";
import { applyModuleAccess } from "./moduleAccess.js";

let selectedId = null;
let currentRole = sessionStorage.getItem("role");
let currentLocation = sessionStorage.getItem("location_id");

// -------------------------------------------------------------
// INIT MODULE (WAIT FOR HTML TO LOAD)
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", initUsersModule);

function initUsersModule() {
  console.log("Users module initialized");

  // Re‑query DOM after HTML is injected
  tableBody = document.getElementById("usersTableBody");
  searchInput = document.getElementById("searchUser");

  form = document.getElementById("userForm");
  nameInput = document.getElementById("userName");
  emailInput = document.getElementById("userEmail");
  roleSelect = document.getElementById("userRole");
  locationSelect = document.getElementById("userLocation");
  statusSelect = document.getElementById("userStatus");

  btnSave = document.getElementById("saveUser");
  btnDelete = document.getElementById("deleteUser");
  btnClear = document.getElementById("clearUser");

  // Attach events
  btnClear?.addEventListener("click", clearForm);
  btnSave?.addEventListener("click", saveUser);
  btnDelete?.addEventListener("click", deleteUser);
  searchInput?.addEventListener("input", searchUsers);

  // Load data
  loadUsers();
  loadLocations();
  setupFormAccess();
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  console.log("Loading users…");

  let query = supabase.from("users").select("id, name, email, role, location_id, status");

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const { data, error } = await query;

  if (error) {
    console.error("User load error:", error);
    showToast("Failed to load users.", "error");
    return;
  }

  console.log("Filtered users:", data);
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

  if (error) {
    console.error("Location load error:", error);
    showToast("Failed to load locations.", "error");
    return;
  }

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
      <td>${locData?.name || "Unknown"}</td>
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
  locationSelect.value = row.location_id;
  statusSelect.value = row.status;

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

  if (currentRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// SAVE USER
// -------------------------------------------------------------
async function saveUser() {
  const payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    role: roleSelect.value,
    location_id: currentRole === "SuperAdmin" ? locationSelect.value : currentLocation,
    status: statusSelect.value
  };

  let result;

  if (selectedId) {
    result = await supabase.from("users").update(payload).eq("id", selectedId);
  } else {
    result = await supabase.from("users").insert(payload);
  }

  if (result.error) {
    console.error("Save error:", result.error);
    showToast("Failed to save user.", "error");
    return;
  }

  showToast("User saved successfully.", "success");
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

  const { data: user } = await supabase
    .from("users")
    .select("location_id")
    .eq("id", selectedId)
    .single();

  if (currentRole !== "SuperAdmin" && user.location_id !== currentLocation) {
    showToast("You cannot delete users from other locations.", "error");
    return;
  }

  const { error } = await supabase.from("users").delete().eq("id", selectedId);

  if (error) {
    console.error("Delete error:", error);
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
