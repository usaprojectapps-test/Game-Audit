// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// EDGE FUNCTION ENDPOINTS (adjust if your paths differ)
// -------------------------------------------------------------
const CREATE_USER_URL = "https://kjfzdmmloryzbuiixceh.supabase.co/functions/v1/create_user";
const UPDATE_USER_URL = "https://kjfzdmmloryzbuiixceh.supabase.co/functions/v1/update_user";
const DELETE_USER_URL = "https://kjfzdmmloryzbuiixceh.supabase.co/functions/v1/delete_user";
const RESET_PASSWORD_URL = "https://kjfzdmmloryzbuiixceh.supabase.co/functions/v1/reset_password";

// -------------------------------------------------------------
// STATE & CONSTANTS
// -------------------------------------------------------------
let users = [];
let filteredUsers = [];
let locations = [];
let selectedUserId = null;

const PAGE_SIZE = 10;
let currentPage = 1;

const ROLE_HIERARCHY = {
  SuperAdmin: ["SuperAdmin", "LocationAdmin", "Manager", "AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  LocationAdmin: ["Manager", "AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  Manager: ["AsstManager", "Audit", "MSP", "Silver", "SilverAgent"],
  AsstManager: ["Audit", "MSP", "Silver", "SilverAgent"],
  Audit: [],
  MSP: [],
  Silver: [],
  SilverAgent: []
};

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
window.addEventListener("usersModuleLoaded", async () => {
  console.log("Users module initialized");

  await loadLocations();
  await loadUsers();
  setupSearchAndFilters();
  setupFormButtons();
  applyRoleDropdownRestrictions();
  renderUsersTable();
});

// -------------------------------------------------------------
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const select = document.getElementById("userLocation");
  const filterSelect = document.getElementById("filterLocation");
  if (!select || !filterSelect) return;

  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.log("LOCATIONS LOAD ERROR:", error);
    showToast("Failed to load locations.", "error");
    return;
  }

  locations = data || [];

  const loggedInRole = sessionStorage.getItem("role");
  const loggedInLocationId = sessionStorage.getItem("location_id");

  // -------------------------------------------------------------
  // RIGHT-SIDE FORM DROPDOWN (userLocation)
  // -------------------------------------------------------------
  if (loggedInRole === "LocationAdmin" && loggedInLocationId) {
    // Only their location, no placeholder, hard-locked
    select.innerHTML = "";
    const loc = locations.find(l => l.id === loggedInLocationId);
    if (loc) {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      select.appendChild(opt);
      select.value = loc.id;
    }
    select.disabled = true;
  } else {
    // SuperAdmin (or others): show all locations, editable
    select.innerHTML = `<option value="">Select Location</option>`;
    locations.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      select.appendChild(opt);
    });
    select.disabled = false;
  }

  // -------------------------------------------------------------
  // LEFT-SIDE FILTER DROPDOWN (filterLocation)
  // -------------------------------------------------------------
  filterSelect.innerHTML = `<option value="">All Locations</option>`;
  locations.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    filterSelect.appendChild(opt);
  });

  if (loggedInRole === "LocationAdmin" && loggedInLocationId) {
    filterSelect.value = loggedInLocationId;
    filterSelect.disabled = true;
  } else {
    filterSelect.disabled = false;
  }
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, location_id, status, department, phone")
    .order("name", { ascending: true });

  if (error) {
    console.log("USERS LOAD ERROR:", error);
    showToast("Failed to load users.", "error");
    return;
  }

  users = data || [];

  const loggedInRole = sessionStorage.getItem("role");
  if (loggedInRole === "SuperAdmin") {
    const locFilter = document.getElementById("filterLocation");
    if (locFilter) {
      locFilter.value = ""; // force "All Locations"
      locFilter.dispatchEvent(new Event("change"));
    }
  }

  applyFiltersAndSearch();
}

// -------------------------------------------------------------
// SEARCH & FILTERS
// -------------------------------------------------------------
function setupSearchAndFilters() {
  const searchInput = document.getElementById("searchUser");
  const filterLocation = document.getElementById("filterLocation");
  const filterRole = document.getElementById("filterRole");
  const prevBtn = document.getElementById("prevUsers");
  const nextBtn = document.getElementById("nextUsers");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      currentPage = 1;
      applyFiltersAndSearch();
    });
  }

  if (filterLocation) {
    filterLocation.addEventListener("change", () => {
      currentPage = 1;
      applyFiltersAndSearch();
    });
  }

  if (filterRole) {
    filterRole.addEventListener("change", () => {
      currentPage = 1;
      applyFiltersAndSearch();
    });
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderUsersTable();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE) || 1;
      if (currentPage < totalPages) {
        currentPage++;
        renderUsersTable();
      }
    };
  }
}

// -------------------------------------------------------------
// SUPERADMIN SHOULD ALWAYS SEE ALL LOCATIONS (FILTER)
// -------------------------------------------------------------
const loggedInRole = sessionStorage.getItem("role");
if (loggedInRole === "SuperAdmin") {
  const locFilter = document.getElementById("filterLocation");
  if (locFilter) locFilter.value = "";
}

