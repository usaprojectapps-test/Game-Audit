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

  document.getElementById("auditPrevIn").value = data.prev_in ?? "";
  document.getElementById("auditPrevOut").value = data.prev_out ?? "";
  document.getElementById("auditCurIn").value = data.cur_in ?? "";
  document.getElementById("auditCurOut").value = data.cur_out ?? "";
  document.getElementById("auditJackpot").value = data.jackpot ?? "";
  document.getElementById("auditMachineHealth").value = data.machine_health ?? "";

  recalcTotals();
  highlightRow(machineNo);
  return true;
}

// -------------------------------------------------------------
// TOTALS RECALC  ✅ FIXED
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
    prev_in: Number(document.getElementById("auditPrevIn").value || 0),
    prev_out: Number(document.getElementById("auditPrevOut").value || 0),
    cur_in: curIn,
    cur_out: curOut,
    jackpot: jackpot ?? null,
    location_id: locationId,
    user_id: currentUser?.id || null,
    machine_health: document.getElementById("auditMachineHealth").value || null
  };

  let error;
  if (editMode && editingAuditId) {
    ({ error } = await supabase.from("audit").update(payload).eq("id", editingAuditId));
  } else {
    ({ error } = await supabase.from("audit").insert(payload));
  }

  if (error) {
    showToast("Save failed", "error");
    return;
  }

  showToast(editMode ? "Updated successfully" : "Saved successfully", "success");
  resetAuditForm();
  await loadAudits();
  await refreshSummary();
}

// -------------------------------------------------------------
// RESET
// -------------------------------------------------------------
function resetAuditForm() {
  editMode = false;
  editingAuditId = null;

  document.querySelectorAll(
    "#auditEntryDate, #auditMachineNo, #auditPrevIn, #auditPrevOut, #auditCurIn, #auditCurOut, #auditJackpot, #auditTotalIn, #auditTotalOut, #auditNet"
  ).forEach(el => el && (el.value = ""));

  document.getElementById("auditEntryDate").value = today();
  document.getElementById("auditMachineNo").readOnly = false;
}

// -------------------------------------------------------------
// UI BINDINGS  ✅ FIXED
// -------------------------------------------------------------
function bindUI() {
  document.getElementById("auditSaveBtn").onclick = saveAudit;
  document.getElementById("auditResetBtn").onclick = resetAuditForm;

  document.getElementById("auditCurIn")?.addEventListener("input", recalcTotals);
  document.getElementById("auditCurOut")?.addEventListener("input", recalcTotals);
  document.getElementById("auditJackpot")?.addEventListener("input", recalcTotals);
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();
  document.getElementById("auditEntryDate").value = today();
  document.getElementById("auditFilterDate").value = today();
  await loadLocations();
  bindUI();
  await loadAudits();
  await refreshSummary();
}

window.addEventListener("auditModuleLoaded", initAuditModule);
