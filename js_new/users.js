// users.js

// ---------------------------------------------------------
// 0️⃣ Imports & logged-in user context
// ---------------------------------------------------------
import { supabase } from "./supabaseClient.js";

// These are set at login time
const loggedInRole = sessionStorage.getItem("role");          // e.g. "Super Admin", "Location Admin", "Manager", etc.
const loggedInLocation = sessionStorage.getItem("locationId"); // e.g. "LOC001" (code from locations table)
const loggedInUserId = sessionStorage.getItem("userId");       // optional but used for delete requests

// ---------------------------------------------------------
// 1️⃣ DOM references
// ---------------------------------------------------------
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const roleSelect = document.getElementById("role");
const departmentSelect = document.getElementById("department");
const locationSelect = document.getElementById("location");
const createUserBtn = document.getElementById("createUserBtn");
const createMsg = document.getElementById("createMsg");
const usersBody = document.getElementById("usersBody");

// Update modal
const updateModal = document.getElementById("updateUserModal");
const editUserId = document.getElementById("editUserId");
const editName = document.getElementById("editName");
const editEmail = document.getElementById("editEmail");
const editRole = document.getElementById("editRole");
const editDepartment = document.getElementById("editDepartment");
const editLocation = document.getElementById("editLocation");
const editStatus = document.getElementById("editStatus");
const updateMsg = document.getElementById("updateMsg");
const saveUserChanges = document.getElementById("saveUserChanges");
const closeUpdateModal = document.getElementById("closeUpdateModal");

// ---------------------------------------------------------
// 2️⃣ Constants: roles & departments
// ---------------------------------------------------------
const ROLES = [
  "Super Admin",
  "Location Admin",
  "Manager",
  "Audit",
  "MSP",
  "Silver",
  "SilverAgents"
];

const DEPARTMENTS = [
  "Audit",
  "MSP",
  "Silver",
  "SilverAgents",
  "Admin",
  "Machine",
  "Agents",
  "Manager"
];

// ---------------------------------------------------------
// 3️⃣ Populate dropdowns (roles, departments, locations)
// ---------------------------------------------------------
async function loadLocations() {
  // locations table: id (uuid), code (e.g. "LOC001"), name
  const { data, error } = await supabase
    .from("locations")
    .select("code, name")
    .order("code", { ascending: true });

  if (error) {
    console.error("Failed to load locations:", error);
    return;
  }

  locationSelect.innerHTML = `<option value="">Select Location</option>`;
  editLocation.innerHTML = `<option value="">Select Location</option>`;

  data.forEach(loc => {
    const opt1 = document.createElement("option");
    opt1.value = loc.code; // store code in users.location_id
    opt1.textContent = `${loc.code} - ${loc.name}`;
    locationSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = loc.code;
    opt2.textContent = `${loc.code} - ${loc.name}`;
    editLocation.appendChild(opt2);
  });
}

function populateRoleDropdowns() {
  roleSelect.innerHTML = `<option value="">Select Role</option>`;
  editRole.innerHTML = "";

  ROLES.forEach(r => {
    // Only Super Admin can assign Super Admin
    if (loggedInRole !== "Super Admin" && r === "Super Admin") return;

    const opt1 = document.createElement("option");
    opt1.value = r;
    opt1.textContent = r;
    roleSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = r;
    opt2.textContent = r;
    editRole.appendChild(opt2);
  });
}

function populateDepartmentDropdowns() {
  departmentSelect.innerHTML = `<option value="">Select Department</option>`;
  editDepartment.innerHTML = "";

  DEPARTMENTS.forEach(d => {
    const opt1 = document.createElement("option");
    opt1.value = d;
    opt1.textContent = d;
    departmentSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = d;
    opt2.textContent = d;
    editDepartment.appendChild(opt2);
  });
}

