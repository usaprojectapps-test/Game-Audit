// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// Debug helper
const IS_DEV =
  window.location.hostname === "localhost" ||
  window.location.hostname.endsWith(".local");

function dbg(...args) {
  if (IS_DEV) console.log(...args);
}

dbg("vendors.js executed — top of file", { ready: document.readyState });

// -------------------------------------------------------------
// AUTO INITIALIZER
// -------------------------------------------------------------
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => initVendorsModule(), 100);
  });
} else {
  setTimeout(() => initVendorsModule(), 100);
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
    const formLocation = document.getElementById("vendorFormLocation");

    const saveBtn = document.getElementById("VendorSaveBtn");
    const deleteBtn = document.getElementById("VendorDeleteBtn");

    if (!tableBody) return;

    // -------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------
    let userRole = null;
    let userLocationId = null;

    let currentPage = 1;
    const pageSize = 20;

    let locationMap = {};

    // -------------------------------------------------------------
    // LOAD USER PROFILE
    // -------------------------------------------------------------
    async function loadUserProfile() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData?.session) {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData?.user) return;

          const meta = userData.user.user_metadata || {};
          userRole = meta.role || null;
          userLocationId = meta.location_id || null;
          applyRolePermissions();
          return;
        }

        const meta = sessionData.session.user.user_metadata || {};
        userRole = meta.role || null;
        userLocationId = meta.location_id || null;

        applyRolePermissions();
      } catch (err) {
        console.error("Error loading profile:", err);
      }
    }

    // -------------------------------------------------------------
    // APPLY ROLE PERMISSIONS
    // -------------------------------------------------------------
    function applyRolePermissions() {
      const role = (userRole || "").toLowerCase();

      // Hide location filter by default
      if (filterLocation) filterLocation.style.display = "none";

      // Hide form location by default
      if (formLocation) formLocation.style.display = "none";

      // SuperAdmin → show all locations
      if (role.includes("super")) {
        if (filterLocation) filterLocation.style.display = "block";
        if (formLocation) formLocation.style.display = "block";
      }

      // LocationAdmin → show only their location
      if (role.includes("location")) {
        if (formLocation) formLocation.style.display = "block";
      }

      // Other roles → location auto-filled
      if (!role.includes("super") && !role.includes("location")) {
        if (formLocation) {
          formLocation.style.display = "none";
        }
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
    }

    // -------------------------------------------------------------
    // LOAD LOCATIONS
    // -------------------------------------------------------------
    async function loadLocationsMap() {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id, name");

        if (error) return;

        locationMap = Object.fromEntries(
          (data || []).map((loc) => [loc.id, loc.name])
        );

        // Populate filter dropdown
        if (filterLocation) {
          filterLocation.innerHTML = `<option value="">All Locations</option>`;
          data.forEach((loc) => {
            const opt = document.createElement("option");
            opt.value = loc.id;
            opt.textContent = loc.name;
            filterLocation.appendChild(opt);
          });
        }

        // Populate form dropdown
        if (formLocation) {
          formLocation.innerHTML = `<option value="">Select Location</option>`;
          data.forEach((loc) => {
            const opt = document.createElement("option");
            opt.value = loc.id;
            opt.textContent = loc.name;
            formLocation.appendChild(opt);
          });
        }
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

        const { data, error } = await query;
        if (error) return;

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

      rows.forEach((v) => {
        if (
          search &&
          !(
            (v.VendorName || "").toLowerCase().includes(search) ||
            (v.VendorId || "").toLowerCase().includes(search)
          )
        )
          return;

        if (statusFilter && v.VenStatus !== statusFilter) return;

        const row = document.createElement("tr");
        row.dataset.id = v.VendorId;

        row.innerHTML = `
          <td>${v.VendorId}</td>
          <td>${v.VendorName}</td>
          <td>${v.VenContPhone || "—"}</td>
          <td>${v.VenStatus}</td>
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
        const { data, error } = await supabase
          .from("Vendors")
          .select("*")
          .eq("VendorId", id)
          .single();

        if (error || !data) return;

        formId.value = data.VendorId;
        formName.value = data.VendorName;
        formContact.value = data.VenContPerson;
        formPhone.value = data.VenContPhone;
        formAddress.value = data.VenAddress;
        formStatus.value = data.VenStatus;
        formNotes.value = data.VenNotes || "";
        formLocation.value = data.location_id || "";

        deleteBtn.disabled = false;
      } catch (err) {
        console.error("loadVendorDetails error:", err);
      }
    }

    // -------------------------------------------------------------
    // SAVE VENDOR
    // -------------------------------------------------------------
    async function saveVendor() {
      const id = formId.value.trim();
      if (!id) return showToast("Vendor ID required", "error");

      let selectedLocation = formLocation.value;

      // SuperAdmin must choose a location
      if (userRole === "SuperAdmin" && !selectedLocation) {
        return showToast("Select a location", "error");
      }

      // Non-super roles → force their own location
      if (userRole !== "SuperAdmin") {
        selectedLocation = userLocationId;
      }

      const vendorData = {
        VendorId: id,
        VendorName: formName.value.trim(),
        VenContPerson: formContact.value.trim(),
        VenContPhone: formPhone.value.trim(),
        VenAddress: formAddress.value.trim(),
        VenStatus: formStatus.value,
        VenNotes: formNotes.value.trim(),
        location_id: selectedLocation,
        updatedAt: Date.now(),
      };

      try {
        const { data: exists } = await supabase
          .from("Vendors")
          .select("VendorId")
          .eq("VendorId", id)
          .maybeSingle();

        let result;

        if (exists) {
          result = await supabase
            .from("Vendors")
            .update(vendorData)
            .eq("VendorId", id);

          if (result.error) {
            return showToast("Failed to update vendor", "error");
          }

          showToast("Vendor updated", "success");
        } else {
          vendorData.createdAt = Date.now();

          result = await supabase.from("Vendors").insert(vendorData);

          if (result.error) {
            return showToast("Failed to create vendor", "error");
          }

          showToast("Vendor created", "success");
        }

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
      const id = formId.value.trim();
      if (!id) return showToast("Select a vendor first", "warning");

      if (!confirm("Delete this vendor?")) return;

      try {
        const { error } = await supabase
          .from("Vendors")
          .delete()
          .eq("VendorId", id);

        if (error) {
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
      formId.value = "";
      formName.value = "";
      formContact.value = "";
      formPhone.value = "";
      formAddress.value = "";
      formStatus.value = "Active";
      formNotes.value = "";
      formLocation.value = "";
      deleteBtn.disabled = true;
    }

    // -------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------
    searchInput?.addEventListener("input", () => loadVendors(true));
    filterStatus?.addEventListener("change", () => loadVendors(true));
    filterLocation?.addEventListener("change", () => loadVendors(true));

    nextPageBtn?.addEventListener("click", () => {
      currentPage++;
      loadVendors();
    });

    prevPageBtn?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadVendors();
      }
    });

    saveBtn?.addEventListener("click", saveVendor);
    deleteBtn?.addEventListener("click", deleteVendor);

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
}

window.initVendorsModule = initVendorsModule;
