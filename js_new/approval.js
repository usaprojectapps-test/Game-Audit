// approval.js
import { supabase } from "./supabaseClient.js";

const loggedInRole = sessionStorage.getItem("role");
const loggedInLocation = sessionStorage.getItem("locationId");
const requestsBody = document.getElementById("requestsBody");

// ---------------------------------------------------------
// 1️⃣ Access Control
// ---------------------------------------------------------
if (loggedInRole !== "Super Admin" && loggedInRole !== "Location Admin") {
  requestsBody.innerHTML = `<tr><td colspan="7">Access denied.</td></tr>`;
  throw new Error("Not allowed");
}

// ---------------------------------------------------------
// 2️⃣ Load pending delete requests
// ---------------------------------------------------------
async function loadRequests() {
  requestsBody.innerHTML = "<tr><td colspan='7'>Loading...</td></tr>";

  let query = supabase
    .from("delete_requests")
    .select(`
      id,
      user_id,
      requested_by,
      requested_by_role,
      status,
      requested_at,
      users:user_id (name, email, location_id)
    `)
    .order("requested_at", { ascending: false });

  if (loggedInRole === "Location Admin") {
    query = query.eq("users.location_id", loggedInLocation);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load requests:", error);
    requestsBody.innerHTML = "<tr><td colspan='7'>Failed to load requests.</td></tr>";
    return;
  }

  if (!data.length) {
    requestsBody.innerHTML = "<tr><td colspan='7'>No delete requests.</td></tr>";
    return;
  }

  requestsBody.innerHTML = "";

  data.forEach(req => {
    const row = document.createElement("tr");

    const user = req.users;

    let actions = "";
    if (req.status === "pending") {
      actions = `
        <button class="approveBtn" data-id="${req.id}" data-user="${req.user_id}">Approve</button>
        <button class="rejectBtn" data-id="${req.id}">Reject</button>
      `;
    }

    row.innerHTML = `
      <td>${user?.name || "-"}</td>
      <td>${user?.email || "-"}</td>
      <td>${req.requested_by || "-"}</td>
      <td>${req.requested_by_role}</td>
      <td>${new Date(req.requested_at).toLocaleString()}</td>
      <td>${req.status}</td>
      <td>${actions}</td>
    `;

    requestsBody.appendChild(row);
  });

  attachApproveHandlers();
  attachRejectHandlers();
}

// ---------------------------------------------------------
// 3️⃣ Approve Request → Delete user + update request
// ---------------------------------------------------------
function attachApproveHandlers() {
  const approveBtns = document.querySelectorAll(".approveBtn");

  approveBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const requestId = btn.dataset.id;
      const userId = btn.dataset.user;

      const confirmDelete = confirm("Approve delete request?");
      if (!confirmDelete) return;

      // 1) Delete user via Edge Function
      const res = await fetch("/functions/v1/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });

      if (!res.ok) {
        alert("Failed to delete user.");
        return;
      }

      // 2) Update request status
      await supabase
        .from("delete_requests")
        .update({ status: "approved" })
        .eq("id", requestId);

      alert("User deleted and request approved.");
      loadRequests();
    });
  });
}

// ---------------------------------------------------------
// 4️⃣ Reject Request
// ---------------------------------------------------------
function attachRejectHandlers() {
  const rejectBtns = document.querySelectorAll(".rejectBtn");

  rejectBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const requestId = btn.dataset.id;

      const confirmReject = confirm("Reject delete request?");
      if (!confirmReject) return;

      await supabase
        .from("delete_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);

      alert("Request rejected.");
      loadRequests();
    });
  });
}

// ---------------------------------------------------------
// 5️⃣ Init
// ---------------------------------------------------------
loadRequests();
