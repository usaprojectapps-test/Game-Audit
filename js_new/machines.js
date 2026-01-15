// Supabase client
const supabase = window.supabase;

// User role + location from JWT/localStorage
const userRole = localStorage.getItem("role");
const userLocationId = localStorage.getItem("location_id");

// DOM references
const tableBody = document.getElementById("machines-table-body");
const searchInput = document.getElementById("machines-search-input");
const healthFilter = document.getElementById("machines-health-filter");
const locationFilter = document.getElementById("machines-location-filter");
const refreshBtn = document.getElementById("machines-refresh-btn");
const exportBtn = document.getElementById("machines-export-csv-btn");

const idInput = document.getElementById("machines-machineid-input");
const nameInput = document.getElementById("machines-machinename-input");
const vendorSelect = document.getElementById("machines-vendor-select");
const locationSelect = document.getElementById("machines-location-select");
const healthSelect = document.getElementById("machines-health-select");
const lastServiceInput = document.getElementById("machines-lastservice-input");
const notesInput = document.getElementById("machines-notes-input");

const saveBtn = document.getElementById("machines-save-btn");
const deleteBtn = document.getElementById("machines-delete-btn");
const resetBtn = document.getElementById("machines-reset-btn");

const qrPreview = document.getElementById("machines-qr-preview");
const generateQRBtn = document.getElementById("machines-generate-qr-btn");
const printQRBtn = document.getElementById("machines-print-qr-btn");
const downloadQRBtn = document.getElementById("machines-download-qr-btn");

const summaryHealth = document.getElementById("machines-summary-health");
const summaryLastService = document.getElementById("machines-summary-lastservice");
const summaryVendor = document.getElementById("machines-summary-vendor");
const summaryLocation = document.getElementById("machines-summary-location");

const timelineContent = document.getElementById("machines-timeline-content");

const paginationText = document.getElementById("machines-pagination-text");
const prevPageBtn = document.getElementById("machines-prev-page");
const nextPageBtn = document.getElementById("machines-next-page");
const currentPageLabel = document.getElementById("machines-current-page");

const toastContainer = document.getElementById("machines-toast-container");

// State
let selectedMachineId = null;
let currentPage = 1;
let pageSize = 10;

// Load vendors
async function loadVendors() {
  const { data } = await supabase.from("vendors").select("vendorid, vendorname").order("vendorid");
  vendorSelect.innerHTML = `<option value="">Select vendor</option>`;
  data?.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.vendorid;
    opt.textContent = `${v.vendorid} - ${v.vendorname}`;
    vendorSelect.appendChild(opt);
  });
}

// Load locations (SuperAdmin only)
async function loadLocations() {
  if (userRole !== "SuperAdmin") {
    document.querySelectorAll(".superadmin-only").forEach(el => el.style.display = "none");
    return;
  }
  const { data } = await supabase.from("locations").select("id, locationname").order("locationname");
  locationSelect.innerHTML = `<option value="">Select location</option>`;
  locationFilter.innerHTML = `<option value="">All locations</option>`;
  data?.forEach(loc => {
    const opt1 = document.createElement("option");
    opt1.value = loc.id;
    opt1.textContent = loc.locationname;
    locationSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = loc.id;
    opt2.textContent = loc.locationname;
    locationFilter.appendChild(opt2);
  });
}

// Load machines
async function loadMachines() {
  let query = supabase.from("machines").select("*").order("createdat", { ascending: false });

  if (searchInput.value.trim()) {
    query = query.or(`machineid.ilike.%${searchInput.value}%,machinename.ilike.%${searchInput.value}%`);
  }

  if (healthFilter.value) {
    query = query.eq("healthstatus", healthFilter.value);
  }

  if (userRole === "SuperAdmin") {
    if (locationFilter.value) query = query.eq("locationid", locationFilter.value);
  } else {
    query = query.eq("locationid", userLocationId);
  }

  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await query.range(from, to).select("*", { count: "exact" });

  tableBody.innerHTML = "";
  data?.forEach(row => {
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

  paginationText.textContent = `Showing ${data?.length || 0} of ${count || 0}`;
  currentPageLabel.textContent = currentPage;

  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = (from + data.length) >= count;
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
  const now = Date.now();

  if (!id || !name || !vendorid || !locationid) {
    showToast("Please fill all required fields", "error");
    return;
  }

  if (!selectedMachineId) {
    const { data: exists } = await supabase.from("machines").select("machineid").eq("machineid", id).maybeSingle();
    if (exists) {
      showToast("Machine already exists", "warning");
      return;
    }

    const { error } = await supabase.from("machines").insert([{
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
      updatedat: now
    }]);

    if (!error) {
      showToast("Machine created", "success");
      resetForm();
      loadMachines();
    }
  } else {
    const { error } = await supabase.from("machines").update({
      machinename: name,
      vendorid,
      vendorname,
      locationid,
      healthstatus: health,
      lastservicedate: lastService,
      notes,
      qrcode,
      updatedat: now
    }).eq("machineid", selectedMachineId);

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
  qrPreview.innerHTML = `<span class="qr-placeholder-text">QR will appear here</span>`;
}

// QR
function renderQR(text) {
  qrPreview.innerHTML = "";
  new QRCode(qrPreview, { text, width: 128, height: 128 });
}

// Summary
function loadSummary(row) {
  summaryHealth.textContent = row.healthstatus;
  summaryLastService.textContent = formatDate(row.lastservicedate);
  summaryVendor.textContent = row.vendorname;
  summaryLocation.textContent = row.locationid;
}

// Timeline placeholder
function loadTimeline() {
  timelineContent.innerHTML = `<div class="timeline-empty">No events yet</div>`;
}

// Helpers
function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

function formatDateInput(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString().split("T")[0];
}

function getHealthIcon(status) {
  return status === "Good" ? "🟢" :
         status === "Warning" ? "🟡" :
         status === "Critical" ? "🔴" : "—";
}

function showToast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Pagination
prevPageBtn.onclick = () => {
  currentPage--;
  loadMachines();
};

nextPageBtn.onclick = () => {
  currentPage++;
  loadMachines();
};

// Events
searchInput.oninput = loadMachines;
healthFilter.onchange = loadMachines;
locationFilter.onchange = loadMachines;
refreshBtn.onclick = loadMachines;
saveBtn.onclick = saveMachine;
deleteBtn.onclick = deleteMachine;
resetBtn.onclick = resetForm;
generateQRBtn.onclick = () => renderQR(`MACHINE:${idInput.value}`);
printQRBtn.onclick = () => window.print();
downloadQRBtn.onclick = () => {
  const img = qrPreview.querySelector("img");
  if (!img) return;
  const a = document.createElement("a");
  a.href = img.src;
  a.download = `${idInput.value}_qr.png`;
  a.click();
};

// Init
(async function init() {
  await loadVendors();
  await loadLocations();
  await loadMachines();
})();
