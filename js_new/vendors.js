// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

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
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    console.error("No session found");
    return;
  }

  const jwt = sessionData.session.user.user_metadata;

    userRole = jwt.role;
    userLocationId = jwt.location_id;

    console.log("User role:", userRole);
    console.log("Location ID:", userLocationId);
  
    applyRolePermissions();
}

// -------------------------------------------------------------
// APPLY ROLE PERMISSIONS
// -------------------------------------------------------------
function applyRolePermissions() {
  deleteBtn.disabled = true;

  if (userRole === "SuperAdmin") {
    formId.disabled = false;
    filterLocation.style.display = "block";
  }

  if (userRole === "LocationAdmin") {
    formId.disabled = false;
  }

  if (userRole === "Manager" || userRole === "Audit") {
    formId.disabled = false;
  }
}

// -------------------------------------------------------------
// PHONE FORMAT
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// LOCATION MAP
// -------------------------------------------------------------
async function loadLocationsMap() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name");

  if (error || !data) {
    console.error("Location load error:", error);
    locationMap = {};
    return;
  }

  locationMap = Object.fromEntries(data.map(loc => [loc.id, loc.name]));

  if (userRole === "SuperAdmin") {
    filterLocation.innerHTML = `<option value="">All Locations</option>`;
    data.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      filterLocation.appendChild(opt);
    });
  }
}

// -------------------------------------------------------------
// LOAD Vendors
// -------------------------------------------------------------
async function loadVendors(reset = false) {
  if (reset) currentPage = 1;

  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("Vendors")
    .select("*")
    .order("VendorName", { ascending: true })
    .range(from, to);

  if (userRole === "SuperAdmin") {
    const selectedLoc = filterLocation.value;
    if (selectedLoc) query = query.eq("location_id", selectedLoc);
  } else if (userLocationId) {
    query = query.eq("location_id", userLocationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Load error:", error);
    return;
  }

  renderTable(data || []);
  pageInfo.textContent = `Page ${currentPage}`;
}

// -------------------------------------------------------------
// RENDER TABLE
// -------------------------------------------------------------
function renderTable(rows) {
  tableBody.innerHTML = "";

  const search = searchInput.value.toLowerCase();
  const statusFilter = filterStatus.value;
  const highlightLocation = filterLocation.value || userLocationId;

  rows.forEach((v) => {
    if (
      search &&
      !(
        v.VendorName?.toLowerCase().includes(search) ||
        v.VendorId?.toLowerCase().includes(search)
      )
    ) return;

    if (statusFilter && v.VenStatus !== statusFilter) return;

    const row = document.createElement("tr");
    row.dataset.id = v.VendorId;

    if (v.location_id === highlightLocation) {
      row.style.background = "rgba(0, 150, 255, 0.15)";
    }

    row.innerHTML = `
      <td>${v.VendorId}</td>
      <td>${v.VendorName}</td>
      <td>${v.VenContPerPhone || "—"}</td>
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
  const { data, error } = await supabase
    .from("Vendors")
    .select("*")
    .eq("VendorId", id)
    .single();

  if (error || !data) return;

  formId.value = data.VendorId;
  formName.value = data.VendorName;
  formContact.value = data.VenContPerson || "";
  formPhone.value = data.VenContPerPhone || "";
  formAddress.value = data.VenAddress || "";
  formStatus.value = data.VenStatus || "Active";
  formNotes.value = data.VenNotes || "";

  deleteBtn.disabled = false;
}

// -------------------------------------------------------------
// SAVE VENDOR
// -------------------------------------------------------------
async function saveVendor() {
  const id = formId.value.trim();

  if (!id) return showToast("Vendor ID required", "error");
  if (formPhone.value && formPhone.value.length !== 12)
    return showToast("Phone must be 000-000-0000", "error");

  const vendorData = {
    VendorId: id,
    VendorName: formName.value.trim(),
    VenContPerson: formContact.value.trim(),
    VenContPerPhone: formPhone.value.trim(),
    VenAddress: formAddress.value.trim(),
    VenStatus: formStatus.value,
    VenNotes: formNotes.value.trim(),
    updatedAt: Date.now(),
    location_id: userLocationId
  };

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
}

// -------------------------------------------------------------
// DELETE VENDOR
// -------------------------------------------------------------
async function deleteVendor() {
  const id = formId.value.trim();
  if (!id) return showToast("Select a vendor first", "warning");

  if (!confirm("Delete this vendor?")) return;

  const { error } = await supabase
    .from("Vendors")
    .delete()
    .eq("VendorId", id);

  if (error) {
    console.error("Delete error:", error);
    return showToast("Failed to delete vendor", "error");
  }

  showToast("Vendor deleted", "warning");
  clearForm();
  loadVendors(true);
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
  deleteBtn.disabled = true;
}

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
searchInput.addEventListener("input", () => loadVendors(true));
filterStatus.addEventListener("change", () => loadVendors(true));
filterLocation.addEventListener("change", () => loadVendors(true));

nextPageBtn.addEventListener("click", () => {
  currentPage++;
  loadVendors();
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadVendors();
  }
});

saveBtn.addEventListener("click", saveVendor);
deleteBtn.addEventListener("click", deleteVendor);

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
(async () => {
  await loadUserProfile();
  await loadLocationsMap();
  await loadVendors(true);
})();
