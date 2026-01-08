// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "/js_new/supabaseClient.js";

// -------------------------------------------------------------
// EVERYTHING ELSE INSIDE DOMContentLoaded
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // HEADER UPDATE FROM sessionStorage (fallback to Supabase session later)
  const storedName = sessionStorage.getItem("name");
  const storedRole = sessionStorage.getItem("role");

  if (storedName) {
    document.getElementById("headerUserName").textContent = storedName;
  }
  if (storedRole) {
    document.getElementById("headerUserDept").textContent = storedRole;
  }

  const moduleContainer = document.getElementById("moduleContainer");
  const tiles = document.querySelectorAll(".dashboard-tile");
  const subTileContainers = document.querySelectorAll(".sub-tile-container");

  // -------------------------------------------------------------
  // AUTH STATE VIA SUPABASE
  // -------------------------------------------------------------
  initAuthAndUser();

  async function initAuthAndUser() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      window.location.href = "/login.html";
      return;
    }

    const user = session.user;
    const meta = user.user_metadata || {};

    const name =
      meta.name ||
      sessionStorage.getItem("name") ||
      user.email ||
      "Unknown User";
    const role =
      meta.role ||
      sessionStorage.getItem("role") ||
      "Unknown";
    const locationId =
      meta.location_id ||
      sessionStorage.getItem("location_id") ||
      "";

    // Update header
    document.getElementById("headerUserName").textContent = name;
    document.getElementById("headerUserDept").textContent = role;

    // Persist to sessionStorage
    sessionStorage.setItem("name", name);
    sessionStorage.setItem("role", role);
    if (locationId) {
      sessionStorage.setItem("location_id", locationId);
    }

    // Apply permissions
    applyPermissions(role);

    // Load widget
    loadPendingRequestsCount();
  }

  // -------------------------------------------------------------
  // PERMISSIONS
  // -------------------------------------------------------------
  function applyPermissions(deptOrRole) {
  tiles.forEach((tile) => {
    const allowed = tile.dataset.dept.split(",");
    if (!allowed.includes(deptOrRole)) {
      tile.classList.add("hidden");
    }
  });

  subTileContainers.forEach((sub) => {
    const parent = sub.dataset.parent;
    const parentTile = document.querySelector(
      `.dashboard-tile[data-module="${parent}"]`
    );
    if (parentTile && parentTile.classList.contains("hidden")) {
      sub.classList.add("hidden");
    }
  });
}

  // -------------------------------------------------------------
  // TILE CLICK HANDLERS
  // -------------------------------------------------------------
  tiles.forEach((tile) => {
    const moduleName = tile.dataset.module;
    const subContainer = document.querySelector(
      `.sub-tile-container[data-parent="${moduleName}"]`
    );
    const arrow = tile.querySelector(".tile-arrow");

    if (tile.classList.contains("expandable")) {
      tile.addEventListener("click", () => {
        const isOpen = subContainer.classList.contains("open");

        closeAllSubTiles();

        if (!isOpen) {
          subContainer.classList.add("open");
          if (arrow) arrow.classList.add("rotate");
        }
      });
    } else {
      tile.addEventListener("click", () => {
        closeAllSubTiles();
        loadModule(moduleName);
      });
    }
  });

  function closeAllSubTiles() {
    document
      .querySelectorAll(".sub-tile-container")
      .forEach((sub) => sub.classList.remove("open"));
    document
      .querySelectorAll(".tile-arrow")
      .forEach((arrow) => arrow.classList.remove("rotate"));
  }

  // SUB-TILE CLICK
  document.querySelectorAll(".sub-tile").forEach((sub) => {
    sub.addEventListener("click", () => {
      closeAllSubTiles();
      loadModule(sub.dataset.module);
    });
  });

  // -------------------------------------------------------------
  // MODULE LOADING
  // -------------------------------------------------------------
  async function loadModule(moduleName) {
    moduleContainer.innerHTML = `
      <div class="glass-card" style="padding: 20px; margin-top: 20px;">
        <div style="font-size: 20px; margin-bottom: 10px;">Loading ${moduleName}...</div>
      </div>
    `;

    try {
      const response = await fetch(`/modals/${moduleName}.html`);
      const html = await response.text();
      moduleContainer.innerHTML = html;

      // Load JS AFTER HTML is inserted
      import(`/js_new/${moduleName}.js?v=${Date.now()}`).catch(() => {});
    } catch (error) {
      moduleContainer.innerHTML = `
        <div class="glass-card" style="padding: 20px; margin-top: 20px;">
          <div style="color: #ef4444;">Failed to load module: ${moduleName}</div>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------------
  document.getElementById("btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "/login.html";
  });

  // CHANGE PASSWORD
  document.getElementById("btnChangePassword").addEventListener("click", () => {
    window.location.href = "/modals/changePassword.html";
  });

  // -------------------------------------------------------------
  // ⭐ PENDING DELETE REQUESTS WIDGET
  // -------------------------------------------------------------
  const pendingRequestsCard = document.getElementById("pendingRequestsCard");
  const pendingRequestsCount = document.getElementById("pendingRequestsCount");
  const pendingBadge = document.getElementById("pendingBadge");

  // Make widget clickable → open approval screen
  pendingRequestsCard.style.cursor = "pointer";
  pendingRequestsCard.addEventListener("click", () => {
    window.location.href = "/approval.html";
  });

  async function loadPendingRequestsCount() {
    const role = sessionStorage.getItem("role");
    const locationId = sessionStorage.getItem("location_id");

    if (!pendingRequestsCard) return;

    // Hide for non-admin roles
    if (role !== "Super Admin" && role !== "Location Admin") {
      pendingRequestsCard.style.display = "none";
      return;
    }

    let query = supabase
      .from("delete_requests")
      .select(`
        id,
        user_id,
        users:user_id (location_id)
      `)
      .eq("status", "pending");

    if (role === "Location Admin") {
      query = query.eq("users.location_id", locationId);
    }

    const { data, error } = await query;

    if (error) return;

    const count = data.length;
    pendingRequestsCount.textContent = count;

    // Badge + pulse logic
    if (count > 0) {
      pendingBadge.textContent = count;
      pendingBadge.classList.remove("hidden");
      pendingRequestsCard.classList.add("pulse");
    } else {
      pendingBadge.classList.add("hidden");
      pendingRequestsCard.classList.remove("pulse");
    }
  }

  // Auto-refresh every 10 seconds
  setInterval(loadPendingRequestsCount, 10000);
});
