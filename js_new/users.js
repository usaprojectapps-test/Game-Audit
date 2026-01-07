import { supabase } from "./supabaseClient.js";

// Logged-in user info
const loggedInRole = sessionStorage.getItem("role");
const loggedInLocation = sessionStorage.getItem("locationId");

// UI elements
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const roleSelect = document.getElementById("role");
const locationSelect = document.getElementById("location");
const locationRow = document.getElementById("locationRow");
const createUserBtn = document.getElementById("createUserBtn");
const createMsg = document.getElementById("createMsg");
const usersBody = document.getElementById("usersBody");

// Modal elements
const updateModal = document.getElementById("updateUserModal");
const editUserId = document.getElementById("editUserId");
const editName = document.getElementById("editName");
const editEmail = document.getElementById("editEmail");
const editRole = document.getElementById("editRole");
const editLocation = document.getElementById("editLocation");
const editStatus = document.getElementById("editStatus");
const updateMsg = document.getElementById("updateMsg");
const saveUserChanges = document.getElementById("saveUserChanges");
const closeUpdateModal = document.getElementById("closeUpdateModal");

// ---------------------------------------------------------
// 1️⃣ ROLE-BASED UI CONTROL
// ---------------------------------------------------------
function setupRoleBasedUI() {
  if (loggedInRole !== "SuperAdmin") {
    locationSelect.value = loggedInLocation;
    locationSelect.disabled = true;

    const locAdminOption = [...roleSelect.options].find(
      opt => opt.value === "LocationAdmin"
    );
    if (locAdminOption) locAdminOption.remove();
  }
}
setupRoleBasedUI();

// ---------------------------------------------------------
// 2️⃣ CREATE USER
// ---------------------------------------------------------
createUserBtn.addEventListener("click", async () => {
  createMsg.textContent = "";

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;
  let locationId = locationSelect.value;

  if (!name || !email || !password || !role) {
    createMsg.textContent = "Please fill all fields.";
    return;
  }

  if (loggedInRole !== "SuperAdmin") {
    locationId = loggedInLocation;
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: {
      name,
      role,
      location_id: locationId
    }
  });

  if (authError) {
    createMsg.textContent = "Failed to create user (Auth).";
    console.error(authError);
    return;
  }

  const userId = authUser.user.id;

  const { error: dbError } = await supabase.from("users").insert({
    id: userId,
    name,
    email,
    role,
    location_id: locationId,
    status: "active"
  });

  if (dbError) {
    createMsg.textContent = "User created in Auth but failed in DB.";
    console.error(dbError);
    return;
  }

  createMsg.textContent = "User created successfully.";
  loadUsers();
});

// ---------------------------------------------------------
// 3️⃣ LOAD USERS
// ---------------------------------------------------------
async function loadUsers() {
  usersBody.innerHTML = "<tr><td colspan='6'>Loading...</td></tr>";

  let query = supabase.from("users").select("*");

  if (loggedInRole !== "SuperAdmin") {
    query = query.eq("location_id", loggedInLocation);
  }

  const { data, error } = await query;

  if (error) {
    usersBody.innerHTML = "<tr><td colspan='6'>Failed to load users.</td></tr>";
    console.error(error);
    return;
  }

  if (!data.length) {
    usersBody.innerHTML = "<tr><td colspan='6'>No users found.</td></tr>";
    return;
  }

  usersBody.innerHTML = "";

  data.forEach(user => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.location_id}</td>
      <td>${user.status}</td>
      <td>
        <button class="editBtn" data-id="${user.id}">Edit</button>
        <button class="resetBtn" data-id="${user.id}" data-email="${user.email}">Reset Password</button>
        <button class="disableBtn" data-id="${user.id}">
          ${user.status === "active" ? "Disable" : "Activate"}
        </button>
      </td>
    `;

    usersBody.appendChild(row);
  });

  attachEditHandlers();
  attachResetHandlers();
  attachDisableHandlers();
}
loadUsers();

// ---------------------------------------------------------
// 4️⃣ DISABLE / ACTIVATE USER
// ---------------------------------------------------------
function attachDisableHandlers() {
  const buttons = document.querySelectorAll(".disableBtn");

  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      const newStatus = btn.textContent === "Disable" ? "inactive" : "active";

      const { error } = await supabase
        .from("users")
        .update({ status: newStatus })
        .eq("id", userId);

      if (error) {
        alert("Failed to update user status.");
        console.error(error);
        return;
      }

      loadUsers();
    });
  });
}

// ---------------------------------------------------------
// 5️⃣ RESET PASSWORD
// ---------------------------------------------------------
function attachResetHandlers() {
  const resetButtons = document.querySelectorAll(".resetBtn");

  resetButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;

      const newPassword = prompt("Enter new password for " + email);
      if (!newPassword) return;

      const { error } = await supabase.auth.admin.updateUserByEmail(email, {
        password: newPassword
      });

      if (error) {
        alert("Failed to reset password");
        console.error(error);
        return;
      }

      alert("Password reset successfully");
    });
  });
}

// ---------------------------------------------------------
// 6️⃣ UPDATE USER (MODAL)
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

      if (error) return alert("Failed to load user");

      editUserId.value = data.id;
      editName.value = data.name;
      editEmail.value = data.email;
      editStatus.value = data.status;

      editRole.innerHTML = "";
      const roles = ["LocationAdmin", "Manager", "Viewer", "Operator"];

      roles.forEach(r => {
        if (loggedInRole !== "SuperAdmin" && r === "LocationAdmin") return;
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        if (data.role === r) opt.selected = true;
        editRole.appendChild(opt);
      });

      editLocation.innerHTML = "";
      const locations = ["LOC001", "LOC002", "LOC003"];

      locations.forEach(loc => {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc;
        if (data.location_id === loc) opt.selected = true;
        editLocation.appendChild(opt);
      });

      if (loggedInRole !== "SuperAdmin") {
        editLocation.disabled = true;
      }

      updateModal.style.display = "flex";
    });
  });
}

// Save changes
saveUserChanges.addEventListener("click", async () => {
  const id = editUserId.value;
  const name = editName.value;
  const role = editRole.value;
  const status = editStatus.value;
  const locationId = editLocation.value;

  const { error } = await supabase
    .from("users")
    .update({
      name,
      role,
      status,
      location_id: locationId
    })
    .eq("id", id);

  if (error) {
    updateMsg.textContent = "Failed to update user";
    return;
  }

  updateMsg.textContent = "Updated successfully";

  setTimeout(() => {
    updateModal.style.display = "none";
    loadUsers();
  }, 800);
});

// Close modal
closeUpdateModal.addEventListener("click", () => {
  updateModal.style.display = "none";
});
