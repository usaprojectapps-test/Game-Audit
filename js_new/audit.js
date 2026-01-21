// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

console.log("AUDIT JS LOADED");
window.supabase = supabase;

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
      console.warn("No session available yet");
      showToast("Session expired. Please login again.", "error");
      return;
    }
    currentUser = session.user;
    currentRole = currentUser?.user_metadata?.role || null;
    currentLocationId = currentUser?.user_metadata?.location_id || null;
    console.log("SESSION LOADED:", currentRole, currentLocationId);
  } catch (err) {
    console.error("loadSessionInfo error:", err);
  }
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
      await loadAuditEntryForEdit();
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
    /*const locationId =
      document.getElementById("auditLocationSelect")?.value || null;*/
      const locationId =
        document.getElementById("auditLocationSelect")?.value ||
        currentLocationId ||
        null;

    let query = supabase
      .from("audit")
      .select("id, machine_no, prev_in, prev_out, cur_in, cur_out")
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
      const totalIn = curIn - prevIn;
      const totalOut = curOut - prevOut;
      const net = totalIn - totalOut;

      const tr = document.createElement("tr");
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

    document.querySelectorAll(".auditDeleteBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;

        const { error } = await supabase
          .from("audit")
          .delete()
          .eq("id", id);

        if (error) {
          console.error("Delete error:", error);
          showToast("Delete failed", "error");
          return;
        }

        showToast("Deleted successfully", "success");
        await loadAudits();
        await refreshSummary();
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
// LOAD AUDIT ENTRY FOR EDIT
// -------------------------------------------------------------
async function loadAuditEntryForEdit() {
  const machineNo = document.getElementById("auditMachineNo")?.value?.trim();
  const date = document.getElementById("auditEntryDate")?.value || todayISO();
  if (!machineNo || !date) return;

  const { data, error } = await supabase
    .from("audit")
    .select("*")
    .eq("machine_no", machineNo)
    .eq("date", date)
    .maybeSingle();

  if (error || !data) return;

  const prevInEl = document.getElementById("auditPrevIn");
  const prevOutEl = document.getElementById("auditPrevOut");
  const curInEl = document.getElementById("auditCurIn");
  const curOutEl = document.getElementById("auditCurOut");
  const jackpotEl = document.getElementById("auditJackpot");
  const healthEl = document.getElementById("auditMachineHealth");

  if (prevInEl) prevInEl.value = data.prev_in ?? "";
  if (prevOutEl) prevOutEl.value = data.prev_out ?? "";
  if (curInEl) curInEl.value = data.cur_in ?? "";
  if (curOutEl) curOutEl.value = data.cur_out ?? "";
  if (jackpotEl) jackpotEl.value = data.jackpot ?? "";
  if (healthEl) healthEl.value = data.machine_health ?? "";

  recalcTotals();
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

    const machineNoRaw =
      document.getElementById("auditMachineNo")?.value.trim() || "";

    const match = machineNoRaw.match(/(\d{1,5}-\d{1,5})/);
    const machineNo = match ? match[1] : machineNoRaw;

    const locationId =
      document.getElementById("auditLocationSelect")?.value ||
      currentLocationId ||
      null;

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

    // Audit role date restriction: only today or yesterday
    const entryDateObj = new Date(date);
    const today = new Date(todayISO());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const entryISO = entryDateObj.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const isTodayOrYesterday =
      entryISO === todayStr || entryISO === yesterdayStr;

    if (currentRole === "Audit" && !isTodayOrYesterday) {
      showToast("Audit role can only edit today or yesterday", "error");
      return;
    }

    // Duplicate check (machine + date + location)
    let dupQuery = supabase
      .from("audit")
      .select("id")
      .eq("machine_no", machineNo)
      .eq("date", date);

    if (locationId) dupQuery = dupQuery.eq("location_id", locationId);

    const { data: dupData, error: dupErr } = await dupQuery.maybeSingle();

    if (dupErr) {
      console.error("Duplicate check error:", dupErr);
      showToast("Database error while checking duplicates", "error");
      return;
    }
    if (dupData) {
      showToast(
        "Entry already exists for this machine and date",
        "error"
      );
      return;
    }

    // Ensure prev values
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

    console.log("INSERT PAYLOAD:", payload);

    const { error } = await supabase.from("audit").insert(payload);

    if (!error && machineHealth) {
      const { error: machineErr } = await supabase
        .from("machines")
        .update({ healthstatus: machineHealth })
        .eq("machineid", machineNo);

      if (machineErr) {
        console.error("Machine health update error:", machineErr);
        showToast("Audit saved, but machine health update failed", "error");
      }
    }

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
// MODULE INIT
// -------------------------------------------------------------
async function initAuditModule() {
  await loadSessionInfo();
  setDefaultDates();
  await loadLocations();
  await loadMachineNumbers();
  bindUI();
  await loadAudits();
  await refreshSummary();
}

console.log("AUDIT LISTENER ATTACHED");
window.addEventListener("auditModuleLoaded", () => {
  console.log("AUDIT MODULE LOADED EVENT FIRED");
  initAuditModule();
});