// ---------------------------------------------------------
// 4️⃣ ROLE-BASED UI CONTROL
// ---------------------------------------------------------
function setupRoleBasedUI() {
  // Location control
  if (loggedInRole !== "Super Admin") {
    if (loggedInLocation) {
      locationSelect.value = loggedInLocation;
    }
    locationSelect.disabled = true;
    editLocation.disabled = true;
  } else {
    locationSelect.disabled = false;
    editLocation.disabled = false;
  }
}
// ---------------------------------------------------------
// 5️⃣ CREATE USER (Auth + DB)
// ---------------------------------------------------------
createUserBtn.addEventListener("click", async () => {
  createMsg.textContent = "";

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;
  const department = departmentSelect.value;
  let locationId = locationSelect.value;

  if (!name || !email || !password || !role || !department) {
    createMsg.textContent = "Please fill all fields (name, email, password, role, department, location).";
    return;
  }

  if (loggedInRole !== "Super Admin") {
    // Non Super Admin is locked to their own location
    locationId = loggedInLocation;
  }

  if (!locationId) {
    createMsg.textContent = "Location is required.";
    return;
  }

  // Create user in Auth
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
    createMsg.textContent = "Failed to create user (Auth).";
    return;
  }

  const authUser = authData.user;
  if (!authUser) {
    createMsg.textContent = "User not returned from Auth.";
    return;
  }

  const userId = authUser.id;

  // Insert into users table
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
    createMsg.textContent = "User created in Auth but failed in DB.";
    return;
  }

  createMsg.textContent = "User created successfully.";
  nameInput.value = "";
  emailInput.value = "";
  passwordInput.value = "";
  roleSelect.value = "";
  departmentSelect.value = "";
  if (loggedInRole === "Super Admin") locationSelect.value = "";

  loadUsers();
});

