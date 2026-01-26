// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

console.log("AUDIT JS LOADED");

// -------------------------------------------------------------
// GLOBAL STATE
// -------------------------------------------------------------
let currentUser = null;
let currentRole = null;
let currentLocationId = null;

let editMode = false;
let editingAuditId = null;

// -------------------------------------------------------------
// DATE HELPER
// -------------------------------------------------------------
function today() {
  return new Date().toLocaleDateString("en-CA");
}

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------
function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function highlightRow(machineNo) {
  const rows = document.querySelectorAll("#auditTable tbody tr");
  rows.forEach(r => r.classList.remove("highlight"));

  const target = Array.from(rows).find(r => r.dataset.machine === machineNo);
  if (target) {
    target.classList.add("highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function formatCurrency(amount) {
  return `$ ${Number(amount || 0).toFixed(2)}`;
}

// -------------------------------------------------------------
// SESSION
// -------------------------------------------------------------
async function loadSessionInfo() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    showToast("Session expired. Please login again.", "error");
    return;
  }

  currentUser = data.session.user;
  currentRole = currentUser?.user_metadata?.role || null;
  currentLocationId = currentUser?.user_metadata?.location_id || null;
}

// -------------------------------------------------------------
// LOCATION VALIDATION
// -------------------------------------------------------------
function validateLocationSelection() {
  const locSelect = document.getElementById("auditLocationSelect");
  if (currentRole === "SuperAdmin" && !locSelect.value) {
    showToast("Please select a location", "error");
    return false;
  }
  return true;
}

// -------------------------------------------------------------
// MACHINE VALIDATION
// -------------------------------------------------------------
async function validateMachine(machineNo, locationId) {
  const { data } = await supabase
    .from("machines")
    .select("machineid, location_id")
    .eq("machineid", machineNo)
    .maybeSingle();

  if (!data) {
    showToast("Machine number not found", "error");
    return false;
  }

  if (data.location_id !== locationId) {
    showToast("Machine does not belong to this location", "error");
    return false;
  }

  return true;
}

// -------------------------------------------------------------
// FETCH PREVIOUS VALUES
// -------------------------------------------------------------
async function fetchPrevValues(machineNo) {
  const prevInEl = document.getElementById("auditPrevIn");
  const prevOutEl = document.getElementById("auditPrevOut");

  const { data } = await supabase
    .from("audit")
    .select("cur_in, cur_out")
    .eq("machine_no", machineNo)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  prevInEl.value = data?.cur_in ?? "";
  prevOutEl.value = data?.cur_out ?? "";
}

// -------------------------------------------------------------
// TOTALS RECALC (✅ FIXED)
// -------------------------------------------------------------
function recalcTotals() {
  const prevIn = Number(document.getElementById("auditPrevIn")?.value || 0);
  const prevOut = Number(document.getElementById("auditPrevOut")?.value || 0);
  const curIn = Number(document.getElementById("auditCurIn")?.value || 0);
  const curOut = Number(document.getElementById("auditCurOut")?.value || 0);
  const jackpot = Number(document.getElementById("auditJackpot")?.value || 0);

  const totalIn = curIn - prevIn;
  const totalOut = curOut - prevOut;
  const net = totalIn - totalOut - jackpot;

  document.getElementById("auditTotalIn").value = totalIn;
  document.getElementById("auditTotalOut").value = totalOut;
  document.getElementById("auditNet").value = net;
}

// -------------------------------------------------------------
// RESET FORM
// -------------------------------------------------------------
function resetAuditForm() {
  editMode = false;
  editingAuditId = null;

  document.getElementById("auditEntryDate").value = today();
  document.getElementById("auditMachineNo").value = "";
  document.getElementById("auditMachineNo").readOnly = false;
  document.getElementById("auditPrevIn").value = "";
  document.getElementById("auditPrevOut").value = "";
  document.getElementById("auditCurIn").value = "";
  document.getElementById("auditCurOut").value = "";
  document.getElementById("auditJackpot").value = "";
  document.getElementById("auditMachineHealth").value = "";
  document.getElementById("auditTotalIn").value = "";
  document.getElementById("auditTotalOut").value = "";
  document.getElementById("auditNet").value = "";
}

// -------------------------------------------------------------
// LOAD LOCATIONS (✅ RESTORED)
// -------------------------------------------------------------
async function loadLocations() {
  const select = document.getElementById("auditLocationSelect");
  const { data } = await supabase.from("locations").select("id, name").order("name");

  select.innerHTML = "";

  data.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  });

  if (currentRole === "SuperAdmin") {
    const p = document.createElement("option");
    p.value = "";
    p.textContent = "-- Select Location --";
    p.disabled = true;
    p.selected = true;
    select.prepend(p);
  } else {
    select.value = currentLocationId;
    select.disabled = true;
  }
}

