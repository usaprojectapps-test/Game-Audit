// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// DOM ELEMENTS
// -------------------------------------------------------------
const idInput = document.getElementById("machines-machineid-input");
const nameInput = document.getElementById("machines-machinename-input");
const vendorSelect = document.getElementById("machines-vendor-select");
const locationSelect = document.getElementById("machines-location-select");
const healthSelect = document.getElementById("machines-health-select");
const lastServiceInput = document.getElementById("machines-lastservice-input");
const notesInput = document.getElementById("machines-notes-input");

const searchInput = document.getElementById("machines-search-input");
const healthFilter = document.getElementById("machines-health-filter");
const locationFilter = document.getElementById("machines-location-filter");

const tableBody = document.getElementById("machines-table-body");
const paginationText = document.getElementById("machines-pagination-text");
const currentPageSpan = document.getElementById("machines-current-page");
const prevPageBtn = document.getElementById("machines-prev-page");
const nextPageBtn = document.getElementById("machines-next-page");

const saveBtn = document.getElementById("machines-save-btn");
const deleteBtn = document.getElementById("machines-delete-btn");
const resetBtn = document.getElementById("machines-reset-btn");
const refreshBtn = document.getElementById("machines-refresh-btn");

const generateQRBtn = document.getElementById("machines-generate-qr-btn");
const printQRBtn = document.getElementById("machines-print-qr-btn");
const downloadQRBtn = document.getElementById("machines-download-qr-btn");
const qrPreview = document.getElementById("machines-qr-preview");

const summaryHealth = document.getElementById("machines-summary-health");
const summaryLastService = document.getElementById("machines-summary-lastservice");
const summaryVendor = document.getElementById("machines-summary-vendor");
const summaryLocation = document.getElementById("machines-summary-location");

const timelineContent = document.getElementById("machines-timeline-content");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentPage = 1;
const pageSize = 20;
let selectedMachineId = null;

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------
function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

function formatDateInput(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString().split("T")[0];
}

function getHealthIcon(status) {
  return status === "Good"
    ? "🟢"
    : status === "Warning"
    ? "🟡"
    : status === "Critical"
    ? "🔴"
    : "—";
}

// -------------------------------------------------------------
// LOADERS
// -------------------------------------------------------------
async function loadVendors() {
  const { data, error } = await supabase
    .from("Vendors")
    .select("VendorId, VendorName")
    .order("VendorName", { ascending: true });

  if (error) {
    console.error("Vendor load error:", error);
    return showToast("Failed to load vendors", "error");
  }

  vendorSelect.innerHTML = `<option value="">Select vendor</option>`;
  (data || []).forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.VendorId;
    opt.textContent = v.VendorName;
    vendorSelect.appendChild(opt);
  });
}

async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Location load error:", error);
    return showToast("Failed to load locations", "error");
  }

  locationSelect.innerHTML = `<option value="">Select location</option>`;
  locationFilter.innerHTML = `<option value="">All locations</option>`;

  (data || []).forEach(loc => {
    const opt1 = document.createElement("option");
    opt1.value = loc.id;
    opt1.textContent = loc.name;
    locationSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = loc.id;
    opt2.textContent = loc.name;
    locationFilter.appendChild(opt2);
  });
}

async function loadMachines(reset = false) {
  if (reset) currentPage = 1;

  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("machines")
    .select("*")
    .order("createdat", { ascending: false })
    .range(from, to);

  const search = searchInput.value.trim();
  const health = healthFilter.value;
  const location = locationFilter.value;

  if (search) query = query.ilike("machinename", `%${search}%`);
  if (health) query = query.eq("healthstatus", health);
  if (location) query = query.eq("location_id", location);

  const { data, error } = await query;

  if (error) {
    console.error("Machine load error:", error);
    return showToast("Failed to load machines", "error");
  }

  const rows = data || [];
  tableBody.innerHTML = "";

  rows.forEach(machine => {
    const tr = document.createElement("tr");
    tr.onclick = () => selectMachine(machine);
    tr.innerHTML = `
      <td>${machine.machineid}</td>
      <td>${machine.machinename}</td>
      <td>${machine.vendorname || "—"}</td>
      <td>${getHealthIcon(machine.healthstatus)}</td>
      <td>${formatDate(machine.lastservicedate)}</td>
      <td>${locationName}</td>
    `;
    tableBody.appendChild(tr);
  });

  paginationText.textContent = `Showing ${rows.length} of ${rows.length}`;
  currentPageSpan.textContent = String(currentPage);

  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = rows.length < pageSize;
}

