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
// MACHINE VALIDATION (NO ACTIVE ENFORCEMENT)
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

  const { data, error } = await supabase
    .from("audit")
    .select("cur_in, cur_out")
    .eq("machine_no", machineNo)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
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
      document.getElementById("auditLocationSelect").value || currentLocationId;

    const curIn = toNumberOrNull(document.getElementById("auditCurIn").value);
    const curOut = toNumberOrNull(document.getElementById("auditCurOut").value);
    const jackpot = toNumberOrNull(document.getElementById("auditJackpot").value);
    const machineHealth =
      document.getElementById("auditMachineHealth").value || null;

    if (!machineNo) {
      showToast("Machine No is required", "error");
      return;
    }

    if (curIn === null || curOut === null) {
      showToast("Please enter Cur IN and Cur OUT", "error");
      return;
    }

    const valid = await validateMachine(machineNo, locationId);
    if (!valid) return;

    let prevIn, prevOut;

    if (editMode) {
      prevIn = Number(document.getElementById("auditPrevIn").value || 0);
      prevOut = Number(document.getElementById("auditPrevOut").value || 0);
    } else {
      await fetchPrevValues(machineNo);
      prevIn = Number(document.getElementById("auditPrevIn").value || 0);
      prevOut = Number(document.getElementById("auditPrevOut").value || 0);
    }

    if (curIn < prevIn) {
      showToast("Cur IN cannot be less than Prev IN", "error");
      return;
    }

    if (curOut < prevOut) {
      showToast("Cur OUT cannot be less than Prev OUT", "error");
      return;
    }

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
      showToast("Save failed: " + (error.message || "DB error"), "error");
      return;
    }

    if (machineHealth) {
      await supabase
        .from("machines")
        .update({ healthstatus: machineHealth })
        .eq("machineid", machineNo);
    }

    showToast(editMode ? "Updated successfully" : "Saved successfully", "success");

    editMode = false;
    editingAuditId = null;

    resetAuditForm();
    await loadAudits();
    await refreshSummary();
    highlightRow(machineNo);
  } catch (err) {
    console.error("saveAudit error:", err);
    showToast("Unexpected error while saving", "error");
  }
}

// -------------------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------------------
async function deleteAudit(id) {
  if (!confirm("Delete this audit entry?")) return;

  const { error } = await supabase.from("audit").delete().eq("id", id);

  if (error) {
    showToast("Delete failed", "error");
    return;
  }

  showToast("Deleted successfully", "success");
  await loadAudits();
  await refreshSummary();
}

// -------------------------------------------------------------
// TOTALS RECALC
// -------------------------------------------------------------
function recalcTotals() {
  const prevIn = Number(document.getElementById("auditPrevIn")?.value || 0);
  const prevOut = Number(document.getElementById("auditPrevOut")?.value || 0);
  const curIn = Number(document.getElementById("auditCurIn")?.value || 0);
  const curOut = Number(document.getElementById("auditCurOut")?.value || 0);

  const totalIn = curIn - prevIn;
  const totalOut = curOut - prevOut;
  const net = totalIn - totalOut;

  const totalInInput = document.getElementById("auditTotalIn");
  const totalOutInput = document.getElementById("auditTotalOut");
  const netInput = document.getElementById("auditNet");

  if (totalInInput) totalInInput.value = Number.isFinite(totalIn) ? totalIn : "";
  if (totalOutInput) totalOutInput.value = Number.isFinite(totalOut) ? totalOut : "";
  if (netInput) netInput.value = Number.isFinite(net) ? net : "";
}

