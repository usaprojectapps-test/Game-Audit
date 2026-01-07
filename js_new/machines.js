console.log("✅ machines.js loaded");

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
const tableBody = document.getElementById("machineTableBody");
const searchInput = document.getElementById("machineSearch");
const filterVendor = document.getElementById("machineFilterVendor");
const filterStatus = document.getElementById("machineFilterStatus");

const pageInfo = document.getElementById("machinePageInfo");
const prevPageBtn = document.getElementById("machinePrevPage");
const nextPageBtn = document.getElementById("machineNextPage");

const formNo = document.getElementById("machineFormNo");
const formVendor = document.getElementById("machineFormVendor");
const formType = document.getElementById("machineFormType");
const formLocation = document.getElementById("machineFormLocation");
const formModel = document.getElementById("machineFormModel");
const formSerial = document.getElementById("machineFormSerial");
const formStatus = document.getElementById("machineFormStatus");
const formInstallDate = document.getElementById("machineFormInstallDate");
const formNotes = document.getElementById("machineFormNotes");

const saveBtn = document.getElementById("machineSaveBtn");
const deleteBtn = document.getElementById("machineDeleteBtn");

const detailTitle = document.getElementById("machineDetailTitle");
const detailSubtitle = document.getElementById("machineDetailSubtitle");

const qrCanvas = document.getElementById("machineQrCanvas");
const printQrBtn = document.getElementById("machinePrintQrBtn");
const exportBtn = document.getElementById("machineExportBtn");

const summaryContent = document.getElementById("machineSummaryContent");
const timelineList = document.getElementById("machineTimelineList");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let lastVisible = null;
let selectedMachineId = null;
let lastSavedMachineId = null;
let currentPage = 1;

// -------------------------------------------------------------
// AUTO-UPPERCASE MACHINE NO
// -------------------------------------------------------------
formNo.addEventListener("input", () => {
  formNo.value = formNo.value.toUpperCase().trim();
});

// -------------------------------------------------------------
// VALIDATION
// -------------------------------------------------------------
function clearValidation() {
  [
    formNo,
    formVendor,
    formType,
    formLocation,
    formModel,
    formSerial
  ].forEach((el) => el.classList.remove("input-error"));
}

function validateForm() {
  clearValidation();
  let valid = true;

  if (!formNo.value.trim()) { formNo.classList.add("input-error"); valid = false; }
  if (!formVendor.value.trim()) { formVendor.classList.add("input-error"); valid = false; }
  if (!formType.value.trim()) { formType.classList.add("input-error"); valid = false; }
  if (!formLocation.value.trim()) { formLocation.classList.add("input-error"); valid = false; }
  if (!formModel.value.trim()) { formModel.classList.add("input-error"); valid = false; }
  if (!formSerial.value.trim()) { formSerial.classList.add("input-error"); valid = false; }

  if (!valid) showToast("Please fill all required fields", "error");
  return valid;
}

// -------------------------------------------------------------
// HEALTH INDICATOR
// -------------------------------------------------------------
function getHealthForMachine(machine) {
  const status = machine.status || "Inactive";

  if (status === "Active") return { label: "Good", cssClass: "health-good" };
  if (status === "Repair") return { label: "Attention", cssClass: "health-warn" };
  return { label: "Offline", cssClass: "health-bad" };
}

// -------------------------------------------------------------
// LOAD VENDOR DROPDOWN
// -------------------------------------------------------------
async function loadVendorDropdown() {
  const snap = await getDocs(collection(db, "Vendors"));

  formVendor.innerHTML = '<option value="">Select Vendor</option>';
  filterVendor.innerHTML = '<option value="">All Vendors</option>';

  snap.forEach((docSnap) => {
    const id = docSnap.id;
    const data = docSnap.data();
    const name = data.name || "";

    const label = name ? `${name} (${id})` : id;

    const opt1 = document.createElement("option");
    opt1.value = id;
    opt1.textContent = label;
    formVendor.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = id;
    opt2.textContent = label;
    filterVendor.appendChild(opt2);
  });
}

