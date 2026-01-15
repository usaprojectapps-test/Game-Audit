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
const toastContainer = document.getElementById("machines-toast-container");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentPage = 1;
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
  const { data, error } = await supabase.from("vendors").select("vendorid,vendorname");
  if (error) return showToast("Failed to load vendors", "error");

  vendorSelect.innerHTML = `<option value="">Select vendor</option>`;
  data.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.vendorid;
    opt.textContent = v.vendorname;
    vendorSelect.appendChild(opt);
  });
}

async function loadLocations() {
  const role = supabase.auth.getUser()?.user_metadata?.role;
  if (role !== "SuperAdmin") return;

  const { data, error } = await supabase.from("locations").select("id,name");
  if (error) return showToast("Failed to load locations", "error");

  locationSelect.innerHTML = `<option value="">Select location</option>`;
  locationFilter.innerHTML = `<option value="">All locations</option>`;
  data.forEach(loc => {
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

async function loadMachines() {
  const query = supabase.from("machines").select("*").order("createdat", { ascending: false });

  const search = searchInput.value.trim();
  const health = healthFilter.value;
  const location = locationFilter.value;

  if (search) query.ilike("machinename", `%${search}%`);
  if (health) query.eq("healthstatus", health);
  if (location) query.eq("location_id", location);

  const { data, error } = await query;
  if (error) return showToast("Failed to load machines", "error");

  tableBody.innerHTML = "";
  data.forEach(machine => {
    const tr = document.createElement("tr");
    tr.onclick = () => selectMachine(machine);
    tr.innerHTML = `
      <td>${machine.machineid}</td>
      <td>${machine.machinename}</td>
      <td>${machine.vendorname || "—"}</td>
      <td>${getHealthIcon(machine.healthstatus)}</td>
      <td>${formatDate(machine.lastservicedate)}</td>
      <td>${machine.location_id}</td>
    `;
    tableBody.appendChild(tr);
  });

  paginationText.textContent = `Showing ${data.length} of ${data.length}`;
}

// -------------------------------------------------------------
// FORM
// -------------------------------------------------------------
function selectMachine(machine) {
  selectedMachineId = machine.machineid;
  idInput.value = machine.machineid;
  nameInput.value = machine.machinename;
  vendorSelect.value = machine.vendorid || "";
  locationSelect.value = machine.location_id || "";
  healthSelect.value = machine.healthstatus || "";
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
  const payload = {
    machineid: idInput.value.trim(),
    machinename: nameInput.value.trim(),
    vendorid: vendorSelect.value || null,
    location_id: locationSelect.value || null,
    healthstatus: healthSelect.value,
    lastservicedate: lastServiceInput.value ? new Date(lastServiceInput.value).getTime() : null,
    notes: notesInput.value.trim(),
    updatedat: Date.now(),
  };

  if (!payload.machineid || !payload.machinename) {
    return showToast("Machine ID and Name are required", "error");
  }

  if (selectedMachineId) {
    const { error } = await supabase.from("machines").update(payload).eq("machineid", selectedMachineId);
    if (error) return showToast("Update failed", "error");
    showToast("Machine updated", "success");
  } else {
    payload.createdat = Date.now();
    const { error } = await supabase.from("machines").insert(payload);
    if (error) return showToast("Insert failed", "error");
    showToast("Machine added", "success");
  }

  await loadMachines();
  resetForm();
}

async function deleteMachine() {
  if (!selectedMachineId) return showToast("No machine selected", "error");
  const { error } = await supabase.from("machines").delete().eq("machineid", selectedMachineId);
  if (error) return showToast("Delete failed", "error");
  showToast("Machine deleted", "success");
  await loadMachines();
  resetForm();
}

// -------------------------------------------------------------
// QR
// -------------------------------------------------------------
generateQRBtn.onclick = () => {
  qrPreview.innerHTML = "";
  new QRCode(qrPreview, {
    text: `MACHINE:${idInput.value}`,
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
  a.download = `${idInput.value}_qr.png`;
  a.click