// ---------------------------------------------------------
// 6️⃣ LOAD USERS (with location-based filtering)
// ---------------------------------------------------------
async function loadUsers() {
  usersBody.innerHTML = "<tr><td colspan='7'>Loading...</td></tr>";

  let query = supabase.from("users").select("*");

  if (loggedInRole !== "Super Admin") {
    query = query.eq("location_id", loggedInLocation);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Failed to load users:", error);
    usersBody.innerHTML = "<tr><td colspan='7'>Failed to load users.</td></tr>";
    return;
  }

  if (!data || !data.length) {
    usersBody.innerHTML = "<tr><td colspan='7'>No users found.</td></tr>";
    return;
  }

  usersBody.innerHTML = "";

  data.forEach(user => {
    const row = document.createElement("tr");

    let actionButtons = `
      <button class="editBtn" data-id="${user.id}">Edit</button>
      <button class="resetBtn" data-id="${user.id}" data-email="${user.email}">Reset Password</button>
    `;

    // Delete / Request Delete logic
    if (loggedInRole === "Super Admin" || loggedInRole === "Location Admin") {
      actionButtons += `
        <button class="deleteBtn" data-id="${user.id}" data-email="${user.email}">Delete</button>
      `;
    } else if (loggedInRole === "Manager") {
      actionButtons += `
        <button class="requestDeleteBtn" data-id="${user.id}" data-email="${user.email}">Request Delete</button>
      `;
    }

    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.department || ""}</td>
      <td>${user.location_id}</td>
      <td>${user.status}</td>
      <td>${actionButtons}</td>
    `;

    usersBody.appendChild(row);
  });

  attachEditHandlers();
  attachResetHandlers();
  attachDeleteHandlers();
  attachRequestDeleteHandlers();
}
// ---------------------------------------------------------
// 7️⃣ RESET PASSWORD (via Edge Function)
// ---------------------------------------------------------
function attachResetHandlers() {
  const resetButtons = document.querySelectorAll(".resetBtn");

  resetButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      const email = btn.dataset.email;

      const newPassword = prompt("Enter new password for " + email);
      if (!newPassword) return;

      try {
        const res = await fetch("/functions/v1/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            new_password: newPassword
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Reset password error:", errText);
          alert("Failed to reset password.");
          return;
        }

        alert("Password reset successfully.");
      } catch (err) {
        console.error("Reset password fetch error:", err);
        alert("Failed to reset password (network error).");
      }
    });
  });
}

// ---------------------------------------------------------
// 8️⃣ DELETE USER (Super Admin / Location Admin only)
// ---------------------------------------------------------
function attachDeleteHandlers() {
  const deleteButtons = document.querySelectorAll(".deleteBtn");

  deleteButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      const email = btn.dataset.email;

      const confirmDelete = confirm(`Are you sure you want to delete user: ${email}?`);
      if (!confirmDelete) return;

      try {
        const res = await fetch("/functions/v1/delete-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Delete user error:", errText);
          alert("Failed to delete user.");
          return;
        }

        alert("User deleted successfully.");
        loadUsers();
      } catch (err) {
        console.error("Delete user fetch error:", err);
        alert("Failed to delete user (network error).");
      }
    });
  });
}

// ---------------------------------------------------------
// 9️⃣ REQUEST DELETE (Manager → approval by Location Admin)
// ---------------------------------------------------------
function attachRequestDeleteHandlers() {
  const requestButtons = document.querySelectorAll(".requestDeleteBtn");

  requestButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      const email = btn.dataset.email;

      const confirmReq = confirm(`Request delete for user: ${email}?`);
      if (!confirmReq) return;

      const requestedBy = loggedInUserId || null;

      const { error } = await supabase.from("delete_requests").insert({
        user_id: userId,
        requested_by: requestedBy,
        requested_by_role: loggedInRole,
        status: "pending",
        requested_at: new Date().toISOString()
      });

      if (error) {
        console.error("Failed to create delete request:", error);
        alert("Failed to create delete request.");
        return;
      }

      alert("Delete request submitted for approval.");
    });
  });
}

// ---------------------------------------------------------
// 🔟 EDIT USER (open modal)
// ---------------------------------------------------------
function attachEditHandlers() {
  const editButtons = document.querySelectorAll(".editBtn");

  editButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Failed to load user:", error);
        alert("Failed to load user.");
        return;
      }

      editUserId.value = data.id;
      editName.value = data.name;
      editEmail.value = data.email;
      editEmail.disabled = true; // email read-only

      // Role
      [...editRole.options].forEach(opt => {
        opt.selected = opt.value === data.role;
      });

      // Department
      [...editDepartment.options].forEach(opt => {
        opt.selected = opt.value === data.department;
      });

      // Location
      if (data.location_id) {
        editLocation.value = data.location_id;
      }

      // Status
      editStatus.value = data.status || "Active";

      // Location control
      if (loggedInRole !== "Super Admin") {
        editLocation.disabled = true;
      } else {
        editLocation.disabled = false;
      }

      updateMsg.textContent = "";
      updateModal.style.display = "flex";
    });
  });
}
// ---------------------------------------------------------
// 1️⃣1️⃣ SAVE USER CHANGES
// ---------------------------------------------------------
saveUserChanges.addEventListener("click", async () => {
  const id = editUserId.value;
  const name = editName.value.trim();
  const role = editRole.value;
  const department = editDepartment.value;
  const status = editStatus.value;
  let locationId = editLocation.value;

  if (!name || !role || !department || !status) {
    updateMsg.textContent = "Please fill all fields (name, role, department, status).";
    return;
  }

  if (loggedInRole !== "Super Admin") {
    locationId = loggedInLocation;
  }

  const { error } = await supabase
    .from("users")
    .update({
      name,
      role,
      department,
      status,
      location_id: locationId
    })
    .eq("id", id);

  if (error) {
    console.error("Failed to update user:", error);
    updateMsg.textContent = "Failed to update user.";
    return;
  }

  updateMsg.textContent = "Updated successfully.";

  setTimeout(() => {
    updateModal.style.display = "none";
    loadUsers();
  }, 800);
});

// ---------------------------------------------------------
// 1️⃣2️⃣ CLOSE MODAL
// ---------------------------------------------------------
closeUpdateModal.addEventListener("click", () => {
  updateModal.style.display = "none";
});

// ---------------------------------------------------------
// 1️⃣3️⃣ INIT
// ---------------------------------------------------------
(async function init() {
  populateRoleDropdowns();
  populateDepartmentDropdowns();
  await loadLocations();
  setupRoleBasedUI();
  loadUsers();
})();
