// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "/js_new/supabaseClient.js"; 
// Make sure this file exports: export const supabase = createClient(URL, KEY);

// -------------------------------------------------------------
// ELEMENTS
// -------------------------------------------------------------
const tableBody = document.getElementById("vendorTableBody");
const searchInput = document.getElementById("vendorSearch");
const filterStatus = document.getElementById("vendorFilterStatus");

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

const saveBtn = document.getElementById("vendorSaveBtn");
const deleteBtn = document.getElementById("vendorDeleteBtn");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let userRole = null;
let userLocationId = null;

let currentPage = 1;
const pageSize = 20;

let lastSavedVendorId = null;

// -------------------------------------------------------------
// LOAD USER PROFILE (ROLE + LOCATION)
// -------------------------------------------------------------
async function loadUserProfile() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return;

  const userId = authData.user.id;

  const { data, error } = await supabase
    .from("Users")
    .select("role, location_id")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("User load error:", error);
    return;
  }

  userRole = data.role;
  userLocationId = data.location_id;

  applyRolePermissions();
}
// -------------------------------------------------------------
// APPLY ROLE PERMISSIONS
// -------------------------------------------------------------
function applyRolePermissions() {
  deleteBtn.disabled = true; // default

  if (userRole === "SuperAdmin") {
    formId.disabled = true; // cannot create
    deleteBtn.disabled = true;
  }

  if (userRole === "LocationAdmin") {
    formId.disabled = false;
    deleteBtn.disabled = true; // enabled only after selecting vendor
  }

  if (userRole === "Manager" || userRole === "Audit") {
    formId.disabled = false;
    deleteBtn.disabled = true;
  }
}

// -------------------------------------------------------------
// PHONE FORMAT (000-000-0000)
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
// LOAD VENDORS
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

  if (userRole !== "SuperAdmin") {
    query = query.eq("location_id", userLocationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Load error:", error);
    return;
  }

  renderTable(data);
  pageInfo.textContent = `Page ${currentPage}`;
}
// -------------------------------------------------------------
// RENDER TABLE
// -------------------------------------------------------------
function renderTable(rows) {
  tableBody.innerHTML = "";

  const search = searchInput.value.toLowerCase();
  const statusFilter = filterStatus.value;

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

    row.innerHTML = `
      <td>${v.VendorId}</td>
      <td>${v.VendorName}</td>
      <td>${v.VenContPerPhone}</td>
      <td>${v.VenStatus}</td>
    `;

    if (v.VendorId === lastSavedVendorId) {
      row.style.background = "#d4edda";
      setTimeout(() => {
        row.style.transition = "background 1.5s ease";
        row.style.background = "transparent";
      }, 300);
    }

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

  if (error) return;

  formId.value = data.VendorId;
  formName.value = data.VendorName;
  formContact.value = data.VenContPerson;
  formPhone.value = data.VenContPerPhone;
  formAddress.value = data.VenAddress;
  formStatus.value = data.VenStatus;
  formNotes.value = data.VenNotes;

  if (userRole === "LocationAdmin") {
    deleteBtn.disabled = false;
  }
}
// -------------------------------------------------------------
// SAVE VENDOR
// -------------------------------------------------------------
async function saveVendor() {
  const id = formId.value.trim();

  if (!id) return showToast("Vendor ID required", "error");
  if (formPhone.value.length !== 12)
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
  };

  if (userRole === "SuperAdmin") {
    vendorData.location_id = userLocationId; // keep existing
  } else {
    vendorData.location_id = userLocationId;
  }

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
    showToast("Vendor updated", "success");
  } else {
    vendorData.createdAt = Date.now();
    result = await supabase.from("Vendors").insert(vendorData);
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
  if (userRole !== "LocationAdmin")
    return showToast("Only Location Admin can delete", "error");

  const id = formId.value.trim();
  if (!id) return showToast("Select a vendor first", "warning");

  if (!confirm("Delete this vendor?")) return;

  await supabase.from("Vendors").delete().eq("VendorId", id);

  showToast("Vendor deleted", "warning");
  clearForm();
  loadVendors(true);
}
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

searchInput.addEventListener("input", () => loadVendors(true));
filterStatus.addEventListener("change", () => loadVendors(true));

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

// INITIAL LOAD
(async () => {
  await loadUserProfile();
  await loadVendors(true);
})();
