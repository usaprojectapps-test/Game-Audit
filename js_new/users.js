import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";
import { applyModuleAccess } from "./moduleAccess.js";

// -------------------------------------------------------------
// DOM ELEMENTS
// -------------------------------------------------------------
const tableBody = document.getElementById("usersTableBody");
const searchInput = document.getElementById("searchUser");

const form = document.getElementById("userForm");
const nameInput = document.getElementById("userName");
const emailInput = document.getElementById("userEmail");
const roleSelect = document.getElementById("userRole");
const locationSelect = document.getElementById("userLocation");
const statusSelect = document.getElementById("userStatus");

const btnSave = document.getElementById("saveUser");
const btnDelete = document.getElementById("deleteUser");
const btnClear = document.getElementById("clearUser");

let selectedId = null;
const currentRole = sessionStorage.getItem("role");
const currentLocation = sessionStorage.getItem("location_id");

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
loadUsers();
loadLocations();
setupFormAccess();

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
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

  renderTable(data);
}

// -------------------------------------------------------------
// LOAD LOCATIONS FOR DROPDOWN
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

  // Lock dropdown for LocationAdmin
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

  nameInput.value = row.name || "";
  emailInput.value = row.email || "";
  roleSelect.value = row.role || "";
  locationSelect.value = row.location_id || "";
  statusSelect.value = row.status || "";

  // Lock location dropdown if not SuperAdmin
  if (currentRole !== "SuperAdmin") {
    locationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
btnClear.addEventListener("click", () => {
  selectedId = null;
  form.reset();

  if (currentRole !== "SuperAdmin") {
    locationSelect.value = currentLocation;
    locationSelect.disabled = true;
  }
});

// -------------------------------------------------------------
// SAVE USER
// -------------------------------------------------------------
btnSave.addEventListener("click", async () => {
  const payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    role: roleSelect.value,
    location_id: currentRole === "SuperAdmin" ? locationSelect.value : currentLocation,
    status: statusSelect.value
  };

  let result;

  if (selectedId) {
    result = await supabase
      .from("users")
      .update(payload)
      .eq("id", selectedId);
  } else {
    result = await supabase
      .from("users")
      .insert(payload);
  }

  if (result.error) {
    console.error("Save error:", result.error);
    showToast("Failed to save user.", "error");
    return;
  }

  showToast("User saved successfully.", "success");
  form.reset();
  selectedId = null;
  await loadUsers();
});

// -------------------------------------------------------------
// DELETE USER
// -------------------------------------------------------------
btnDelete.addEventListener("click", async () => {
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

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", selectedId);

  if (error) {
    console.error("Delete error:", error);
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted.", "success");
  form.reset();
  selectedId = null;
  await loadUsers();
});

// -------------------------------------------------------------
// SEARCH
// -------------------------------------------------------------
searchInput.addEventListener("input", async () => {
  const term = searchInput.value.toLowerCase();

  let query = supabase.from("users").select("*");

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocation);
  }

  const { data } = await query;

  const filtered = data.filter(row =>
    (row.name || "").toLowerCase().includes(term) ||
    (row.email || "").toLowerCase().includes(term)
  );

  renderTable(filtered);
});

// -------------------------------------------------------------
// FORM ACCESS CONTROL
// -------------------------------------------------------------
function setupFormAccess() {
  applyModuleAccess(currentRole, "Users", form);
}
