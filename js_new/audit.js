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
// SESSION / PROFILE
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
  } catch (err) {
    console.error("loadSessionInfo error:", err);
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
      recalcTotals();
    });
    machineNo.addEventListener("blur", async () => {
      await fetchAndSetPrevValues();
      recalcTotals();
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

    if (currentLocationId) select.value = currentLocationId;
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
      document.getElementById("auditFilterDate")?.value || todayISO();
    const locationId =
      document.getElementById("auditLocationSelect")?.value || null;

    let query = supabase
      .from("audit")
      .select(
        "id, date, machine_no, prev_in, prev_out, cur_in, cur_out, jackpot, location_id, user_id, created_at"
      )
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
      const tr = document.createElement("tr");

      const prevIn = Number(row.prev_in || 0);
      const prevOut = Number(row.prev_out || 0);
      const curIn = Number(row.cur_in || 0);
      const curOut = Number(row.cur_out || 0);
      const totalIn = curIn - prevIn;
      const totalOut = curOut - prevOut;
      const net = totalIn - totalOut;

      tr.innerHTML = `
        <td>${row.date ?? ""}</td>
        <td>${row.machine_no ?? ""}</td>
        <td>${row.prev_in ?? ""}</td>
        <td>${row.prev_out ?? ""}</td>
        <td>${row.cur_in ?? ""}</td>
        <td>${row.cur_out ?? ""}</td>
        <td>${Number.isFinite(totalIn) ? totalIn : ""}</td>
        <td>${Number.isFinite(totalOut) ? totalOut : ""}</td>
        <td>${Number.isFinite(net) ? net : ""}</td>
        <td>${row.user_id ?? ""}</td>
        <td></td>
      `;
      tbody.appendChild(tr);
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
      document.getElementById("auditFilterDate")?.value || todayISO();
    const locationId =
      document.getElementById("auditLocationSelect")?.value || null;

    let base = supabase
      .from("audit")
      .select("machine_no, prev_in, prev_out, cur_in, cur_out")
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

    const net = totalIn - totalOut;

    const elMachines = document.getElementById("summaryTotalMachines");
    const elIn = document.getElementById("summaryTotalIn");
    const elOut = document.getElementById("summaryTotalOut");
    const elNet = document.getElementById("summaryNet");

    if (elMachines) elMachines.textContent = totalMachines || 0;
    if (elIn) elIn.textContent = totalIn || 0;
    if (elOut) elOut.textContent = totalOut || 0;
    if (elNet) elNet.textContent = net || 0;
  } catch (err) {
    console.error("refreshSummary unexpected error:", err);
  }
}

// -------------------------------------------------------------
// PREV IN/OUT FETCH
// -------------------------------------------------------------
async function fetchAndSetPrevValues() {
  const machineNo =
    document.getElementById("auditMachineNo")?.value?.trim() || "";
  const prevIn = document.getElementById("auditPrevIn");
  const prevOut = document.getElementById("auditPrevOut");

  if (!machineNo) {
    if (prevIn) prevIn.value = "";
    if (prevOut) prevOut.value = "";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("audit")
      .select("cur_in, cur_out, date")
      .eq("machine_no", machineNo)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("fetchAndSetPrevValues error:", error);
      if (prevIn) prevIn.value = "";
      if (prevOut) prevOut.value = "";
      return;
    }

    if (data) {
      if (prevIn) prevIn.value = data.cur_in ?? 0;
      if (prevOut) prevOut.value = data.cur_out ?? 0;
    } else {
      if (prevIn) prevIn.value = "";
      if (prevOut) prevOut.value = "";
    }
  } catch (err) {
    console.error("fetchAndSetPrevValues unexpected error:", err);
    if (prevIn) prevIn.value = "";
    if (prevOut) prevOut.value = "";
  }
}

