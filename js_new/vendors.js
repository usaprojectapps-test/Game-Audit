// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { db, auth } from "/js_new/firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import { showToast } from "/js_new/toast.js";

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
// STATE: PAGINATION + USER CONTEXT
// -------------------------------------------------------------
let lastVisible = null;
let firstVisible = null;
let currentPage = 1;

let lastSavedVendorId = null;

let userRole = null;
let userLocationId = null;

// -------------------------------------------------------------
// LOAD USER PROFILE (ROLE + LOCATION)
// -------------------------------------------------------------
async function loadUserProfile() {
  const user = auth.currentUser;
  if (!user) {
    console.warn("No authenticated user found.");
    return;
  }

  const userRef = doc(db, "Users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    console.warn("User profile not found in Users collection.");
    return;
  }

  const u = snap.data();
  userRole = u.role || null;
  userLocationId = u.location_id || null;

  applyRolePermissions();
}

// -------------------------------------------------------------
// APPLY ROLE-BASED PERMISSIONS TO UI
// -------------------------------------------------------------
function applyRolePermissions() {
  // Default: enable everything, then restrict
  saveBtn.disabled = false;
  deleteBtn.disabled = false;
  formId.disabled = false;

  // SuperAdmin: view + edit only (no create, no delete)
  if (userRole === "SuperAdmin") {
    deleteBtn.disabled = true;
    // Prevent creating new vendors: only allow editing existing
    // We can enforce this by disabling Vendor ID field
    formId.disabled = true;
  }

  // LocationAdmin: full CRUD (view + create + edit + delete)
  if (userRole === "LocationAdmin") {
    saveBtn.disabled = false;
    deleteBtn.disabled = true; // will enable only when a vendor is loaded
    formId.disabled = false;
  }

  // Manager + Audit: view + create + edit (no delete)
  if (userRole === "Manager" || userRole === "Audit") {
    deleteBtn.disabled = true;
    formId.disabled = false;
  }
}

// -------------------------------------------------------------
// AUTO-FORMAT PHONE NUMBER + VALIDATION
// -------------------------------------------------------------
formPhone.addEventListener("input", () => {
  let value = formPhone.value.replace(/\D/g, "");

  if (value.length > 3 && value.length <= 6) {
    value = value.replace(/(\d{3})(\d+)/, "$1-$2");
  } else if (value.length > 6) {
    value = value.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
  }

  formPhone.value = value;
  formPhone.classList.remove("input-error");
});

formPhone.addEventListener("blur", () => {
  if (formPhone.value && formPhone.value.length !== 12) {
    formPhone.classList.add("input-error");
    showToast("Invalid phone number", "error");
  }
});

// -------------------------------------------------------------
// BUILD QUERY BASED ON ROLE + LOCATION
// -------------------------------------------------------------
function buildVendorQuery(paginateFrom = null) {
  const baseCollection = collection(db, "Vendors");

  const isSuperAdmin = userRole === "SuperAdmin";

  const constraints = [];

  if (!isSuperAdmin && userLocationId) {
    constraints.push(where("location_id", "==", userLocationId));
  }

  constraints.push(orderBy("name"));
  constraints.push(limit(20));

  if (paginateFrom) {
    constraints.splice(constraints.length - 1, 0, startAfter(paginateFrom));
  }

  return query(baseCollection, ...constraints);
}