// -------------------------------------------------------------
// LOAD MACHINES
// -------------------------------------------------------------
async function loadMachines(reset = false) {
  if (reset) {
    lastVisible = null;
    currentPage = 1;
  }

  let q;
  if (!lastVisible) {
    q = query(collection(db, "Machines"), orderBy("machineNo"), limit(20));
  } else {
    q = query(
      collection(db, "Machines"),
      orderBy("machineNo"),
      startAfter(lastVisible),
      limit(20)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    tableBody.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:10px;">No machines found</td></tr>';
    pageInfo.textContent = `Page ${currentPage}`;
    return;
  }

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
  const vendorFilter = filterVendor.value;
  const statusFilter = filterStatus.value;

  docs.forEach((docSnap) => {
    const m = docSnap.data();
    const id = docSnap.id;

    if (search && !(id.toLowerCase().includes(search) || (m.vendor || "").toLowerCase().includes(search))) return;
    if (vendorFilter && m.vendor !== vendorFilter) return;
    if (statusFilter && m.status !== statusFilter) return;

    const health = getHealthForMachine(m);

    const row = document.createElement("tr");
    row.dataset.id = id;

    row.innerHTML = `
      <td>${m.machineNo || id}</td>
      <td>${m.vendor || ""}</td>
      <td>${m.type || ""}</td>
      <td>${m.status || ""}</td>
      <td><span class="machine-health ${health.cssClass}">${health.label}</span></td>
    `;

    if (id === selectedMachineId) row.classList.add("selected-row");

    if (id === lastSavedMachineId) {
      row.style.background = "#d4edda";
      setTimeout(() => {
        row.style.transition = "background 1.5s ease";
        row.style.background = "transparent";
      }, 300);
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    row.addEventListener("click", () => handleRowClick(id));
    tableBody.appendChild(row);
  });

  if (!tableBody.children.length) {
    tableBody.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:10px;">No machines match filters</td></tr>';
  }
}

// -------------------------------------------------------------
// HANDLE ROW CLICK
// -------------------------------------------------------------
async function handleRowClick(id) {
  selectedMachineId = id;
  updateRowSelectionUI();
  await loadMachineDetails(id);
  generateMachineQr(id);
}

// -------------------------------------------------------------
// UPDATE ROW SELECTION UI
// -------------------------------------------------------------
function updateRowSelectionUI() {
  Array.from(tableBody.querySelectorAll("tr")).forEach((row) => {
    row.classList.toggle("selected-row", row.dataset.id === selectedMachineId);
  });
}

// -------------------------------------------------------------
// LOAD MACHINE DETAILS
// -------------------------------------------------------------
async function loadMachineDetails(id) {
  const snap = await getDoc(doc(db, "Machines", id));
  if (!snap.exists()) return;

  const m = snap.data();

  formNo.value = m.machineNo || id;
  formVendor.value = m.vendor || "";
  formType.value = m.type || "";
  formLocation.value = m.location || "";
  formModel.value = m.model || "";
  formSerial.value = m.serialNumber || "";
  formStatus.value = m.status || "Active";
  formInstallDate.value = m.installDate || "";
  formNotes.value = m.notes || "";

  clearValidation();

  detailTitle.textContent = `${m.machineNo || id}`;
  detailSubtitle.textContent = m.location
    ? `Location: ${m.location} • Status: ${m.status || "Unknown"}`
    : `Status: ${m.status || "Unknown"}`;

  summaryContent.textContent = "Summary will be available in Reports.";
  timelineList.innerHTML = '<div>Activity timeline will be available in Reports.</div>';
}

// -------------------------------------------------------------
// BUILD MACHINE DATA
// -------------------------------------------------------------
function buildMachineData() {
  return {
    machineNo: formNo.value.trim(),
    vendor: formVendor.value,
    type: formType.value,
    location: formLocation.value.trim(),
    model: formModel.value.trim(),
    serialNumber: formSerial.value.trim(),
    status: formStatus.value,
    installDate: formInstallDate.value || "",
    notes: formNotes.value.trim(),
    updatedAt: Date.now()
  };
}

// -------------------------------------------------------------
// SAVE MACHINE
// -------------------------------------------------------------
async function saveMachine() {
  const id = formNo.value.trim().toUpperCase();
  formNo.value = id;

  if (!validateForm()) return;

  const machineRef = doc(db, "Machines", id);
  const machineSnap = await getDoc(machineRef);
  const machineData = buildMachineData();

  try {
    if (machineSnap.exists()) {
      await updateDoc(machineRef, machineData);
      showToast("Machine updated successfully", "success");
    } else {
      machineData.createdAt = Date.now();
      await setDoc(machineRef, machineData);
      showToast("New machine added", "success");
    }

    lastSavedMachineId = id;
    selectedMachineId = id;

    setTimeout(() => {
      clearForm();
      loadMachines(true);
    }, 200);
  } catch (error) {
    console.error("Save machine error:", error);
    showToast("Error saving machine", "error");
  }
}

// -------------------------------------------------------------
// DELETE MACHINE
// -------------------------------------------------------------
async function deleteMachine() {
  const id = formNo.value.trim();
  if (!id) {
    showToast("Select a machine to delete", "warning");
    return;
  }

  const confirmDelete = confirm("Are you sure you want to delete this machine?");
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, "Machines", id));
    showToast("Machine deleted", "warning");

    clearForm();
    selectedMachineId = null;
    lastSavedMachineId = null;
    loadMachines(true);
  } catch (error) {
    console.error("Delete machine error:", error);
    showToast("Error deleting machine", "error");
  }
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
function clearForm() {
  formNo.value = "";
  formVendor.value = "";
  formType.value = "";
  formLocation.value = "";
  formModel.value = "";
  formSerial.value = "";
  formStatus.value = "Active";
  formInstallDate.value = "";
  formNotes.value = "";

  clearValidation();

  detailTitle.textContent = "Select a machine";
  detailSubtitle.textContent =
    "Machine details, QR, performance & timeline will appear here.";

  summaryContent.textContent = "No machine selected.";
  timelineList.innerHTML = '<div>No activity loaded.</div>';

  const ctx = qrCanvas.getContext("2d");
  ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
}