// -------------------------------------------------------------
// LOAD AUDITS (✅ RESTORED)
// -------------------------------------------------------------
async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  const filterDate = document.getElementById("auditFilterDate").value;
  const locationId = document.getElementById("auditLocationSelect").value || currentLocationId;

  let q = supabase.from("audit").select("*").eq("date", filterDate);
  if (locationId) q = q.eq("location_id", locationId);

  const { data } = await q.order("machine_no");
  tbody.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.dataset.machine = row.machine_no;

    const totalIn = row.cur_in - row.prev_in;
    const totalOut = row.cur_out - row.prev_out;
    const net = totalIn - totalOut - (row.jackpot || 0);

    tr.innerHTML = `
      <td>${row.machine_no}</td>
      <td>${row.prev_in}</td>
      <td>${row.prev_out}</td>
      <td>${row.cur_in}</td>
      <td>${row.cur_out}</td>
      <td>${row.jackpot || 0}</td>
      <td>${totalIn}</td>
      <td>${totalOut}</td>
      <td>${net}</td>
      <td>
        ${
          ["SuperAdmin","LocationAdmin"].includes(currentRole)
            ? `<button class="btn btn-danger auditDeleteBtn" data-id="${row.id}">Delete</button>`
            : ""
        }
      </td>
    `;

    tr.onclick = () => loadAuditEntryForEdit(row.machine_no, filterDate, locationId);
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// LOAD ENTRY FOR EDIT
// -------------------------------------------------------------
async function loadAuditEntryForEdit(machineNo, date, locationId) {
  const { data } = await supabase
    .from("audit")
    .select("*")
    .eq("machine_no", machineNo)
    .eq("date", date)
    .eq("location_id", locationId)
    .maybeSingle();

  if (!data) return;

  editMode = true;
  editingAuditId = data.id;

  document.getElementById("auditMachineNo").value = data.machine_no;
  document.getElementById("auditMachineNo").readOnly = true;
  document.getElementById("auditPrevIn").value = data.prev_in;
  document.getElementById("auditPrevOut").value = data.prev_out;
  document.getElementById("auditCurIn").value = data.cur_in;
  document.getElementById("auditCurOut").value = data.cur_out;
  document.getElementById("auditJackpot").value = data.jackpot || "";
  document.getElementById("auditMachineHealth").value = data.machine_health || "";

  recalcTotals();
}

// -------------------------------------------------------------
// SAVE
// -------------------------------------------------------------
async function saveAudit() {
  if (!validateLocationSelection()) return;

  const payload = {
    date: document.getElementById("auditEntryDate").value,
    machine_no: document.getElementById("auditMachineNo").value.trim(),
    prev_in: Number(document.getElementById("auditPrevIn").value || 0),
    prev_out: Number(document.getElementById("auditPrevOut").value || 0),
    cur_in: Number(document.getElementById("auditCurIn").value),
    cur_out: Number(document.getElementById("auditCurOut").value),
    jackpot: Number(document.getElementById("auditJackpot").value || 0),
    location_id: document.getElementById("auditLocationSelect").value || currentLocationId,
    user_id: currentUser.id,
    machine_health: document.getElementById("auditMachineHealth").value
  };

  if (editMode) {
    await supabase.from("audit").update(payload).eq("id", editingAuditId);
    showToast("Updated successfully", "success");
  } else {
    await supabase.from("audit").insert(payload);
    showToast("Saved successfully", "success");
  }

  resetAuditForm();
  await loadAudits();
}

// -------------------------------------------------------------
// UI BINDINGS (✅ FIXED)
// -------------------------------------------------------------
function bindUI() {
  document.getElementById("auditSaveBtn").onclick = saveAudit;
  document.getElementById("auditResetBtn").onclick = resetAuditForm;

  document.getElementById("auditCurIn").addEventListener("input", recalcTotals);
  document.getElementById("auditCurOut").addEventListener("input", recalcTotals);
  document.getElementById("auditJackpot").addEventListener("input", recalcTotals);

  document.getElementById("auditFilterDate").addEventListener("change", loadAudits);
  document.getElementById("auditLocationSelect").addEventListener("change", loadAudits);
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();

  document.getElementById("auditFilterDate").value = today();
  document.getElementById("auditEntryDate").value = today();

  await loadLocations();
  bindUI();
  await loadAudits();
}

window.addEventListener("auditModuleLoaded", initAuditModule);