// -------------------------------------------------------------
// FORM
// -------------------------------------------------------------
function selectMachine(machine) {
  selectedMachineId = machine.machineid;
  idInput.value = machine.machineid || "";
  nameInput.value = machine.machinename || "";
  vendorSelect.value = machine.vendorid || "";
  locationSelect.value = machine.location_id || "";
  healthSelect.value = machine.healthstatus || "Good";
  lastServiceInput.value = formatDateInput(machine.lastservicedate);
  notesInput.value = machine.notes || "";

  summaryHealth.textContent = getHealthIcon(machine.healthstatus);
  summaryLastService.textContent = formatDate(machine.lastservicedate);
  summaryVendor.textContent = machine.vendorname || "—";
  summaryLocation.textContent = machine.location_id || "—";

  timelineContent.innerHTML = `<div class="timeline-empty">No events yet</div>`;
}

function resetForm() {
  selectedMachineId = null;
  idInput.value = "";
  nameInput.value = "";
  vendorSelect.value = "";
  locationSelect.value = "";
  healthSelect.value = "Good";
  lastServiceInput.value = "";
  notesInput.value = "";

  summaryHealth.textContent = "—";
  summaryLastService.textContent = "—";
  summaryVendor.textContent = "—";
  summaryLocation.textContent = "—";

  timelineContent.innerHTML = `<div class="timeline-empty">No events yet</div>`;
}

// -------------------------------------------------------------
// SAVE / DELETE
// -------------------------------------------------------------
async function saveMachine() {
  const machineId = idInput.value.trim();
  const machineName = nameInput.value.trim();

  if (!machineId || !machineName) {
    return showToast("Machine ID and Name are required", "error");
  }

  const selectedVendorOption = vendorSelect.selectedOptions[0];
  const payload = {
    machineid: machineId,
    machinename: machineName,
    vendorid: vendorSelect.value || null,
    vendorname: selectedVendorOption ? selectedVendorOption.textContent : null,
    location_id: locationSelect.value || null,
    healthstatus: healthSelect.value,
    lastservicedate: lastServiceInput.value
      ? new Date(lastServiceInput.value).getTime()
      : null,
    notes: notesInput.value.trim(),
    updatedat: Date.now(),
  };

  if (selectedMachineId) {
    const { error } = await supabase
      .from("machines")
      .update(payload)
      .eq("machineid", selectedMachineId);

    if (error) {
      console.error("Machine update error:", error);
      return showToast("Update failed", "error");
    }

    showToast("Machine updated", "success");
  } else {
    payload.createdat = Date.now();

    const { error } = await supabase
      .from("machines")
      .insert(payload);

    if (error) {
      console.error("Machine insert error:", error);
      return showToast("Insert failed", "error");
    }

    showToast("Machine added", "success");
  }

  await loadMachines(true);
  resetForm();
}

async function deleteMachine() {
  if (!selectedMachineId) {
    return showToast("No machine selected", "error");
  }

  const { error } = await supabase
    .from("machines")
    .delete()
    .eq("machineid", selectedMachineId);

  if (error) {
    console.error("Machine delete error:", error);
    return showToast("Delete failed", "error");
  }

  showToast("Machine deleted", "success");
  await loadMachines(true);
  resetForm();
}

// -------------------------------------------------------------
// QR
// -------------------------------------------------------------
generateQRBtn.onclick = () => {
  qrPreview.innerHTML = "";
  if (!idInput.value.trim()) {
    return showToast("Enter Machine ID before generating QR", "warning");
  }
  // Assumes QRCode library is loaded globally
  new QRCode(qrPreview, {
    text: `MACHINE:${idInput.value.trim()}`,
    width: 128,
    height: 128,
  });
};

printQRBtn.onclick = () => window.print();

downloadQRBtn.onclick = () => {
  const img = qrPreview.querySelector("img");
  if (!img) return;
  const a = document.createElement("a");
  a.href = img.src;
  a.download = `${idInput.value.trim() || "machine"}_qr.png`;
  a.click();
};

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
searchInput.addEventListener("input", () => loadMachines(true));
healthFilter.addEventListener("change", () => loadMachines(true));
locationFilter.addEventListener("change", () => loadMachines(true));

refreshBtn.addEventListener("click", () => loadMachines(true));

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadMachines();
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage++;
  loadMachines();
});

saveBtn.addEventListener("click", saveMachine);
deleteBtn.addEventListener("click", deleteMachine);
resetBtn.addEventListener("click", resetForm);

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
(async () => {
  await loadVendors();
  await loadLocations();
  await loadMachines(true);
})();