// -------------------------------------------------------------
// TOTALS
// -------------------------------------------------------------
function recalcTotals() {
  const prevIn = Number(
    document.getElementById("auditPrevIn")?.value || 0
  );
  const prevOut = Number(
    document.getElementById("auditPrevOut")?.value || 0
  );
  const curIn = Number(
    document.getElementById("auditCurIn")?.value || 0
  );
  const curOut = Number(
    document.getElementById("auditCurOut")?.value || 0
  );

  const totalIn = curIn - prevIn;
  const totalOut = curOut - prevOut;
  const net = totalIn - totalOut;

  const totalInInput = document.getElementById("auditTotalIn");
  const totalOutInput = document.getElementById("auditTotalOut");
  const netInput = document.getElementById("auditNet");

  if (totalInInput)
    totalInInput.value = Number.isFinite(totalIn) ? totalIn : "";
  if (totalOutInput)
    totalOutInput.value = Number.isFinite(totalOut) ? totalOut : "";
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

  if (entryDate) entryDate.value = todayISO();
  if (machineNo) machineNo.value = "";
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
// SAVE
// -------------------------------------------------------------
async function saveAudit() {
  try {
    if (!currentUser) await loadSessionInfo();

    const date =
      document.getElementById("auditEntryDate")?.value || todayISO();
    /* const machineNo =
      (document.getElementById("auditMachineNo")?.value || "").trim(); */

      let machineNo = document.getElementById("auditMachineNo")?.value.trim() || "";

      // Extract only digits (in case user types manually)
      const match = machineNo.match(/(\d+)/);
      if (match) machineNo = match[1];

    const locationId =
      document.getElementById("auditLocationSelect")?.value || null;

    const prevInRaw = document.getElementById("auditPrevIn")?.value;
    const prevOutRaw = document.getElementById("auditPrevOut")?.value;
    const curIn =
      toNumberOrNull(document.getElementById("auditCurIn")?.value) ?? 0;
    const curOut =
      toNumberOrNull(document.getElementById("auditCurOut")?.value) ?? 0;
    const jackpot =
      toNumberOrNull(document.getElementById("auditJackpot")?.value) ??
      null;
    const machineHealth =
      document.getElementById("auditMachineHealth")?.value || null;

    if (!machineNo) {
      showToast("Machine No is required", "error");
      return;
    }

    // Duplicate check
    const { data: dupData, error: dupErr } = await supabase
      .from("audit")
      .select("id")
      .eq("machine_no", machineNo)
      .eq("date", date)
      .maybeSingle();

    if (dupErr) {
      console.error("Duplicate check error:", dupErr);
      showToast("Unable to validate duplicate entry", "error");
      return;
    }
    if (dupData) {
      showToast(
        "Entry already exists for this machine and date",
        "error"
      );
      return;
    }

    // Ensure prev values present
    if (prevInRaw === "" || prevOutRaw === "") {
      await fetchAndSetPrevValues();
    }

    const finalPrevIn =
      toNumberOrNull(document.getElementById("auditPrevIn")?.value) ?? 0;
    const finalPrevOut =
      toNumberOrNull(document.getElementById("auditPrevOut")?.value) ?? 0;

    const totalIn = curIn - finalPrevIn;
    const totalOut = curOut - finalPrevOut;
    const net = totalIn - totalOut;

    const payload = {
      date,
      machine_no: machineNo,
      prev_in: finalPrevIn,
      prev_out: finalPrevOut,
      cur_in: curIn,
      cur_out: curOut,
      jackpot: jackpot ?? null,
      location_id: locationId,
      user_id: currentUser?.id || null,
      machine_health: machineHealth || null
    };

    Object.keys(payload).forEach(
      (k) => payload[k] === undefined && delete payload[k]
    );

    const { error } = await supabase.from("audit").insert(payload);

    if (error) {
      console.error("Supabase insert error:", error);
      showToast(
        "Save failed: " + (error.message || "database error"),
        "error"
      );
      return;
    }

    const totalInInput = document.getElementById("auditTotalIn");
    const totalOutInput = document.getElementById("auditTotalOut");
    const netInput = document.getElementById("auditNet");
    if (totalInInput)
      totalInInput.value = Number.isFinite(totalIn) ? totalIn : "";
    if (totalOutInput)
      totalOutInput.value = Number.isFinite(totalOut) ? totalOut : "";
    if (netInput) netInput.value = Number.isFinite(net) ? net : "";

    showToast("Audit saved successfully", "success");
    resetAuditForm();
    await loadAudits();
    await refreshSummary();
  } catch (err) {
    console.error("Unexpected save error:", err);
    showToast("Unexpected error while saving", "error");
  }
}

// -------------------------------------------------------------
// MODULE INIT (FOR DASHBOARD LOADER)
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();
  bindUI();
  setDefaultDates();
  await loadLocations();
  await loadAudits();
  await refreshSummary();
}

// IMPORTANT: this is how your dashboard loader triggers the module
window.addEventListener("auditModuleLoaded", () => {
  initAuditModule();
});
console.log("AUDIT LISTENER ATTACHED");
window.addEventListener("auditModuleLoaded", () => {
  console.log("AUDIT MODULE LOADED EVENT FIRED");
  initAuditModule();
});
