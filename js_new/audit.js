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
  if (!data?.session) {
    showToast("Session expired. Please login again.", "error");
    return;
  }

  currentUser = data.session.user;
  currentRole = currentUser?.user_metadata?.role || null;
  currentLocationId = currentUser?.user_metadata?.location_id || null;
}

// -------------------------------------------------------------
// VALIDATIONS
// -------------------------------------------------------------
function validateLocationSelection() {
  const locSelect = document.getElementById("auditLocationSelect");
  if (currentRole === "SuperAdmin" && !locSelect.value) {
    showToast("Please select a location", "error");
    return false;
  }
  return true;
}

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
// TOTAL RECALC (✔ FIXED)
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

  document.getElementById("auditTotalIn").value = Number.isFinite(totalIn) ? totalIn : 0;
  document.getElementById("auditTotalOut").value = Number.isFinite(totalOut) ? totalOut : 0;
  document.getElementById("auditNet").value = Number.isFinite(net) ? net : 0;
}

// -------------------------------------------------------------
// FETCH PREVIOUS VALUES
// -------------------------------------------------------------
async function fetchPrevValues(machineNo) {
  const { data } = await supabase
    .from("audit")
    .select("cur_in, cur_out")
    .eq("machine_no", machineNo)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  document.getElementById("auditPrevIn").value = data?.cur_in ?? 0;
  document.getElementById("auditPrevOut").value = data?.cur_out ?? 0;

  recalcTotals(); // ✔ REQUIRED
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

  if (!data) return false;

  editMode = true;
  editingAuditId = data.id;

  document.getElementById("auditMachineNo").value = data.machine_no;
  document.getElementById("auditMachineNo").readOnly = true;

  document.getElementById("auditPrevIn").value = data.prev_in ?? 0;
  document.getElementById("auditPrevOut").value = data.prev_out ?? 0;
  document.getElementById("auditCurIn").value = data.cur_in ?? 0;
  document.getElementById("auditCurOut").value = data.cur_out ?? 0;
  document.getElementById("auditJackpot").value = data.jackpot ?? 0;
  document.getElementById("auditMachineHealth").value = data.machine_health ?? "";

  recalcTotals();
  highlightRow(machineNo);
  return true;
}

// -------------------------------------------------------------
// SAVE
// -------------------------------------------------------------
async function saveAudit() {
  if (!validateLocationSelection()) return;

  const date = document.getElementById("auditEntryDate").value || today();
  const machineNo = document.getElementById("auditMachineNo").value.trim();
  const locationId =
    document.getElementById("auditLocationSelect").value || currentLocationId;

  const curIn = toNumberOrNull(document.getElementById("auditCurIn").value);
  const curOut = toNumberOrNull(document.getElementById("auditCurOut").value);
  const jackpot = toNumberOrNull(document.getElementById("auditJackpot").value);

  if (!machineNo || curIn === null || curOut === null) {
    showToast("Required fields missing", "error");
    return;
  }

  if (!(await validateMachine(machineNo, locationId))) return;

  await fetchPrevValues(machineNo);

  const payload = {
    date,
    machine_no: machineNo,
    prev_in: Number(document.getElementById("auditPrevIn").value),
    prev_out: Number(document.getElementById("auditPrevOut").value),
    cur_in: curIn,
    cur_out: curOut,
    jackpot: jackpot ?? 0,
    location_id: locationId,
    user_id: currentUser?.id
  };

  let error;
  if (editMode) {
    ({ error } = await supabase.from("audit").update(payload).eq("id", editingAuditId));
  } else {
    ({ error } = await supabase.from("audit").insert(payload));
  }

  if (error) {
    showToast("Save failed", "error");
    return;
  }

  showToast(editMode ? "Updated" : "Saved", "success");
  resetAuditForm();
  await loadAudits();
  await refreshSummary();
}

// -------------------------------------------------------------
// RESET FORM
// -------------------------------------------------------------
function resetAuditForm() {
  editMode = false;
  editingAuditId = null;

  ["auditMachineNo","auditPrevIn","auditPrevOut","auditCurIn","auditCurOut","auditJackpot"]
    .forEach(id => document.getElementById(id).value = "");

  document.getElementById("auditMachineNo").readOnly = false;
  recalcTotals(); // ✔ REQUIRED
}

// -------------------------------------------------------------
// LOAD AUDITS TABLE
// -------------------------------------------------------------
async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  tbody.innerHTML = "";

  const date = document.getElementById("auditFilterDate").value || today();
  const locationId =
    document.getElementById("auditLocationSelect").value || currentLocationId;

  let q = supabase.from("audit").select("*").eq("date", date);
  if (locationId) q = q.eq("location_id", locationId);

  const { data } = await q;
  (data || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.dataset.machine = r.machine_no;
    tr.innerHTML = `
      <td>${r.machine_no}</td>
      <td>${r.prev_in}</td>
      <td>${r.prev_out}</td>
      <td>${r.cur_in}</td>
      <td>${r.cur_out}</td>
      <td>${r.jackpot}</td>
      <td>${r.cur_in - r.prev_in}</td>
      <td>${r.cur_out - r.prev_out}</td>
      <td>${(r.cur_in - r.prev_in) - (r.cur_out - r.prev_out) - r.jackpot}</td>
    `;
    tr.onclick = () =>
      loadAuditEntryForEdit(r.machine_no, date, locationId);
    tbody.appendChild(tr);
  });

  await refreshSummary(); // ✔ REQUIRED
}

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
async function refreshSummary() {
  const date = document.getElementById("auditFilterDate").value || today();
  const locationId =
    document.getElementById("auditLocationSelect").value || currentLocationId;

  let q = supabase.from("audit").select("*").eq("date", date);
  if (locationId) q = q.eq("location_id", locationId);

  const { data } = await q;

  const rows = data || [];
  const machines = new Set(rows.map(r => r.machine_no)).size;
  const totalIn = rows.reduce((s,r)=>s+(r.cur_in-r.prev_in),0);
  const totalOut = rows.reduce((s,r)=>s+(r.cur_out-r.prev_out),0);
  const jackpot = rows.reduce((s,r)=>s+r.jackpot,0);
  const net = totalIn - totalOut - jackpot;

  document.getElementById("summaryTotalMachines").textContent = machines;
  document.getElementById("summaryTotalJackpot").textContent = formatCurrency(jackpot);
  document.getElementById("summaryTotalIn").textContent = formatCurrency(totalIn);
  document.getElementById("summaryTotalOut").textContent = formatCurrency(totalOut);
  document.getElementById("summaryNet").textContent = formatCurrency(net);
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
window.addEventListener("auditModuleLoaded", async () => {
  await loadSessionInfo();
  document.getElementById("auditFilterDate").value = today();
  document.getElementById("auditEntryDate").value = today();

  document.getElementById("auditCurIn").addEventListener("input", recalcTotals);
  document.getElementById("auditCurOut").addEventListener("input", recalcTotals);
  document.getElementById("auditJackpot").addEventListener("input", recalcTotals);

  await loadAudits();
});