// -------------------------------------------------------------
// QR GENERATION
// -------------------------------------------------------------
function generateMachineQr(machineId) {
  if (!qrCanvas || !machineId) return;

  const ctx = qrCanvas.getContext("2d");
  ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);

  const data = JSON.stringify({
    type: "MACHINE",
    id: machineId
  });

  if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
    window.QRCode.toCanvas(qrCanvas, data, { width: 128 }, (error) => {
      if (error) {
        console.error("QR error:", error);
        showToast("Error generating QR", "error");
      }
    });
  } else {
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText("QR library missing", qrCanvas.width / 2, qrCanvas.height / 2);
  }
}

// -------------------------------------------------------------
// PRINT QR
// -------------------------------------------------------------
function printMachineQr() {
  if (!qrCanvas || !selectedMachineId) {
    showToast("Select a machine to print QR", "warning");
    return;
  }

  const dataUrl = qrCanvas.toDataURL("image/png");
  const win = window.open("", "_blank", "width=400,height=500");

  if (!win) {
    showToast("Popup blocked. Allow popups to print QR.", "warning");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Machine QR - ${selectedMachineId}</title>
        <style>
          body { font-family: sans-serif; text-align:center; padding:20px; }
          h2 { margin-bottom: 10px; }
          img { margin: 10px 0; }
          .meta { font-size: 12px; color:#555; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>Machine QR</h2>
        <div>${selectedMachineId}</div>
        <img src="${dataUrl}" />
        <div class="meta">Scan to identify this machine</div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
}

// -------------------------------------------------------------
// DOWNLOAD QR
// -------------------------------------------------------------
function downloadMachineQr() {
  if (!qrCanvas || !selectedMachineId) {
    showToast("Select a machine to download QR", "warning");
    return;
  }

  const dataUrl = qrCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `machine_${selectedMachineId}_qr.png`;
  link.click();
}

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
searchInput.addEventListener("input", () => loadMachines(true));
filterVendor.addEventListener("change", () => loadMachines(true));
filterStatus.addEventListener("change", () => loadMachines(true));

nextPageBtn.addEventListener("click", () => {
  currentPage++;
  loadMachines();
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    lastVisible = null;
    loadMachines(true);
  }
});

saveBtn.addEventListener("click", saveMachine);
deleteBtn.addEventListener("click", deleteMachine);

printQrBtn.addEventListener("click", printMachineQr);
exportBtn.addEventListener("click", downloadMachineQr);

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
loadVendorDropdown();
loadMachines(true);