// -------------------------------------------------------------
// RESET FORM
// -------------------------------------------------------------
function resetAuditForm() {
  const entryDate = document.getElementById("auditEntryDate");
  const machineNo = document.getElementById("auditMachineNo");
  const prevIn = document.getElementById("auditPrevIn");
  const prevOut = document.getElementById("auditPrevOut");
  const curIn = document.getElementById("auditCurIn");
  const curOut = document.getElementById("auditCurOut");
  const jackpot = document.getElementById("auditJackpot");
  const health = document.getElementById("auditMachineHealth");
  const totalIn = document.getElementById("auditTotalIn");
  const totalOut = document.getElementById("auditTotalOut");
  const net = document.getElementById("auditNet");

  editMode = false;
  editingAuditId = null;

  if (entryDate) entryDate.value = today();
  if (machineNo) {
    machineNo.value = "";
    machineNo.readOnly = false;
    machineNo.focus();
  }
  if (prevIn) prevIn.value = "";
  if (prevOut) prevOut.value = "";
  if (curIn) curIn.value = "";
  if (curOut) curOut.value = "";
  if (jackpot) jackpot.value = "";
  if (health) health.value = "";
  if (totalIn) totalIn.value = "";
  if (totalOut) totalOut.value = "";
  if (net) net.value = "";
}

// -------------------------------------------------------------
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const select = document.getElementById("auditLocationSelect");
  if (!select) return;

  try {
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

    if (currentRole === "SuperAdmin") {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Select Location --";
      placeholder.selected = true;
      placeholder.disabled = true;
      select.insertBefore(placeholder, select.firstChild);
    } else if (currentLocationId) {
      select.value = currentLocationId;
      select.disabled = true;
    }
  } catch (err) {
    console.error("loadLocations unexpected error:", err);
  }
}

