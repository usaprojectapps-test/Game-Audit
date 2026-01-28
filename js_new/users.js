// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

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
document.addEventListener("DOMContentLoaded", async () => {
  console.log("USERS JS LOADED");

  await loadLocations();
  await loadUsers();

  setupSearchAndFilters();
  setupFormButtons();
  applyRoleDropdownRestrictions();
  renderUsersTable();

  console.log("Users.js fully loaded.");
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

  select.innerHTML = `<option value="">Select Location</option>`;
  locations.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  });

  // Filter dropdown
  filterSelect.innerHTML = `<option value="">All Locations</option>`;
  locations.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    filterSelect.appendChild(opt);
  });
}

// -------------------------------------------------------------
// LOAD USERS
// -------------------------------------------------------------
async function loadUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, location_id, status")
    .order("name", { ascending: true });

  if (error) {
    console.log("USERS LOAD ERROR:", error);
    showToast("Failed to load users.", "error");
    return;
  }

  users = data || [];
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

function applyFiltersAndSearch() {
  const searchValue = document.getElementById("searchUser")?.value.trim().toLowerCase() || "";
  const filterLocation = document.getElementById("filterLocation")?.value || "";
  const filterRole = document.getElementById("filterRole")?.value || "";

  filteredUsers = users.filter(u => {
    const matchesSearch =
      !searchValue ||
      u.name?.toLowerCase().includes(searchValue) ||
      u.email?.toLowerCase().includes(searchValue);

    const matchesLocation = !filterLocation || u.location_id === filterLocation;
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
      locations.find(l => l.id === user.location_id)?.name || (user.role === "SuperAdmin" ? "All Locations" : "-");

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
  const loggedInRole = sessionStorage.getItem("role");
  const roleSelect = document.getElementById("userRole");
  if (!roleSelect || !loggedInRole) return;

  const allowedRoles = ROLE_HIERARCHY[loggedInRole] || [];

  [...roleSelect.options].forEach(opt => {
    if (!opt.value) return;
    opt.disabled = !allowedRoles.includes(opt.value);
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

  if (selectedUserId) {
    await updateUser(payload);
  } else {
    await createUser(payload);
  }

  await loadUsers();
  resetForm();
}

// CREATE
async function createUser(payload) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        name: payload.name
      }
    }
  });

  if (authError || !authData?.user) {
    console.log("AUTH CREATE ERROR:", authError);
    showToast("Failed to create auth user.", "error");
    return;
  }

  const newUserId = authData.user.id;

  // 2. Insert into users table
  const { error: userInsertError } = await supabase.from("users").insert({
    id: newUserId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    department: payload.department,
    location_id: payload.location_id,
    status: payload.status,
    phone: payload.phone
  });

  if (userInsertError) {
    console.log("USERS INSERT ERROR:", userInsertError);
    showToast("Failed to save user.", "error");
    return;
  }

  // 3. Insert into user_access
  const { error: accessError } = await supabase.from("user_access").insert({
    user_id: newUserId,
    email: payload.email,
    role: payload.role,
    location_id: payload.location_id
  });

  if (accessError) {
    console.log("ACCESS INSERT ERROR:", accessError);
    showToast("Failed to save user access.", "error");
    return;
  }

  showToast("User created successfully.", "success");
}

// UPDATE
async function updateUser(payload) {
  if (!selectedUserId) return;

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      location_id: payload.location_id,
      status: payload.status,
      phone: payload.phone
    })
    .eq("id", selectedUserId);

  if (userUpdateError) {
    console.log("USERS UPDATE ERROR:", userUpdateError);
    showToast("Failed to update user.", "error");
    return;
  }

  const { error: accessUpdateError } = await supabase
    .from("user_access")
    .update({
      email: payload.email,
      role: payload.role,
      location_id: payload.location_id
    })
    .eq("user_id", selectedUserId);

  if (accessUpdateError) {
    console.log("ACCESS UPDATE ERROR:", accessUpdateError);
    showToast("Failed to update user access.", "error");
    return;
  }

  // Optional: update password if provided
  if (payload.password) {
    const { error: passError } = await supabase.auth.updateUser({
      password: payload.password
    });

    if (passError) {
      console.log("PASSWORD UPDATE ERROR:", passError);
      showToast("User updated, but password change failed.", "error");
      return;
    }
  }

  showToast("User updated successfully.", "success");
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
  document.getElementById("userLocation").value = user.location_id || "";
  document.getElementById("userStatus").value = user.status || "Active";
  document.getElementById("userPhone").value = user.phone || "";
  document.getElementById("userPassword").value = "";
}

// -------------------------------------------------------------
// DELETE USER (tables only; auth deletion should be server-side)
// -------------------------------------------------------------
async function deleteUser() {
  if (!selectedUserId) {
    showToast("Select a user to delete.", "error");
    return;
  }

  const loggedInUserId = sessionStorage.getItem("userId");
  const loggedInRole = sessionStorage.getItem("role");

  if (selectedUserId === loggedInUserId) {
    showToast("You cannot delete your own account.", "error");
    return;
  }

  const user = users.find(u => u.id === selectedUserId);
  if (!user) {
    showToast("User not found.", "error");
    return;
  }

  if (user.role === "SuperAdmin" && loggedInRole !== "SuperAdmin") {
    showToast("Only SuperAdmin can delete a SuperAdmin.", "error");
    return;
  }

  const confirmed = confirm(`Are you sure you want to delete user "${user.name}"?`);
  if (!confirmed) return;

  // 1. Delete from user_access
  const { error: accessDeleteError } = await supabase
    .from("user_access")
    .delete()
    .eq("user_id", selectedUserId);

  if (accessDeleteError) {
    console.log("ACCESS DELETE ERROR:", accessDeleteError);
    showToast("Failed to delete user access.", "error");
    return;
  }

  // 2. Delete from users
  const { error: userDeleteError } = await supabase
    .from("users")
    .delete()
    .eq("id", selectedUserId);

  if (userDeleteError) {
    console.log("USERS DELETE ERROR:", userDeleteError);
    showToast("Failed to delete user.", "error");
    return;
  }

  showToast("User deleted successfully.", "success");
  selectedUserId = null;
  await loadUsers();
  resetForm();
}

// -------------------------------------------------------------
// RESET PASSWORD (for selected user via email link)
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

  // In a real app, this should trigger a password reset email via backend.
  showToast("Password reset flow should be handled server-side.", "info");
}