function applyFiltersAndSearch() {
  const searchValue = document.getElementById("searchUser")?.value.trim().toLowerCase() || "";
  const filterLocation = document.getElementById("filterLocation")?.value || "";
  const filterRole = document.getElementById("filterRole")?.value || "";

  filteredUsers = users.filter(u => {
    const matchesSearch =
      !searchValue ||
      u.name?.toLowerCase().includes(searchValue) ||
      u.email?.toLowerCase().includes(searchValue);

    const matchesLocation =
      loggedInRole === "SuperAdmin"
        ? true
        : (!filterLocation || u.location_id === filterLocation);

    const matchesRole = !filterRole || u.role === filterRole;

    return matchesSearch && matchesLocation && matchesRole;
  });

  currentPage = 1;
  renderUsersTable();
}

// -------------------------------------------------------------
// RENDER TABLE + PAGINATION
// -------------------------------------------------------------
function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  const paginationText = document.getElementById("machines-pagination-text");
  const currentPageSpan = document.getElementById("machines-current-page");
  const prevBtn = document.getElementById("prevUsers");
  const nextBtn = document.getElementById("nextUsers");

  if (!tbody) return;

  tbody.innerHTML = "";

  const total = filteredUsers.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, total);
  const pageItems = filteredUsers.slice(startIndex, endIndex);

  pageItems.forEach(user => {
    const tr = document.createElement("tr");

    const locationName =
      locations.find(l => l.id === user.location_id)?.name ||
      (user.role === "SuperAdmin" ? "All Locations" : "-");

    tr.innerHTML = `
      <td>${user.name || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${locationName}</td>
      <td>${user.status || ""}</td>
    `;

    tr.onclick = () => {
      startEditUser(user.id);
    };

    tbody.appendChild(tr);
  });

  if (paginationText) {
    paginationText.textContent = `Showing ${total === 0 ? 0 : startIndex + 1}-${endIndex} of ${total}`;
  }

  if (currentPageSpan) {
    currentPageSpan.textContent = String(currentPage);
  }

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// -------------------------------------------------------------
// ROLE DROPDOWN RESTRICTIONS
// -------------------------------------------------------------
function applyRoleDropdownRestrictions() {
  const roleSelect = document.getElementById("userRole");
  if (!roleSelect) return;

  const loggedInRole = sessionStorage.getItem("role");
  const allowedRoles = ROLE_HIERARCHY[loggedInRole] || [];

  roleSelect.innerHTML = `<option value="">Select Role</option>`;

  allowedRoles.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    roleSelect.appendChild(opt);
  });
}

// -------------------------------------------------------------
// FORM HANDLERS
// -------------------------------------------------------------
function setupFormButtons() {
  const clearBtn = document.getElementById("clearUser");
  const saveBtn = document.getElementById("saveUser");
  const deleteBtn = document.getElementById("deleteUser");
  const resetPassBtn = document.getElementById("resetPassword");

  if (clearBtn) clearBtn.onclick = resetForm;
  if (saveBtn) saveBtn.onclick = saveUser;
  if (deleteBtn) deleteBtn.onclick = deleteUser;
  if (resetPassBtn) resetPassBtn.onclick = resetPasswordForUser;
}

function getFormPayload() {
  return {
    name: document.getElementById("userName")?.value.trim() || "",
    email: document.getElementById("userEmail")?.value.trim() || "",
    password: document.getElementById("userPassword")?.value.trim() || "",
    role: document.getElementById("userRole")?.value || "",
    department: document.getElementById("userDepartment")?.value.trim() || null,
    location_id: document.getElementById("userLocation")?.value || null,
    status: document.getElementById("userStatus")?.value || "Active",
    phone: document.getElementById("userPhone")?.value.trim() || null
  };
}

function resetForm() {
  selectedUserId = null;
  const form = document.getElementById("userForm");
  if (form) form.reset();

  applyRoleDropdownRestrictions();

  // FIX: Restore location for LocationAdmin
  const role = sessionStorage.getItem("role");
  const loc = sessionStorage.getItem("location_id");
  const locationSelect = document.getElementById("userLocation");

  if (role === "LocationAdmin" && locationSelect) {
    locationSelect.value = loc;
    locationSelect.disabled = true;
  }
}

// -------------------------------------------------------------
// CREATE / UPDATE USER
// -------------------------------------------------------------
async function saveUser() {
  const payload = getFormPayload();

  if (!payload.name || !payload.email || !payload.role) {
    showToast("Name, email, and role are required.", "error");
    return;
  }

  if (!selectedUserId && !payload.password) {
    showToast("Password is required for new users.", "error");
    return;
  }

  try {
    if (selectedUserId) {
      await updateUser(payload);
    } else {
      await createUser(payload);
    }

    await loadUsers();
    resetForm();
  } catch (err) {
    console.log("SAVE USER ERROR:", err);
    showToast("Failed to save user.", "error");
  }
}

