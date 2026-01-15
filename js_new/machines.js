// Supabase client
const supabase = window.supabase;

// Role + location from JWT
const userRole = localStorage.getItem("role");
const userLocationId = localStorage.getItem("location_id");

// DOM elements
const tableBody = document.getElementById("machines-table-body");
const formTitle = document.getElementById("machines-form-title");
const formMode = document.getElementById("machines-form-mode");
const toastContainer = document.getElementById("machines-toast-container");

// Inputs
const idInput = document.getElementById("machines-machineid-input");
const nameInput = document.getElementById("machines-machinename-input");
const vendorSelect = document.getElementById("machines-vendor-select");
const locationSelect = document.getElementById("machines-location-select");
const healthSelect = document.getElementById("machines-health-select");
const lastServiceInput = document.getElementById("machines-lastservice-input");
const notesInput = document.getElementById("machines-notes-input");

// Buttons
const saveBtn = document.getElementById("machines-save-btn");
const deleteBtn = document.getElementById("machines-delete-btn");
const resetBtn = document.getElementById("machines-reset-btn");

// QR
const qrPreview = document.getElementById("machines-qr-preview");
const generateQRBtn = document.getElementById("machines-generate-qr-btn");
const printQRBtn = document.getElementById("machines-print-qr-btn");
const downloadQRBtn = document.getElementById("machines-download-qr-btn");

// Summary
const summaryHealth = document.getElementById("machines-summary-health");
const summaryLastService = document.getElementById("machines-summary-lastservice");
const summaryVendor = document.getElementById("machines-summary-vendor");
const summaryLocation = document.getElementById("machines-summary-location");

// Timeline
const timelineContent = document.getElementById("machines-timeline-content");

// State
let selectedMachineId = null;
let currentPage = 1;
let pageSize = 10;

// Load vendors
async function loadVendors() {
  const { data, error } = await supabase.from("vendors").select("vendorid, vendorname");
  if (data) {
    vendorSelect.innerHTML = `<option value="">Select vendor</option>`;
    data.forEach(v => {
      const option = document.createElement("option");
      option.value = v.vendorid;
      option.textContent = `${v.vendorid} - ${v.vendorname}`;
      vendorSelect.appendChild(option);
    });
  }
}

// Load locations (SuperAdmin only)
async function loadLocations() {
  if (userRole !== "SuperAdmin") return;
  const { data } = await supabase.from("locations").select("id, locationname");
  locationSelect.innerHTML = `<option value="">Select location</option>`;
  data.forEach(loc => {
    const option = document.createElement("option");
    option.value = loc.id;
    option.textContent = loc.locationname;
    locationSelect.appendChild(option);
  });
}

// Load machines table
async function loadMachines() {
  const { data } = await supabase
    .from("machines")
    .select("*")
    .order("createdat", { ascending: false })
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  tableBody.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.onclick = () => selectMachine(row);
    tr.innerHTML = `
      <td>${row.machineid}</td>
      <td>${row.machinename}</td>
      <td>${row.vendorid}</td>
      <td>${getHealthIcon(row.healthstatus)}</td>
      <td>${formatDate(row.lastservicedate)}</td>
      <td>${row.locationid}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// Select machine
function selectMachine(row) {
  selectedMachineId = row.machineid;
  idInput.value = row.machineid;
  nameInput.value = row.machinename;
  vendorSelect.value = row.vendorid;
  locationSelect.value = row.locationid;
  healthSelect.value = row.healthstatus;
  lastServiceInput.value = formatDateInput(row.lastservicedate);
  notesInput.value = row.notes || "";
  formTitle.textContent = "Edit Machine";
  formMode.textContent = "Edit";
  renderQR(row.qrcode);
  loadSummary(row);
  loadTimeline(row.machineid);
}

// Save machine
async function saveMachine() {
  const id = idInput.value.trim();
  const name = nameInput.value.trim();
  const vendorid = vendorSelect.value;
  const vendorname = vendorSelect.options[vendorSelect.selectedIndex]?.text?.split(" - ")[1] || "";
  const locationid = userRole === "SuperAdmin" ? locationSelect.value : userLocationId;
  const health = healthSelect.value;
  const lastService = new Date(lastServiceInput.value).getTime();
  const notes = notesInput.value.trim();
  const qrcode = `MACHINE:${id}`;

  if (!id || !name || !vendorid || !locationid) {
    showToast("Please fill all required fields", "error");
    return;
  }

  const now = Date.now();

  if (!selectedMachineId) {
    const { data: exists } = await supabase
      .from("machines")
      .select("machineid")
      .eq("machineid", id)
      .maybeSingle();

    if (exists) {
      showToast("Machine already exists", "warning");
      return;
    }

    const { error } = await supabase.from("machines").insert([
      {
        machineid: id,
        machinename: name,
        vendorid,
        vendorname,
        locationid,
        healthstatus: health,
        lastservicedate: lastService,
        notes,
        qrcode,
        createdat: now,
        updatedat: now,
      },
    ]);

    if (!error) {
      showToast("Machine created", "success");
      resetForm();
      loadMachines();
    }
  } else {
    const { error } = await supabase
      .from("machines")
      .update({
        machinename: name,
        vendorid,
        vendorname,
        locationid,
        healthstatus: health,
        lastservicedate: lastService,
        notes,
        qrcode,
        updatedat: now,
      })
      .eq("machineid", selectedMachineId);

    if (!error) {
      showToast("Machine updated", "success");
      resetForm();
      loadMachines();
    }
  }
}

// Delete machine
async function deleteMachine() {
  if (!selectedMachineId) return;
  const { error } = await supabase.from("machines").delete().eq("machineid", selectedMachineId);
  if (!error) {
    showToast("Machine deleted", "success");
    resetForm();
    loadMachines();
  }
}

// Reset form
function resetForm() {
  selectedMachineId = null;
  idInput.value = "";
  nameInput.value = "";
  vendorSelect.value = "";
  locationSelect.value = "";
  healthSelect.value = "Good";
  lastServiceInput.value = "";
  notesInput.value = "";
  formTitle.textContent = "Add Machine";
  formMode.textContent = "New";
  qrPreview.innerHTML = `<span class="qr-placeholder-text">QR will appear here</span>`;
}

// QR logic
function renderQR(text) {
  qrPreview.innerHTML = "";
  new QRCode(qrPreview, {
    text,
    width: 128,
    height: 128,
  });
}

// Summary
function loadSummary(row) {
  summaryHealth.textContent = row.healthstatus;
  summaryLastService.textContent = formatDate(row.lastservicedate);
  summaryVendor.textContent = row.vendorname;
  summaryLocation.textContent = row.locationid;
}

// Timeline (placeholder)
function loadTimeline(machineid) {
  timelineContent.innerHTML = `<div class="timeline-empty">No events yet</div>`;
}

// Helpers
function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString();
}

function formatDateInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toISOString().split("T")[0];
}

function getHealthIcon(status) {
  if (status === "Good") return "🟢";
  if (status === "Warning") return "🟡";
  if (status === "Critical") return "🔴";
  return "—";
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Event listeners
saveBtn.onclick = saveMachine;
deleteBtn.onclick = deleteMachine;
resetBtn.onclick = resetForm;
generateQRBtn.onclick = () => renderQR