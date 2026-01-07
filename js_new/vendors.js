// -------------------------------------------------------------
// IMPORT FIREBASE
// -------------------------------------------------------------
import { db } from "/js_new/firebase.js";
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
  startAfter
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
// PAGINATION STATE
// -------------------------------------------------------------
let lastVisible = null;
let firstVisible = null;
let currentPage = 1;

// Track last saved vendor for highlight
let lastSavedVendorId = null;

// -------------------------------------------------------------
// AUTO-FORMAT PHONE NUMBER + VALIDATION
// -------------------------------------------------------------
formPhone.addEventListener("input", () => {
  let value = formPhone.value.replace(/\D/g, ""); // remove non-numeric

  if (value.length > 3 && value.length <= 6) {
    value = value.replace(/(\d{3})(\d+)/, "$1-$2");
  } else if (value.length > 6) {
    value = value.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
  }

  formPhone.value = value;

  // Remove error style while typing
  formPhone.classList.remove("input-error");
});

// Validate on blur
formPhone.addEventListener("blur", () => {
  if (formPhone.value.length !== 12) {
    formPhone.classList.add("input-error");
    showToast("Invalid phone number", "error");
  }
});

// -------------------------------------------------------------
// LOAD VENDORS
// -------------------------------------------------------------
async function loadVendors(reset = false) {
  if (reset) {
    lastVisible = null;
    currentPage = 1;
  }

  let q;

  if (!lastVisible) {
    q = query(collection(db, "Vendors"), orderBy("name"), limit(20));
  } else {
    q = query(
      collection(db, "Vendors"),
      orderBy("name"),
      startAfter(lastVisible),
      limit(20)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:10px;">No vendors found</td></tr>`;
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

  docs.forEach((docSnap) => {
    const v = docSnap.data();

    const search = searchInput.value.toLowerCase();
    const statusFilter = filterStatus.value;

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

    // ⭐ Highlight saved vendor
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

  // ⭐ PHONE VALIDATION
  if (formPhone.value.length !== 12) {
    formPhone.classList.add("input-error");
    showToast("Invalid phone number", "error");
    return;
  }

  const vendorData = {
    name: formName.value.trim(),
    contactPerson: formContact.value.trim(),
    phone: formPhone.value.trim(),
    address: formAddress.value.trim(),
    status: formStatus.value,
    notes: formNotes.value.trim(),
    updatedAt: Date.now()
  };

  const vendorRef = doc(db, "Vendors", id);
  const vendorSnap = await getDoc(vendorRef);

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
// DELETE VENDOR (WITH CONFIRMATION)
// -------------------------------------------------------------
async function deleteVendor() {
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
loadVendors(true);