// -------------------------------------------------------------
// CREATE (via Edge Function)
// -------------------------------------------------------------
async function createUser(payload) {
  try {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session.access_token;

    const res = await fetch(CREATE_USER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        role: payload.role,
        location_id: payload.location_id,
        status: payload.status,
        phone: payload.phone,
        department: payload.department
      })
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      console.log("CREATE_USER FUNCTION ERROR:", result.error || result);
      showToast("Failed to create user.", "error");
      return;
    }

    showToast("User created successfully.", "success");
  } catch (err) {
    console.log("CREATE_USER CALL ERROR:", err);
    showToast("Failed to create user.", "error");
  }
}

// -------------------------------------------------------------
// UPDATE (via Edge Function)
// -------------------------------------------------------------
async function updateUser(payload) {
  if (!selectedUserId) return;

  const editor_role = sessionStorage.getItem("role");
  const editor_location_id = sessionStorage.getItem("location_id") || null;

  try {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session.access_token;

    const res = await fetch(UPDATE_USER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        user_id: selectedUserId,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        location_id: payload.location_id,
        status: payload.status,
        phone: payload.phone,
        department: payload.department,
        password: payload.password || null,
        editor_role,
        editor_location_id
      })
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      console.log("UPDATE_USER FUNCTION ERROR:", result.error || result);
      showToast(result.error?.message || "Failed to update user.", "error");
      return;
    }

    if (result.warning) {
      showToast(result.warning, "warning");
    } else {
      showToast("User updated successfully.", "success");
    }
  } catch (err) {
    console.log("UPDATE_USER CALL ERROR:", err);
    showToast("Failed to update user.", "error");
  }
}

// -------------------------------------------------------------
// EDIT USER
// -------------------------------------------------------------
function startEditUser(id) {
  selectedUserId = id;
  const user = users.find(u => u.id === id);
  if (!user) return;

  document.getElementById("userName").value = user.name || "";
  document.getElementById("userEmail").value = user.email || "";
  document.getElementById("userRole").value = user.role || "";
  document.getElementById("userDepartment").value = user.department || "";
  document.getElementById("userStatus").value = user.status || "Active";
  document.getElementById("userPhone").value = user.phone || "";
  document.getElementById("userPassword").value = "";

  const locationSelect = document.getElementById("userLocation");
  const loggedInRole = sessionStorage.getItem("role");

  if (loggedInRole === "SuperAdmin") {
    const matchingOption = [...locationSelect.options].find(
      opt => opt.value === user.location_id
    );
    locationSelect.value = matchingOption?.value || "";
    locationSelect.disabled = false;
  }
  // For LocationAdmin, loadLocations already restricted and locked the dropdown.
}

// -------------------------------------------------------------
// DELETE USER (via Edge Function)
// -------------------------------------------------------------
async function deleteUser() {
  if (!selectedUserId) {
    showToast("Select a user to delete.", "error");
    return;
  }

  const loggedInUserId = sessionStorage.getItem("userId");
  const loggedInRoleDelete = sessionStorage.getItem("role");

  if (selectedUserId === loggedInUserId) {
    showToast("You cannot delete your own account.", "error");
    return;
  }

  const user = users.find(u => u.id === selectedUserId);
  if (!user) {
    showToast("User not found.", "error");
    return;
  }

  if (user.role === "SuperAdmin" && loggedInRoleDelete !== "SuperAdmin") {
    showToast("Only SuperAdmin can delete a SuperAdmin.", "error");
    return;
  }

  const confirmed = confirm(`Are you sure you want to delete user "${user.name}"?`);
  if (!confirmed) return;

  try {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session.access_token;

    const res = await fetch(DELETE_USER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ id: selectedUserId })
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      console.log("DELETE_USER FUNCTION ERROR:", result.error || result);
      showToast("Failed to delete user.", "error");
      return;
    }

    showToast("User deleted successfully.", "success");
    selectedUserId = null;
    await loadUsers();
    resetForm();
  } catch (err) {
    console.log("DELETE_USER CALL ERROR:", err);
    showToast("Failed to delete user.", "error");
  }
}

// -------------------------------------------------------------
// RESET PASSWORD (via Edge Function)
// -------------------------------------------------------------
async function resetPasswordForUser() {
  if (!selectedUserId) {
    showToast("Select a user to reset password.", "error");
    return;
  }

  const user = users.find(u => u.id === selectedUserId);
  if (!user || !user.email) {
    showToast("User email not found.", "error");
    return;
  }

  try {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session.access_token;

    const res = await fetch(RESET_PASSWORD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email: user.email,
        user_id: user.id
      })
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      console.log("RESET_PASSWORD FUNCTION ERROR:", result.error || result);
      showToast("Failed to trigger password reset.", "error");
      return;
    }

    showToast("Password reset email triggered (server-side).", "success");
  } catch (err) {
    console.log("RESET_PASSWORD CALL ERROR:", err);
    showToast("Failed to trigger password reset.", "error");
  }
}

// -------------------------------------------------------------
// TRIGGER INITIAL LOAD
// -------------------------------------------------------------
window.dispatchEvent(new Event("usersModuleLoaded"));
