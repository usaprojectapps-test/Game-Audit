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
// GLOBAL MAPS
// -------------------------------------------------------------
const locationMap = {};
const vendorMap = {};

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
  vendorMap.clear?.(); // if Map object, otherwise reset manually
  (data || []).forEach(v => {
    vendorMap[v.VendorId] = v.VendorName;

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
  locationMap.clear?.(); // if Map object, otherwise reset manually

  (data || []).forEach(loc => {
    locationMap[loc.id] = loc.name;

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

    const locationName = locationMap[machine.location_id] || "Unknown";
    const vendorName = vendorMap[machine.vendorid] || "—";

    tr.innerHTML = `
      <td>${machine.machineid}</td>
      <td>${machine.machinename}</td>
      <td>${vendorName}</td>
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
  const machineId = idInput.value.trim();
  const machineName = nameInput.value.trim();

  if (!machineId) {
    return showToast("Enter Machine ID before generating QR", "warning");
  }

  // Clear only QR canvas
  const qrCanvas = document.getElementById("machines-qr-canvas");
  qrCanvas.innerHTML = "";

  // Generate QR
  new QRCode(qrCanvas, {
    text: `MACHINE:${machineId}`,
    width: 120,
    height: 120,
  });

  // Update label
  document.getElementById("machines-qr-label").innerHTML = `
    <div>Machine ID: ${machineId}</div>
    <div style="font-size:12px; opacity:0.8;">${machineName || ""}</div>
  `;
};


// -------------------------------------------------------------
// QR PRINT
// -------------------------------------------------------------
document.getElementById("machines-print-qr-btn").addEventListener("click", () => {
  const machineId = idInput.value.trim();
  const machineName = nameInput.value.trim();
  const vendorName = vendorSelect.options[vendorSelect.selectedIndex]?.text || "";
  const locationName = locationSelect.options[locationSelect.selectedIndex]?.text || "";

  const qrCanvas = document.getElementById("machines-qr-canvas");
  const qrImage = qrCanvas.querySelector("img") || qrCanvas.querySelector("canvas");

  if (!qrImage) {
    return showToast("Generate QR before printing", "warning");
  }

  const qrSrc = qrImage.src || qrImage.toDataURL();

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Machine QR Ticket</title>
      </head>
      <body style="
        margin:0;
        font-family:Arial, sans-serif;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        background:#fff;
      ">
        <div style="
          width:300px;
          padding:20px;
          border:2px solid #000;
          border-radius:10px;
          text-align:center;
        ">
          <h2 style="margin:0 0 10px 0;">MACHINE QR TICKET</h2>

          <div style="text-align:left; margin-bottom:15px; font-size:14px;">
            <strong>Machine ID:</strong> ${machineId}<br>
            <strong>Machine Name:</strong> ${machineName}<br>
            <strong>Vendor:</strong> ${vendorName}<br>
            <strong>Location:</strong> ${locationName}<br>
          </div>

          <img src="${qrSrc}" style="width:150px; height:150px; margin-bottom:10px;" />

          <div style="font-size:12px; opacity:0.7;">
            Generated on ${new Date().toLocaleString()}
          </div>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
});


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