// -------------------------------------------------------------
// LOAD AUDITS TABLE
// -------------------------------------------------------------
async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  if (!tbody) return;

  try {
    const filterDate =
      document.getElementById("auditFilterDate")?.value || today();
    const locationId =
      document.getElementById("auditLocationSelect")?.value ||
      currentLocationId ||
      null;

    let query = supabase
      .from("audit")
      .select("id, machine_no, prev_in, prev_out, cur_in, cur_out, jackpot, machine_health, location_id")
      .eq("date", filterDate)
      .order("machine_no", { ascending: true });

    if (locationId) query = query.eq("location_id", locationId);

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
      const jackpot = Number(row.jackpot || 0);

      const totalIn = curIn - prevIn;
      const totalOut = curOut - prevOut;
      const net = totalIn - totalOut - jackpot;

      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.dataset.machine = row.machine_no || "";

      tr.innerHTML = `
        <td>${row.machine_no ?? ""}</td>
        <td>${row.prev_in ?? ""}</td>
        <td>${row.prev_out ?? ""}</td>
        <td>${row.cur_in ?? ""}</td>
        <td>${row.cur_out ?? ""}</td>
        <td>${Number.isFinite(totalIn) ? totalIn : ""}</td>
        <td>${Number.isFinite(totalOut) ? totalOut : ""}</td>
        <td>${Number.isFinite(net) ? net : ""}</td>
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

    tbody.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", async () => {
        const machineNo = tr.dataset.machine;
        const date =
          document.getElementById("auditFilterDate")?.value || today();
        const locationId =
          document.getElementById("auditLocationSelect")?.value ||
          currentLocationId ||
          null;
          document.getElementById("auditEntryDate").value = date;

        if (!machineNo || !locationId) return;

        await loadAuditEntryForEdit(machineNo, date, locationId);
      });
    });

    document.querySelectorAll(".auditDeleteBtn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await deleteAudit(id);
      });
    });
  } catch (err) {
    console.error("loadAudits unexpected error:", err);
  }
}

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
async function refreshSummary() {
  try {
    const filterDate =
      document.getElementById("auditFilterDate")?.value || today();
    const locationId =
      document.getElementById("auditLocationSelect")?.value ||
      currentLocationId ||
      null;

    let base = supabase
      .from("audit")
      .select("machine_no, prev_in, prev_out, cur_in, cur_out, jackpot")
      .eq("date", filterDate);

    if (locationId) base = base.eq("location_id", locationId);

    const { data, error } = await base;
    if (error) {
      console.error("refreshSummary error:", error);
      return;
    }

    const rows = data || [];
    const totalMachines = new Set(rows.map((r) => r.machine_no)).size;

    const totalIn = rows.reduce((sum, r) => {
      const prev = Number(r.prev_in || 0);
      const cur = Number(r.cur_in || 0);
      return sum + (cur - prev);
    }, 0);

    const totalOut = rows.reduce((sum, r) => {
      const prev = Number(r.prev_out || 0);
      const cur = Number(r.cur_out || 0);
      return sum + (cur - prev);
    }, 0);

    const totalJackpot = rows.reduce(
      (sum, r) => sum + Number(r.jackpot || 0),
      0
    );

    const net = totalIn - totalOut - totalJackpot;

    const elMachines = document.getElementById("summaryTotalMachines");
    const elJackpot = document.getElementById("summaryTotalJackpot");
    const elIn = document.getElementById("summaryTotalIn");
    const elOut = document.getElementById("summaryTotalOut");
    const elNet = document.getElementById("summaryNet");

    if (elMachines) elMachines.textContent = totalMachines || 0;
    if (elJackpot) elJackpot.textContent = formatCurrency(totalJackpot);
    if (elIn) elIn.textContent = formatCurrency(totalIn);
    if (elOut) elOut.textContent = formatCurrency(totalOut);
    if (elNet) elNet.textContent = formatCurrency(net);
  } catch (err) {
    console.error("refreshSummary unexpected error:", err);
  }
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
  const qrScanBtn = document.getElementById("qrScanBtn");
  const locSelect = document.getElementById("auditLocationSelect");

  if (saveBtn) saveBtn.addEventListener("click", saveAudit);
  if (resetBtn) resetBtn.addEventListener("click", resetAuditForm);

  if (filterDate) {
    filterDate.addEventListener("change", async () => {
      await loadAudits();
      await refreshSummary();
    });
  }

  if (locSelect) {
    locSelect.addEventListener("change", async () => {
      await loadAudits();
      await refreshSummary();
    });
  }

  if (machineNo) {
    machineNo.addEventListener("change", async () => {
      const val = machineNo.value.trim();
      if (!val) {
        resetAuditForm();
        return;
      }

      const date =
        document.getElementById("auditEntryDate")?.value || today();
      const locationId =
        document.getElementById("auditLocationSelect")?.value ||
        currentLocationId ||
        null;

      const loaded = await loadAuditEntryForEdit(val, date, locationId);
      if (!loaded) {
        editMode = false;
        editingAuditId = null;
        document.getElementById("auditMachineNo").readOnly = false;
        await fetchPrevValues(val);
        recalcTotals();
      }
    });
  }

  if (curIn) curIn.addEventListener("input", recalcTotals);
  if (curOut) curOut.addEventListener("input", recalcTotals);

  if (qrScanBtn) {
    qrScanBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!window.qrScanner || typeof window.qrScanner.open !== "function") {
        showToast("QR scanner not available", "error");
        return;
      }

      window.qrScanner.open({
        targetInputId: "auditMachineNo",
        onScan: async (value) => {
          const input = document.getElementById("auditMachineNo");
          if (input) {
            input.value = (value || "").trim();
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          showToast("QR scanned: " + value, "success");
        },
        context: "Audit Machine Scan"
      });
    });
  }
}

// -------------------------------------------------------------
// MODULE INIT
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();

  const filterDate = document.getElementById("auditFilterDate");
  const entryDate = document.getElementById("auditEntryDate");
  if (filterDate) filterDate.value = today();
  if (entryDate) entryDate.value = today();

  await loadLocations();
  bindUI();
  await loadAudits();
  await refreshSummary();
}

console.log("AUDIT MODULE INIT ATTACH");
window.addEventListener("auditModuleLoaded", () => {
  console.log("AUDIT MODULE LOADED EVENT FIRED");
  initAuditModule();
});
