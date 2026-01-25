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
// DATE FIX
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

// -------------------------------------------------------------
// SESSION
// -------------------------------------------------------------
async function loadSessionInfo() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session) {
      showToast("Session expired. Please login again.", "error");
      return;
    }

    currentUser = session.user;
    currentRole = currentUser?.user_metadata?.role || null;
    currentLocationId = currentUser?.user_metadata?.location_id || null;

    console.log("SESSION:", { currentRole, currentLocationId });

  } catch (err) {
    console.error("loadSessionInfo error:", err);
  }
}

// -------------------------------------------------------------
// LOCATION VALIDATION
// -------------------------------------------------------------
function validateLocationSelection() {
  const locSelect = document.getElementById("auditLocationSelect");

  if (currentRole === "SuperAdmin") {
    if (!locSelect.value) {
      showToast("Please select a location", "error");
      return false;
    }
  }

  return true;
}

// -------------------------------------------------------------
// MACHINE VALIDATION (NO MORE ACTIVE CHECK)
// -------------------------------------------------------------
async function validateMachine(machineNo, locationId) {
  const { data, error } = await supabase
    .from("machines")
    .select("machineid, location_id")
    .eq("machineid", machineNo)
    .maybeSingle();

  if (error || !data) {
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
// FETCH PREVIOUS VALUES (INSERT MODE ONLY)
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

  if (!data) {
    prevInEl.value = "";
    prevOutEl.value = "";
    return;
  }

  prevInEl.value = data.cur_in ?? 0;
  prevOutEl.value = data.cur_out ?? 0;
}

// -------------------------------------------------------------
// LOAD ENTRY FOR EDIT
// -------------------------------------------------------------
async function loadAuditEntryForEdit(machineNo, date, locationId) {
  const { data, error } = await supabase
    .from("audit")
    .select("*")
    .eq("machine_no", machineNo)
    .eq("date", date)
    .eq("location_id", locationId)
    .maybeSingle();

  if (error || !data) return false;

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
// SAVE (INSERT OR UPDATE)
// -------------------------------------------------------------
async function saveAudit() {
  try {
    if (!validateLocationSelection()) return;

    const date = document.getElementById("auditEntryDate").value || today();
    const machineNo = document.getElementById("auditMachineNo").value.trim();
    const locationId =
      document.getElementById("auditLocationSelect").value ||
      currentLocationId;

    const curIn = toNumberOrNull(document.getElementById("auditCurIn").value);
    const curOut = toNumberOrNull(document.getElementById("auditCurOut").value);
    const jackpot = toNumberOrNull(document.getElementById("auditJackpot").value);
    const machineHealth = document.getElementById("auditMachineHealth").value || null;

    if (!machineNo) return showToast("Machine No required", "error");
    if (curIn === null || curOut === null)
      return showToast("Enter Cur IN/OUT", "error");

    const valid = await validateMachine(machineNo, locationId);
    if (!valid) return;

    let prevIn, prevOut;

    // -------------------------------------------------------------
    // EDIT MODE — DO NOT FETCH PREVIOUS VALUES
    // -------------------------------------------------------------
    if (editMode) {
      prevIn = Number(document.getElementById("auditPrevIn").value || 0);
      prevOut = Number(document.getElementById("auditPrevOut").value || 0);
    }

    // -------------------------------------------------------------
    // INSERT MODE — FETCH PREVIOUS VALUES
    // -------------------------------------------------------------
    else {
      await fetchPrevValues(machineNo);
      prevIn = Number(document.getElementById("auditPrevIn").value || 0);
      prevOut = Number(document.getElementById("auditPrevOut").value || 0);
    }

    if (curIn < prevIn) return showToast("Cur IN < Prev IN", "error");
    if (curOut < prevOut) return showToast("Cur OUT < Prev OUT", "error");

    const payload = {
      date,
      machine_no: machineNo,
      prev_in: prevIn,
      prev_out: prevOut,
      cur_in: curIn,
      cur_out: curOut,
      jackpot: jackpot ?? null,
      location_id: locationId,
      user_id: currentUser?.id || null,
      machine_health: machineHealth
    };

    let error;

    if (editMode && editingAuditId) {
      ({ error } = await supabase
        .from("audit")
        .update(payload)
        .eq("id", editingAuditId));
    } else {
      ({ error } = await supabase.from("audit").insert(payload));
    }

    if (error) {
      console.error("SAVE ERROR:", error);
      return showToast("Save failed", "error");
    }

    // UPDATE MACHINE HEALTH
    if (machineHealth) {
      await supabase
        .from("machines")
        .update({ healthstatus: machineHealth })
        .eq("machineid", machineNo);
    }

    showToast(editMode ? "Updated" : "Saved", "success");

    editMode = false;
    editingAuditId = null;

    resetAuditForm();
    await loadAudits();
    await refreshSummary();
    highlightRow(machineNo);

  } catch (err) {
    console.error("saveAudit error:", err);
    showToast("Unexpected error", "error");
  }
}

// -------------------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------------------
async function deleteAudit(id) {
  if (!confirm("Delete this entry?")) return;

  const { error } = await supabase.from("audit").delete().eq("id", id);

  if (error) return showToast("Delete failed", "error");

  showToast("Deleted", "success");
  await loadAudits();
  await refreshSummary();
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
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const select = document.getElementById("auditLocationSelect");
  if (!select) return;

  const { data } = await supabase
    .from("locations")
    .select("id, name")
    .order("name");

  select.innerHTML = "";

  (data || []).forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  });

  if (currentRole === "SuperAdmin") {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select Location --";
    placeholder.selected = true;
    placeholder.disabled = true;
    select.insertBefore(placeholder, select.firstChild);
  } else {
    select.value = currentLocationId;
    select.disabled = true;
  }
}

