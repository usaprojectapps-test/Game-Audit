// users.js

// ---------------------------------------------------------
// 0️⃣ Imports & logged-in user context
// ---------------------------------------------------------
import { supabase } from "./supabaseClient.js";

const loggedInRole = sessionStorage.getItem("role");          // e.g. "SuperAdmin"
const loggedInLocation = sessionStorage.getItem("locationId"); // e.g. "LOC001"
const loggedInUserId = sessionStorage.getItem("userId");

// ---------------------------------------------------------
// 1️⃣ DOM references (matching your NEW HTML)
// ---------------------------------------------------------
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

const deleteUserBtn = document.getElementById("deleteUser");
const saveUserBtn = document.getElementById("saveUser");

// ---------------------------------------------------------
// 2️⃣ State
// ---------------------------------------------------------
let currentEditingUserId = null; // null = creating new, not editing

// ---------------------------------------------------------
// 3️⃣ Constants: roles
// ---------------------------------------------------------
const ROLES = [
  "SuperAdmin",
  "LocationAdmin",
  "Manager",
  "Audit",
  "MSP",
  "Silver",
  "SilverAgent"
];

// ---------------------------------------------------------
// 4️⃣ Populate dropdowns (roles, locations)
// ---------------------------------------------------------
function populateRoleDropdown() {
  userRoleSelect.innerHTML = `<option value="">Select Role</option>`;

  ROLES.forEach(role => {
    // Only SuperAdmin can assign SuperAdmin
    if (loggedInRole !== "SuperAdmin" && role === "SuperAdmin") return;

    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    userRoleSelect.appendChild(opt);
  });

  // Also sync filterRole dropdown to same list (except "All Roles")
  filterRoleSelect.innerHTML = `<option value="">All Roles</option>`;
  ROLES.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    filterRoleSelect.appendChild(opt);
  });
}

async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("code, name")
    .order("code", { ascending: true });

  if (error) {
    console.error("Failed to load locations:", error);
    userLocationSelect.innerHTML = `<option value="">Select Location</option>`;
    return;
  }

  userLocationSelect.innerHTML = `<option value="">Select Location</option>`;

  data.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.code; // store code in users.location_id
    opt.textContent = `${loc.code} - ${loc.name}`;
    userLocationSelect.appendChild(opt);
  });

  // If non-SuperAdmin, lock to their location
  if (loggedInRole !== "SuperAdmin" && loggedInLocation) {
    userLocationSelect.value = loggedInLocation;
    userLocationSelect.disabled = true;
  }
}

// ---------------------------------------------------------
// 5️⃣ Role-based UI control
// ---------------------------------------------------------
function setupRoleBasedUI() {
  // Location control
  if (loggedInRole !== "SuperAdmin") {
    if (loggedInLocation) {
      userLocationSelect.value = loggedInLocation;
    }
    userLocationSelect.disabled = true;
  } else {
    userLocationSelect.disabled = false;
  }

  // Delete button visibility: only SuperAdmin & LocationAdmin
  if (loggedInRole === "SuperAdmin" || loggedInRole === "LocationAdmin") {
    deleteUserBtn.style.display = "inline-block";
  } else {
    deleteUserBtn.style.display = "none";
  }
}

// ---------------------------------------------------------
// 6️⃣ Load users (with search, filter, location-based)
// ---------------------------------------------------------
async function loadUsers() {
  userTableBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  let query = supabase.from("users").select("*");

  // Location restriction
  if (loggedInRole !== "SuperAdmin" && loggedInLocation) {
    query = query.eq("location_id", loggedInLocation);
  }

  // Role filter
  const filterRole = filterRoleSelect.value;
  if (filterRole) {
    query = query.eq("role", filterRole);
  }

  // Search filter (name or email)
  const searchTerm = searchInput.value.trim();
  if (searchTerm) {
    query = query.or(
      `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
    );
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Failed to load users:", error);
    userTableBody.innerHTML = `<tr><td colspan="5">Failed to load users.</td></tr>`;
    return;
  }

  if (!data || !data.length) {
    userTableBody.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
    return;
  }

  userTableBody.innerHTML = "";

  data.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.name || ""}</td>
      <td>${user.email || ""}</td>
      <td>${user.role || ""}</td>
      <td>${user.location_id || ""}</td>
      <td>${user.status || ""}</td>
    `;

    // Click row to edit
    tr.addEventListener("click", () => {
      fillFormForEdit(user);
    });

    userTableBody.appendChild(tr);
  });
}

