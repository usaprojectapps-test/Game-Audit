// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

console.log("AUDIT JS LOADED");

// -------------------------------------------------------------
// STATE
// -------------------------------------------------------------
let currentUser = null;
let currentRole = null;
let currentLocationId = null;

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10);

const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// -------------------------------------------------------------
// SESSION LOADER
// -------------------------------------------------------------
async function loadSessionInfo() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  if (!session) {
    console.warn("No session available yet");
    return false;
  }

  currentUser = session.user;
  currentRole = currentUser?.user_metadata?.role || null;
  currentLocationId = currentUser?.user_metadata?.location_id || null;

  console.log("SESSION LOADED:", currentRole, currentLocationId);
  return true;
}

// -------------------------------------------------------------
// WAIT FOR SESSION BEFORE LOADING MODULE
// -------------------------------------------------------------
async function initAuditModule() {
  console.log("INIT AUDIT MODULE START");

  // 1. Try to load session immediately
  let sessionReady = await loadSessionInfo();

  if (!sessionReady) {
    console.log("Waiting for session via onAuthStateChange...");
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        console.log("Session restored via auth state change");
        await loadSessionInfo();
        await startAuditModule();
      }
    });
    return;
  }

  // 2. Session already available
  await startAuditModule();
}

// -------------------------------------------------------------
// MAIN MODULE INITIALIZER
// -------------------------------------------------------------
async function startAuditModule() {
  console.log("START AUDIT MODULE");

  setDefaultDates();
  await loadLocations();
  await loadMachineNumbers();
  bindUI();
  await loadAudits();
  await refreshSummary();
}

// -------------------------------------------------------------
// DEFAULT DATES
// -------------------------------------------------------------
function setDefaultDates() {
  const filterDate = document.getElementById("auditFilterDate");
  const entryDate = document.getElementById("auditEntryDate");
  const today = todayISO();

  if (filterDate) filterDate.value = today;
  if (entryDate) entryDate.value = today;
}

// -------------------------------------------------------------
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const select = document.getElementById("auditLocationSelect");
  if (!select) return;

  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("loadLocations error:", error);
    return;
  }

  select.innerHTML = "";
  (data || []).forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  });

  if (currentLocationId) select.value = currentLocationId;
}

// -------------------------------------------------------------
// LOAD MACHINE NUMBERS
// -------------------------------------------------------------
async function loadMachineNumbers() {
  const select = document.getElementById("auditMachineNo");
  if (!select) return;

  let query = supabase.from("machines").select("machineid, location_id");

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocationId);
  }

  const { data, error } = await query.order("machineid");

  if (error) {
    console.error("loadMachineNumbers error:", error);
    return;
  }

  select.innerHTML = `<option value="">Select Machine</option>`;
  (data || []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.machineid;
    opt.textContent = m.machineid;
    select.appendChild(opt);
  });
}

// -------------------------------------------------------------
// UI BINDINGS
// -------------------------------------------------------------
function bindUI() {
  const saveBtn = document.getElementById("auditSaveBtn");
  const resetBtn = document.getElementById("auditResetBtn");
  const filterDate = document.getElementById("auditFilterDate");
  const machineNo = document.getElementById("auditMachineNo");
  const curIn = document.getElementById("auditCurIn");
  const curOut = document.getElementById("auditCurOut");

  if (saveBtn) saveBtn.addEventListener("click", saveAudit);
  if (resetBtn) resetBtn.addEventListener("click", resetAuditForm);

  if (filterDate) {
    filterDate.addEventListener("change", async () => {
      await loadAudits();
      await refreshSummary();
    });
  }

  if (machineNo) {
    machineNo.addEventListener("change", async () => {
      await fetchAndSetPrevValues();
      await loadAuditEntryForEdit();
      recalcTotals();
    });
  }

  if (curIn) curIn.addEventListener("input", recalcTotals);
  if (curOut) curOut.addEventListener("input", recalcTotals);
}

// -------------------------------------------------------------
// LOAD AUDITS TABLE
// -------------------------------------------------------------
async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  if (!tbody) return;

  const filterDate =
    document.getElementById("auditFilterDate")?.value || todayISO();

  let query = supabase
    .from("audit")
    .select("id, machine_no, prev_in, prev_out, cur_in, cur_out")
    .eq("date", filterDate)
    .order("machine_no", { ascending: true });

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("loadAudits error:", error);
    return;
  }

  tbody.innerHTML = "";

  (data || []).forEach((row) => {
    const prevIn = Number(row.prev_in || 0);
    const prevOut = Number(row.prev_out || 0);
    const curIn = Number(row.cur_in || 0);
    const curOut = Number(row.cur_out || 0);

    const totalIn = curIn - prevIn;
    const totalOut = curOut - prevOut;
    const net = totalIn - totalOut;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.machine_no}</td>
      <td>${row.prev_in}</td>
      <td>${row.prev_out}</td>
      <td>${row.cur_in}</td>
      <td>${row.cur_out}</td>
      <td>${totalIn}</td>
      <td>${totalOut}</td>
      <td>${net}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
async function refreshSummary() {
  const filterDate =
    document.getElementById("auditFilterDate")?.value || todayISO();

  let query = supabase
    .from("audit")
    .select("machine_no, prev_in, prev_out, cur_in, cur_out")
    .eq("date", filterDate);

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("refreshSummary error:", error);
    return;
  }

  const rows = data || [];

  const totalMachines = new Set(rows.map((r) => r.machine_no)).size;

  const totalIn = rows.reduce((sum, r) => sum + (r.cur_in - r.prev_in), 0);
  const totalOut = rows.reduce((sum, r) => sum + (r.cur_out - r.prev_out), 0);
  const net = totalIn - totalOut;

  document.getElementById("summaryTotalMachines").textContent =
    totalMachines || 0;
  document.getElementById("summaryTotalIn").textContent = totalIn || 0;
  document.getElementById("summaryTotalOut").textContent = totalOut || 0;
  document.getElementById("summaryNet").textContent = net || 0;
}