// -------------------------------------------------------------
// LOAD VENDORS
// -------------------------------------------------------------
async function loadVendors(reset = false) {
  if (!userRole) {
    await loadUserProfile();
  }

  if (reset) {
    lastVisible = null;
    currentPage = 1;
  }

  const q = buildVendorQuery(lastVisible);
  const snap = await getDocs(q);

  if (snap.empty) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:10px;">
          No vendors found
        </td>
      </tr>`;
    pageInfo.textContent = `Page ${currentPage}`;
    return;
  }

  firstVisible = snap.docs[0];
  lastVisible = snap.docs[snap.docs.length - 1];

  renderTable(snap.docs);
  pageInfo.textContent = `Page ${currentPage}`;
}

// -------------------------------------------------------------
// RENDER TABLE
// -------------------------------------------------------------
function renderTable(docs) {
  tableBody.innerHTML = "";

  const search = searchInput.value.toLowerCase();
  const statusFilter = filterStatus.value;

  docs.forEach((docSnap) => {
    const v = docSnap.data();

    if (
      search &&
      !(
        v.name?.toLowerCase().includes(search) ||
        docSnap.id.toLowerCase().includes(search)
      )
    ) {
      return;
    }

    if (statusFilter && v.status !== statusFilter) return;

    const row = document.createElement("tr");
    row.dataset.id = docSnap.id;

    row.innerHTML = `
      <td>${docSnap.id}</td>
      <td>${v.name || ""}</td>
      <td>${v.phone || ""}</td>
      <td>${v.status || ""}</td>
    `;

    if (docSnap.id === lastSavedVendorId) {
      row.style.background = "#d4edda";
      setTimeout(() => {
        row.style.transition = "background 1.5s ease";
        row.style.background = "transparent";
      }, 300);

      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    row.addEventListener("click", () => loadVendorDetails(docSnap.id));
    tableBody.appendChild(row);
  });
}

// -------------------------------------------------------------
// LOAD SINGLE VENDOR DETAILS
// -------------------------------------------------------------
async function loadVendorDetails(id) {
  const snap = await getDoc(doc(db, "Vendors", id));
  if (!snap.exists()) return;

  const v = snap.data();

  formId.value = id;
  formName.value = v.name || "";
  formContact.value = v.contactPerson || "";
  formPhone.value = v.phone || "";
  formAddress.value = v.address || "";
  formStatus.value = v.status === "Inactive" ? "Inactive" : "Active";
  formNotes.value = v.notes || "";

  formPhone.classList.remove("input-error");

  // Enable delete only for LocationAdmin and only when a vendor is loaded
  if (userRole === "LocationAdmin") {
    deleteBtn.disabled = false;
  }
}

// -------------------------------------------------------------
// SAVE VENDOR (CREATE OR UPDATE)
// -------------------------------------------------------------
async function saveVendor() {
  const id = formId.value.trim();

  if (!id) {
    showToast("Vendor ID is required", "error");
    return;
  }

  if (formPhone.value && formPhone.value.length !== 12) {
    formPhone.classList.add("input-error");
    showToast("Invalid phone number", "error");
    return;
  }

  const vendorRef = doc(db, "Vendors", id);
  const vendorSnap = await getDoc(vendorRef);

  const vendorData = {
    name: formName.value.trim(),
    contactPerson: formContact.value.trim(),
    phone: formPhone.value.trim(),
    address: formAddress.value.trim(),
    status: formStatus.value,
    notes: formNotes.value.trim(),
    updatedAt: Date.now()
  };

  if (!userLocationId && userRole !== "SuperAdmin") {
    showToast("No location assigned to user", "error");
    return;
  }

  // Always keep location_id on vendor
  if (userRole === "SuperAdmin") {
    // SuperAdmin can edit existing vendors but not create new
    if (!vendorSnap.exists()) {
      showToast("SuperAdmin cannot create new vendors", "error");
      return;
    }
    vendorData.location_id = vendorSnap.data().location_id || null;
  } else {
    vendorData.location_id = userLocationId;
  }

  try {
    if (vendorSnap.exists()) {
      await updateDoc(vendorRef, vendorData);
      showToast("Vendor updated successfully", "success");
    } else {
      vendorData.createdAt = Date.now();
      await setDoc(vendorRef, vendorData);
      showToast("New vendor added", "success");
    }

    lastSavedVendorId = id;

    setTimeout(() => {
      clearForm();
      loadVendors(true);
    }, 200);

  } catch (error) {
    console.error("Save error:", error);
    showToast("Error saving vendor", "error");
  }
}

// -------------------------------------------------------------
// DELETE VENDOR (ONLY LOCATIONADMIN)
// -------------------------------------------------------------
async function deleteVendor() {
  if (userRole !== "LocationAdmin") {
    showToast("Only Location Admin can delete vendors", "error");
    return;
  }

  const id = formId.value.trim();
  if (!id) {
    showToast("Select a vendor to delete", "warning");
    return;
  }

  const confirmDelete = confirm("Are you sure you want to delete this vendor?");
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, "Vendors", id));
    showToast("Vendor deleted", "warning");

    clearForm();
    loadVendors(true);

  } catch (error) {
    console.error("Delete error:", error);
    showToast("Error deleting vendor", "error");
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

  formPhone.classList.remove("input-error");

  if (userRole === "LocationAdmin") {
    deleteBtn.disabled = true;
  }
}

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
searchInput.addEventListener("input", () => loadVendors(true));
filterStatus.addEventListener("change", () => loadVendors(true));

nextPageBtn.addEventListener("click", () => {
  currentPage++;
  loadVendors();
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    lastVisible = null;
    loadVendors(true);
  }
});

saveBtn.addEventListener("click", saveVendor);
deleteBtn.addEventListener("click", deleteVendor);

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
(async () => {
  await loadUserProfile();
  await loadVendors(true);
})();
