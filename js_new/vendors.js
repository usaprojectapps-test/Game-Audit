// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// ----------------------
// Debug helper (paste here)
// ----------------------
const IS_DEV = window.location.hostname === "localhost" || window.location.hostname.endsWith(".local");

function dbg(...args) {
  if (IS_DEV) console.log(...args);
}

dbg("vendors.js executed — top of file", { ready: document.readyState });

// -------------------------------------------------------------
// AUTO INITIALIZER (robust)
// -------------------------------------------------------------
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    dbg("DOMContentLoaded fired (listener)");
    setTimeout(() => {
      dbg("Calling initVendorsModule() from DOMContentLoaded");
      initVendorsModule();
    }, 100);
  });
} else {
  dbg("Document already ready, calling initVendorsModule() immediately");
  setTimeout(() => {
    dbg("Calling initVendorsModule() from readyState !== loading");
    initVendorsModule();
  }, 100);
}

// -------------------------------------------------------------
// MAIN MODULE FUNCTION
// -------------------------------------------------------------
function initVendorsModule() {
  dbg("Vendors module initializing...");
  try {
    // -------------------------------------------------------------
    // ELEMENTS
    // -------------------------------------------------------------
    const tableBody = document.getElementById("vendorTableBody");
    const searchInput = document.getElementById("vendorSearch");
    const filterStatus = document.getElementById("vendorFilterStatus");
    const filterLocation = document.getElementById("vendorFilterLocation");

    const pageInfo = document.getElementById("vendorPageInfo");
    const prevPageBtn = document.getElementById("vendorPrevPage");
    const nextPageBtn = document.getElementById("vendorNextPage");

    const formId = document.getElementById("vendorFormId");
    const formName = document.getElementById("vendorFormName");
    const formContact = document.getElementById("vendorFormContactPerson");
    const formPhone = document.getElementById("vendorFormPhone");
    const formAddress = document.getElementById("vendorFormAddress");
    const formStatus = document.getElementById("vendorFormStatus");
    const formNotes = document.getElementById("vendorFormNotes");

    const saveBtn = document.getElementById("VendorSaveBtn");
    const deleteBtn = document.getElementById("VendorDeleteBtn");

    dbg("Filter element:", filterLocation);

    if (!tableBody) {
      console.warn("Vendors HTML not ready yet.");
      return;
    }

    // -------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------
    let userRole = null;
    let userLocationId = null;

    let currentPage = 1;
    const pageSize = 20;

    let lastSavedVendorId = null;
    let locationMap = {};

    // -------------------------------------------------------------
    // LOAD USER PROFILE
    // -------------------------------------------------------------
    async function loadUserProfile() {
      dbg("🔥 loadUserProfile() CALLED");

      // Try to get session; if blocked by browser privacy, log and continue.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        dbg("🔥 sessionData:", sessionData);

        if (!sessionData?.session) {
          console.warn("No session found (getSession returned null).");
          // Try fallback: get user (may also be null)
          const { data: userData } = await supabase.auth.getUser();
          dbg("🔥 fallback getUser:", userData);
          if (!userData?.user) return;
          const meta = userData.user.user_metadata || {};
          userRole = meta.role || null;
          userLocationId = meta.location_id || null;
          dbg("User role (fallback):", userRole);
          dbg("Location ID (fallback):", userLocationId);
          applyRolePermissions();
          return;
        }

        const jwt = sessionData.session.user.user_metadata || {};
        dbg("🔥 JWT metadata:", jwt);

        userRole = jwt.role || null;
        userLocationId = jwt.location_id || null;

        dbg("User role:", userRole);
        dbg("Location ID:", userLocationId);

        applyRolePermissions();
      } catch (err) {
        console.error("Error while loading session/profile:", err);
      }
    }

    // -------------------------------------------------------------
    // APPLY ROLE PERMISSIONS
    // -------------------------------------------------------------
      function applyRolePermissions() {
      if (deleteBtn) deleteBtn.disabled = true;

      // hide by default
      if (filterLocation) filterLocation.style.display = "none";

      const role = (userRole || "").toString().trim().toLowerCase();

      if (role.includes("super")) {
        if (formId) formId.disabled = false;
        if (filterLocation) filterLocation.style.display = "block";
        dbg("Showing location filter for SuperAdmin (role match)", userRole);
      }

      if (role.includes("location")) {
        if (formId) formId.disabled = false;
        dbg("LocationAdmin permissions applied");
      }

      if (role.includes("manager") || role.includes("audit")) {
        if (formId) formId.disabled = false;
        dbg("Manager/Audit permissions applied");
      }
    }

    // -------------------------------------------------------------
    // PHONE FORMAT
    // -------------------------------------------------------------
    if (formPhone) {
      formPhone.addEventListener("input", () => {
        let v = formPhone.value.replace(/\D/g, "");
        if (v.length > 3 && v.length <= 6) {
          v = v.replace(/(\d{3})(\d+)/, "$1-$2");
        } else if (v.length > 6) {
          v = v.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
        }
        formPhone.value = v;
      });

      formPhone.addEventListener("blur", () => {
        if (formPhone.value && formPhone.value.length !== 12) {
          showToast("Phone must be 000-000-0000", "error");
        }
      });
    }

    // -------------------------------------------------------------
    // LOAD LOCATIONS
    // -------------------------------------------------------------
    async function loadLocationsMap() {
      try {
        const { data, error } = await supabase.from("locations").select("id, name");
        if (error) {
          console.error("Location load error:", error);
          locationMap = {};
          return;
        }

        locationMap = Object.fromEntries((data || []).map(loc => [loc.id, loc.name]));

        // Populate dropdown for everyone (so it's visible during debugging).
        if (filterLocation) {
          filterLocation.innerHTML = `<option value="">All Locations</option>`;
          (data || []).forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc.id;
            opt.textContent = loc.name;
            filterLocation.appendChild(opt);
          });
          // show it for debugging; applyRolePermissions will hide/show properly afterwards 
            filterLocation.style.display = "block";
        }

        dbg("Populated location dropdown with:", data);
      } catch (err) {
        console.error("loadLocationsMap error:", err);
      }
    }

    // -------------------------------------------------------------
    // LOAD VENDORS
    // -------------------------------------------------------------
    async function loadVendors(reset = false) {
      if (reset) currentPage = 1;

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      try {
        let query = supabase
          .from("Vendors")
          .select("*")
          .order("VendorName", { ascending: true })
          .range(from, to);

        // TEMP: disabled filtering while debugging; uncomment and adjust when ready
        // if (userRole === "SuperAdmin") {
        //   const selectedLoc = filterLocation?.value;
        //   if (selectedLoc) query = query.eq("location_id", selectedLoc);
        // } else if (userLocationId) {
        //   query = query.eq("location_id", userLocationId);
        // }

        const { data, error } = await query;
        if (error) {
          console.error("Load error:", error);
          return;
        }

        dbg("Loaded vendors:", data);
        renderTable(data || []);
        if (pageInfo) pageInfo.textContent = `Page ${currentPage}`;
      } catch (err) {
        console.error("loadVendors error:", err);
      }
    }

    // -------------------------------------------------------------
    // RENDER TABLE
    // -------------------------------------------------------------
    function renderTable(rows) {
      tableBody.innerHTML = "";

      const search = (searchInput?.value || "").toLowerCase();
      const statusFilter = filterStatus?.value || "";
      const highlightLocation = (filterLocation?.value) || userLocationId;

      (rows || []).forEach((v) => {
        if (
          search &&
          !(
            (v.VendorName || "").toLowerCase().includes(search) ||
            (v.VendorId || "").toLowerCase().includes(search)
          )
        ) return;

        if (statusFilter && v.VenStatus !== statusFilter) return;

        const row = document.createElement("tr");
        row.dataset.id = v.VendorId || "";

        if (v.location_id === highlightLocation) {
          row.style.background = "rgba(0, 150, 255, 0.15)";
        }

        // Use the correct phone column name: VenContPhone
        row.innerHTML = `
          <td>${v.VendorId || ""}</td>
          <td>${v.VendorName || ""}</td>
          <td>${v.VenContPhone || "—"}</td>
          <td>${v.VenStatus || "—"}</td>
          <td>${locationMap[v.location_id] || "Unknown"}</td>
        `;

        row.addEventListener("click", () => loadVendorDetails(v.VendorId));
        tableBody.appendChild(row);
      });
    }

    // -------------------------------------------------------------
    // LOAD SINGLE VENDOR
    // -------------------------------------------------------------
    async function loadVendorDetails(id) {
      try {
        const { data, error } = await supabase.from("Vendors").select("*").eq("VendorId", id).single();
        if (error || !data) {
          if (error) console.error("loadVendorDetails error:", error);
          return;
        }

        if (formId) formId.value = data.VendorId || "";
        if (formName) formName.value = data.VendorName || "";
        if (formContact) formContact.value = data.VenContPerson || "";
        if (formPhone) formPhone.value = data.VenContPhone || "";
        if (formAddress) formAddress.value = data.VenAddress || "";
        if (formStatus) formStatus.value = data.VenStatus || "Active";
        if (formNotes) formNotes.value = data.VenNotes || "";

        if (deleteBtn) deleteBtn.disabled = false;
      } catch (err) {
        console.error("loadVendorDetails error:", err);
      }
    }

    // -------------------------------------------------------------
    // SAVE VENDOR
    // -------------------------------------------------------------
    async function saveVendor() {
      const id = formId?.value.trim();
      if (!id) return showToast("Vendor ID required", "error");
      if (formPhone?.value && formPhone.value.length !== 12) return showToast("Phone must be 000-000-0000", "error");

      const vendorData = {
        VendorId: id,
        VendorName: formName?.value.trim(),
        VenContPerson: formContact?.value.trim(),
        VenContPhone: formPhone?.value.trim(), // correct key
        VenAddress: formAddress?.value.trim(),
        VenStatus: formStatus?.value,
        VenNotes: formNotes?.value.trim(),
        updatedAt: Date.now(),
        location_id: userLocationId
      };

      try {
        const { data: exists } = await supabase.from("Vendors").select("VendorId").eq("VendorId", id).maybeSingle();

        let result;
        if (exists) {
          result = await supabase.from("Vendors").update(vendorData).eq("VendorId", id);
          if (result.error) {
            console.error("Update error:", result.error);
            return showToast("Failed to update vendor", "error");
          }
          showToast("Vendor updated", "success");
        } else {
          vendorData.createdAt = Date.now();
          result = await supabase.from("Vendors").insert(vendorData);
          if (result.error) {
            console.error("Insert error:", result.error);
            return showToast("Failed to create vendor", "error");
          }
          showToast("Vendor created", "success");
        }

        lastSavedVendorId = id;
        clearForm();
        loadVendors(true);
      } catch (err) {
        console.error("saveVendor error:", err);
      }
    }

    // -------------------------------------------------------------
    // DELETE VENDOR
    // -------------------------------------------------------------
    async function deleteVendor() {
      const id = formId?.value.trim();
      if (!id) return showToast("Select a vendor first", "warning");
      if (!confirm("Delete this vendor?")) return;

      try {
        const { error } = await supabase.from("Vendors").delete().eq("VendorId", id);
        if (error) {
          console.error("Delete error:", error);
          return showToast("Failed to delete vendor", "error");
        }
        showToast("Vendor deleted", "warning");
        clearForm();
        loadVendors(true);
      } catch (err) {
        console.error("deleteVendor error:", err);
      }
    }

    // -------------------------------------------------------------
    // CLEAR FORM
    // -------------------------------------------------------------
    function clearForm() {
      if (formId) formId.value = "";
      if (formName) formName.value = "";
      if (formContact) formContact.value = "";
      if (formPhone) formPhone.value = "";
      if (formAddress) formAddress.value = "";
      if (formStatus) formStatus.value = "Active";
      if (formNotes) formNotes.value = "";
      if (deleteBtn) deleteBtn.disabled = true;
    }

    // -------------------------------------------------------------
    // EVENTS (attach only if elements exist)
    // -------------------------------------------------------------
    if (searchInput) searchInput.addEventListener("input", () => loadVendors(true));
    if (filterStatus) filterStatus.addEventListener("change", () => loadVendors(true));
    if (filterLocation) filterLocation.addEventListener("change", () => loadVendors(true));
    if (nextPageBtn) nextPageBtn.addEventListener("click", () => { currentPage++; loadVendors(); });
    if (prevPageBtn) prevPageBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadVendors(); } });
    if (saveBtn) saveBtn.addEventListener("click", saveVendor);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteVendor);

    // -------------------------------------------------------------
    // INITIAL LOAD
    // -------------------------------------------------------------
    (async () => {
      await loadUserProfile();
      await loadLocationsMap();
      setTimeout(() => loadVendors(true), 50);
    })();
  } catch (err) {
    console.error("initVendorsModule error:", err);
  }
} // END initVendorsModule

// Make function available globally
window.initVendorsModule = initVendorsModule;