// ---------------------------------------------------------
// 7️⃣ Fill form for editing an existing user
// ---------------------------------------------------------
function fillFormForEdit(user) {
  currentEditingUserId = user.id;

  userNameInput.value = user.name || "";
  userEmailInput.value = user.email || "";
  userEmailInput.disabled = true; // email read-only on edit

  userRoleSelect.value = user.role || "";
  userDepartmentInput.value = user.department || "";
  userLocationSelect.value = user.location_id || "";
  userStatusSelect.value = user.status || "Active";

  userPasswordInput.value = ""; // blank means "no change"
}

// ---------------------------------------------------------
// 8️⃣ Clear form for creating a new user
// ---------------------------------------------------------
function clearForm() {
  currentEditingUserId = null;

  userNameInput.value = "";
  userEmailInput.value = "";
  userEmailInput.disabled = false;

  userPasswordInput.value = "";
  userRoleSelect.value = "";
  userDepartmentInput.value = "";
  userStatusSelect.value = "Active";

  if (loggedInRole === "SuperAdmin") {
    userLocationSelect.value = "";
    userLocationSelect.disabled = false;
  } else if (loggedInLocation) {
    userLocationSelect.value = loggedInLocation;
    userLocationSelect.disabled = true;
  }
}

// ---------------------------------------------------------
// 9️⃣ Save user (create or update)
// ---------------------------------------------------------
saveUserBtn.addEventListener("click", async () => {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const password = userPasswordInput.value.trim();
  const role = userRoleSelect.value;
  const department = userDepartmentInput.value.trim();
  const status = userStatusSelect.value;
  let locationId = userLocationSelect.value;

  if (!name || !email || !role || !status) {
    alert("Please fill all required fields (name, email, role, status).");
    return;
  }

  if (loggedInRole !== "SuperAdmin") {
    locationId = loggedInLocation;
  }

  if (!locationId) {
    alert("Location is required.");
    return;
  }

  // UPDATE existing user
  if (currentEditingUserId) {
    const { error } = await supabase
      .from("users")
      .update({
        name,
        role,
        department,
        status,
        location_id: locationId
      })
      .eq("id", currentEditingUserId);

    if (error) {
      console.error("Failed to update user:", error);
      alert("Failed to update user.");
      return;
    }

    alert("User updated successfully.");
    await loadUsers();
    return;
  }

  // CREATE new user
  if (!password) {
    alert("Password is required for new users.");
    return;
  }

  // 1) Create in Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role,
        department,
        location_id: locationId,
        status: "Active"
      }
    }
  });

  if (authError) {
    console.error("Auth signUp error:", authError);
    alert("Failed to create user (Auth).");
    return;
  }

  const authUser = authData.user;
  if (!authUser) {
    alert("User not returned from Auth.");
    return;
  }

  const userId = authUser.id;

  // 2) Insert into users table
  const { error: dbError } = await supabase.from("users").insert({
    id: userId,
    name,
    email,
    role,
    department,
    location_id: locationId,
    status: "Active"
  });

  if (dbError) {
    console.error("DB insert error:", dbError);
    alert("User created in Auth but failed in DB.");
    return;
  }

  alert("User created successfully.");
  clearForm();
  await loadUsers();
});

// ---------------------------------------------------------
// 🔟 Delete user (SuperAdmin / LocationAdmin only)
// ---------------------------------------------------------
deleteUserBtn.addEventListener("click", async () => {
  if (!currentEditingUserId) {
    alert("Select a user first.");
    return;
  }

  const confirmDelete = confirm("Are you sure you want to delete this user?");
  if (!confirmDelete) return;

  try {
    // Call your Edge Function to delete from Auth + DB
    const res = await fetch("/functions/v1/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentEditingUserId
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Delete user error:", errText);
      alert("Failed to delete user.");
      return;
    }

    alert("User deleted successfully.");
    clearForm();
    await loadUsers();
  } catch (err) {
    console.error("Delete user fetch error:", err);
    alert("Failed to delete user (network error).");
  }
});

// ---------------------------------------------------------
// 1️⃣1️⃣ Search & filter listeners
// ---------------------------------------------------------
searchInput.addEventListener("input", () => {
  loadUsers();
});

filterRoleSelect.addEventListener("change", () => {
  loadUsers();
});

// ---------------------------------------------------------
// 1️⃣2️⃣ Init
// ---------------------------------------------------------
(async function init() {
  populateRoleDropdown();
  await loadLocations();
  setupRoleBasedUI();
  await loadUsers();
})();