// -------------------------------------------------------------
// LOAD AUDITS TABLE
// -------------------------------------------------------------
async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  if (!tbody) return;

  const filterDate = document.getElementById("auditFilterDate")?.value || today();
  const locationId =
    document.getElementById("auditLocationSelect")?.value ||
    currentLocationId;

  let query = supabase
    .from("audit")
    .select("*")
    .eq("date", filterDate)
    .order("machine_no", { ascending: true });

  if (locationId) query = query.eq("location_id", locationId);

  const { data } = await query;

  tbody.innerHTML = "";

  (data || []).forEach(row => {
    const prevIn = Number(row.prev_in || 0);
    const prevOut = Number(row.prev_out || 0);
    const curIn = Number(row.cur_in || 0);
    const curOut = Number(row.cur_out || 0);

    const totalIn = curIn - prevIn;
    const totalOut = curOut - prevOut;
    const net = totalIn - totalOut;

    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    tr.dataset.machine = row.machine_no;

    tr.innerHTML = `
      <td>${row.machine_no}</td>
      <td>${row.prev_in}</td>
      <td>${row.prev_out}</td>
      <td>${row.cur_in}</td>
      <td>${row.cur_out}</td>
      <td>${totalIn}</td>
      <td>${totalOut}</td>
      <td>${net}</td>
      <td>
        ${
          currentRole === "SuperAdmin" ||
          currentRole === "LocationAdmin"
            ? `<button class="btn btn-danger auditDeleteBtn" data-id="${row.id}">Delete</button>`
            : ""
        }
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Row click → edit
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", async () => {
      const machineNo = tr.dataset.machine;
      const date = document.getElementById("auditFilterDate")?.value || today();
      const locationId =
        document.getElementById("auditLocationSelect")?.value ||
        currentLocationId;

      await loadAuditEntryForEdit(machineNo, date, locationId);
    });
  });

  // Delete buttons
  document.querySelectorAll(".auditDeleteBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await deleteAudit(btn.dataset.id);
    });
  });
}

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
async function refreshSummary() {
  const filterDate = document.getElementById("auditFilterDate")?.value || today();
  const locationId =
    document.getElementById("auditLocationSelect")?.value ||
    currentLocationId;

  let base = supabase
    .from("audit")
    .select("machine_no, prev_in, prev_out, cur_in, cur_out")
    .eq("date", filterDate);

  if (locationId) base = base.eq("location_id", locationId);

  const { data } = await base;

  const rows = data || [];
  const totalMachines = new Set(rows.map(r => r.machine_no)).size;

  const totalIn = rows.reduce((sum, r) => sum + (r.cur_in - r.prev_in), 0);
  const totalOut = rows.reduce((sum, r) => sum + (r.cur_out - r.prev_out), 0);
  const net = totalIn - totalOut;

  document.getElementById("summaryTotalMachines").textContent = totalMachines;
  document.getElementById("summaryTotalIn").textContent = totalIn;
  document.getElementById("summaryTotalOut").textContent = totalOut;
  document.getElementById("summaryNet").textContent = net;
}

// -------------------------------------------------------------
// UI BINDINGS
// -------------------------------------------------------------
function bindUI() {
  document.getElementById("auditSaveBtn")?.addEventListener("click", saveAudit);
  document.getElementById("auditResetBtn")?.addEventListener("click", resetAuditForm);

  document.getElementById("auditFilterDate")?.addEventListener("change", async () => {
    await loadAudits();
    await refreshSummary();
  });

  document.getElementById("auditLocationSelect")?.addEventListener("change", async () => {
    await loadAudits();
    await refreshSummary();
  });

  document.getElementById("auditMachineNo")?.addEventListener("change", async () => {
    const machineNo = document.getElementById("auditMachineNo").value.trim();
    if (!machineNo) return resetAuditForm();

    const date = document.getElementById("auditEntryDate")?.value || today();
    const locationId =
      document.getElementById("auditLocationSelect")?.value ||
      currentLocationId;

    const loaded = await loadAuditEntryForEdit(machineNo, date, locationId);
    if (!loaded) {
      editMode = false;
      editingAuditId = null;
      document.getElementById("auditMachineNo").readOnly = false;
      await fetchPrevValues(machineNo);
      recalcTotals();
    }
  });

  document.getElementById("auditCurIn")?.addEventListener("input", recalcTotals);
  document.getElementById("auditCurOut")?.addEventListener("input", recalcTotals);
}

// -------------------------------------------------------------
// MODULE INIT
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();

  document.getElementById("auditFilterDate").value = today();
  document.getElementById("auditEntryDate").value = today();

  await loadLocations();
  bindUI();
  await loadAudits();
  await refreshSummary();
}

console.log("AUDIT MODULE INITIALIZED");
initAuditModule();