// -------------------------------------------------------------
// LOAD AUDIT ENTRY FOR EDIT
// -------------------------------------------------------------
async function loadAuditEntryForEdit() {
  const machineNo =
    document.getElementById("auditMachineNo")?.value?.trim() || "";
  const date =
    document.getElementById("auditEntryDate")?.value || todayISO();

  if (!machineNo) return;

  let query = supabase
    .from("audit")
    .select("*")
    .eq("machine_no", machineNo)
    .eq("date", date);

  if (currentRole !== "SuperAdmin") {
    query = query.eq("location_id", currentLocationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return;

  document.getElementById("auditPrevIn").value = data.prev_in ?? "";
  document.getElementById("auditPrevOut").value = data.prev_out ?? "";
  document.getElementById("auditCurIn").value = data.cur_in ?? "";
  document.getElementById("auditCurOut").value = data.cur_out ?? "";
  document.getElementById("auditJackpot").value = data.jackpot ?? "";
  document.getElementById("auditMachineHealth").value =
    data.machine_health ?? "";

  recalcTotals();
}

// -------------------------------------------------------------
// PREV IN/OUT FETCH
// -------------------------------------------------------------
async function fetchAndSetPrevValues() {
  const machineNo =
    document.getElementById("auditMachineNo")?.value?.trim() || "";

  if (!machineNo) return;

  const { data, error } = await supabase
    .from("audit")
    .select("cur_in, cur_out")
    .eq("machine_no", machineNo)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchAndSetPrevValues error:", error);
    return;
  }

  document.getElementById("auditPrevIn").value = data?.cur_in ?? "";
  document.getElementById("auditPrevOut").value = data?.cur_out ?? "";
}

// -------------------------------------------------------------
// TOTALS
// -------------------------------------------------------------
function recalcTotals() {
  const prevIn = Number(document.getElementById("auditPrevIn")?.value || 0);
  const prevOut = Number(document.getElementById("auditPrevOut")?.value || 0);
  const curIn = Number(document.getElementById("auditCurIn")?.value || 0);
  const curOut = Number(document.getElementById("auditCurOut")?.value || 0);

  const totalIn = curIn - prevIn;
  const totalOut = curOut - prevOut;
  const net = totalIn - totalOut;

  document.getElementById("auditTotalIn").value = totalIn;
  document.getElementById("auditTotalOut").value = totalOut;
  document.getElementById("auditNet").value = net;
}

// -------------------------------------------------------------
// RESET FORM
// -------------------------------------------------------------
function resetAuditForm() {
  document.getElementById("auditEntryDate").value = todayISO();
  document.getElementById("auditMachineNo").value = "";
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
// SAVE AUDIT ENTRY
// -------------------------------------------------------------
async function saveAudit() {
  const date =
    document.getElementById("auditEntryDate")?.value || todayISO();
  const machineNoRaw =
    document.getElementById("auditMachineNo")?.value.trim() || "";

  const match = machineNoRaw.match(/(\d{1,5}-\d{1,5})/);
  const machineNo = match ? match[1] : machineNoRaw;

  if (!machineNo) {
    showToast("Machine No is required", "error");
    return;
  }

  // Validate machine exists
  const { data: machineExists } = await supabase
    .from("machines")
    .select("machineid")
    .eq("machineid", machineNo)
    .maybeSingle();

  if (!machineExists) {
    showToast("Invalid machine number", "error");
    return;
  }

  // Duplicate check
  let dupQuery = supabase
    .from("audit")
    .select("id")
    .eq("machine_no", machineNo)
    .eq("date", date);

  if (currentRole !== "SuperAdmin") {
    dupQuery = dupQuery.eq("location_id", currentLocationId);
  }

  const { data: dupData } = await dupQuery.maybeSingle();

  if (dupData) {
    showToast("Entry already exists", "error");
    return;
  }

  const prevIn =
    toNumberOrNull(document.getElementById("auditPrevIn")?.value) ?? 0;
  const prevOut =
    toNumberOrNull(document.getElementById("auditPrevOut")?.value) ?? 0;
  const curIn =
    toNumberOrNull(document.getElementById("auditCurIn")?.value) ?? 0;
  const curOut =
    toNumberOrNull(document.getElementById("auditCurOut")?.value) ?? 0;
  const jackpot =
    toNumberOrNull(document.getElementById("auditJackpot")?.value) ?? null;
  const machineHealth =
    document.getElementById("auditMachineHealth")?.value || null;

            console.log("INSERT PAYLOAD:", payload);

  const payload = {
    date,
    machine_no: machineNo,
    prev_in: prevIn,
    prev_out: prevOut,
    cur_in: curIn,
    cur_out: curOut,
    jackpot,
    location_id: currentLocationId,
    user_id: currentUser?.id || null,
    machine_health: machineHealth
  };

  const { error } = await supabase.from("audit").insert(payload);

  if (error) {
    console.error("Save error:", error);
    showToast("Save failed", "error");
    return;
  }

  showToast("Saved successfully", "success");
  resetAuditForm();
  await loadAudits();
  await refreshSummary();
}

// -------------------------------------------------------------
// EVENT LISTENER
// -------------------------------------------------------------
window.addEventListener("auditModuleLoaded", () => {
  console.log("AUDIT MODULE LOADED EVENT FIRED");
  initAuditModule();
});
