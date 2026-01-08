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

    if (error) {
      console.error("Error getting session:", error);
      window.location.href = "/login.html";
      return;
    }

    if (!session) {
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

    // Persist to sessionStorage for other pages if needed
    sessionStorage.setItem("name", name);
    sessionStorage.setItem("role", role);
    if (locationId) {
      sessionStorage.setItem("location_id", locationId);
    }

    // Apply permissions based on role (same as old "department")
    applyPermissions(role);
  }

  // -------------------------------------------------------------
  // PERMISSIONS (UNCHANGED LOGIC, NOW USING ROLE)
  // -------------------------------------------------------------
  function applyPermissions(deptOrRole) {
    tiles.forEach((tile) => {
      const allowed = tile.dataset.dept.split(",");
      if (!allowed.includes(deptOrRole) && !allowed.includes("Admin")) {
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
  // MODULE LOADING (UNCHANGED)
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
      if (moduleName === "vendors") {
        import(`/js_new/vendors.js?v=${Date.now()}`);
      }

      if (moduleName === "machines") {
        import(`/js_new/machines.js?v=${Date.now()}`);
      }

      if (moduleName === "users") {
        import(`/js_new/users.js?v=${Date.now()}`);
      }

      if (moduleName === "auditEntry" || moduleName === "auditDaily") {
        import(`/js_new/audit.js?v=${Date.now()}`);
      }

      if (moduleName === "mspEntry" || moduleName === "mspDaily") {
        import(`/js_new/msp.js?v=${Date.now()}`);
      }

      if (moduleName === "silverEntry" || moduleName === "silverDaily") {
        import(`/js_new/silver.js?v=${Date.now()}`);
      }

      if (moduleName === "reports") {
        import(`/js_new/reports.js?v=${Date.now()}`);
      }

      if (moduleName === "general") {
        import(`/js_new/general.js?v=${Date.now()}`);
      }
    } catch (error) {
      console.error(error);
      moduleContainer.innerHTML = `
        <div class="glass-card" style="padding: 20px; margin-top: 20px;">
          <div style="color: #ef4444;">Failed to load module: ${moduleName}</div>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // LOGOUT (SUPABASE)
  // -------------------------------------------------------------
  document
    .getElementById("btnLogout")
    .addEventListener("click", async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Error during sign out:", e);
      }
      sessionStorage.clear();
      window.location.href = "/login.html";
    });

  // CHANGE PASSWORD
  document
    .getElementById("btnChangePassword")
    .addEventListener("click", () => {
      window.location.href = "/modals/changePassword.html";
    });
});
