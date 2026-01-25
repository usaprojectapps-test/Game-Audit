// ======================================================
// AUDIT MODULE - FULL FEATURED SCRIPT
// ======================================================

// ---------- GLOBAL STATE ----------
let AUDIT_SELECTED_ID = null;
let AUDIT_USER = null;
let AUDIT_ROLE = null;
let AUDIT_LOCATION_ID = null;

// ---------- ENTRY POINT ----------
document.addEventListener("DOMContentLoaded", () => {
  initAuditModule();
});

// ======================================================
// INIT
// ======================================================
async function initAuditModule() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      console.error("No session", error);
      return;
    }

    AUDIT_USER = data.session.user.user_metadata;
    AUDIT_ROLE = AUDIT_USER.role;
    AUDIT_LOCATION_ID = AUDIT_USER.location_id || null;

    wireAuditEvents();
    await loadAuditLocations();
    await loadAuditMachines();
    await loadAuditTable();
    auditRecalculateTotals();
  } catch (err) {
    console.error("initAuditModule error", err);
  }
}

// ======================================================
// EVENT WIRING
// ======================================================
function wireAuditEvents() {
  const locSelect = document.getElementById("auditLocationSelect");
  const dateFrom = document.getElementById("auditDateFrom");
  const dateTo = document.getElementById("auditDateTo");
  const machineFilter = document.getElementById("auditMachineFilter");
  const healthFilter = document.getElementById("auditHealthFilter");
  const btnSave = document.getElementById("auditSaveBtn");
  const btnClear = document.getElementById("auditClearBtn");
  const btnNew = document.getElementById("auditNewBtn");
  const btnDelete = document.getElementById("auditDeleteBtn");

  if (locSelect) locSelect.addEventListener("change", async () => {
    await loadAuditMachines();
    await loadAuditTable();
  });

  if (dateFrom) dateFrom.addEventListener("change", loadAuditTable);
  if (dateTo) dateTo.addEventListener("change", loadAuditTable);
  if (machineFilter) machineFilter.addEventListener("input", debounce(loadAuditTable, 300));
  if (healthFilter) healthFilter.addEventListener("change", loadAuditTable);

  if (btnSave) btnSave.addEventListener("click", saveAuditEntry);
  if (btnClear) btnClear.addEventListener("click", () => {
    AUDIT_SELECTED_ID = null;
    clearAuditForm(false);
  });
  if (btnNew) btnNew.addEventListener("click", () => {
    AUDIT_SELECTED_ID = null;
    clearAuditForm(false);
  });
  if (btnDelete) btnDelete.addEventListener("click", deleteAuditEntry);

  const curIn = document.getElementById("auditCurIn");
  const curOut = document.getElementById("auditCurOut");
  if (curIn) curIn.addEventListener("input", auditRecalculateTotals);
  if (curOut) curOut.addEventListener("input", auditRecalculateTotals);
}

// ======================================================
// LOAD LOCATIONS
// ======================================================
async function loadAuditLocations() {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("loadAuditLocations error", error);
      return;
    }

    const ddl = document.getElementById("auditLocationSelect");
    if (!ddl) return;

    ddl.innerHTML = `<option value="">-- Select Location --</option>`;
    (data || []).forEach((loc) => {
      ddl.innerHTML += `<option value="${loc.id}">${loc.name}</option>`;
    });

    if (AUDIT_ROLE !== "SuperAdmin" && AUDIT_LOCATION_ID) {
      ddl.value = AUDIT_LOCATION_ID;
      ddl.disabled = true;
    }
  } catch (err) {
    console.error("loadAuditLocations exception", err);
  }
}

// ======================================================
// LOAD MACHINES FOR LOCATION
// ======================================================
async function loadAuditMachines() {
  try {
    const locSelect = document.getElementById("auditLocationSelect");
    const machineDdl = document.getElementById("auditMachineNo");
    if (!machineDdl) return;

    const locationId =
      AUDIT_ROLE === "SuperAdmin"
        ? (locSelect ? locSelect.value : null)
        : AUDIT_LOCATION_ID;

    machineDdl.innerHTML = `<option value="">-- Select Machine --</option>`;
    if (!locationId) return;

    const { data, error } = await supabase
      .from("machines")
      .select("machine_no")
      .eq("location_id", locationId)
      .order("machine_no", { ascending: true });

    if (error) {
      console.error("loadAuditMachines error", error);
      return;
    }

    (data || []).forEach((m) => {
      machineDdl.innerHTML += `<option value="${m.machine_no}">${m.machine_no}</option>`;
    });
  } catch (err) {
    console.error("loadAuditMachines exception", err);
  }
}

// ======================================================
// LOAD AUDIT TABLE
// ======================================================
async function loadAuditTable() {
  try {
    setAuditLoading(true);

    const locSelect = document.getElementById("auditLocationSelect");
    const dateFrom = document.getElementById("auditDateFrom");
    const dateTo = document.getElementById("auditDateTo");
    const machineFilter = document.getElementById("auditMachineFilter");
    const healthFilter = document.getElementById("auditHealthFilter");

    const selectedLocationId = locSelect ? locSelect.value : null;
    const fromDate = dateFrom ? dateFrom.value : null;
    const toDate = dateTo ? dateTo.value : null;
    const machineNoFilter = machineFilter ? machineFilter.value.trim() : "";
    const healthVal = healthFilter ? healthFilter.value : "";

    let query = supabase.from("audit").select("*").order("date", { ascending: false });

    // Location logic
    if (AUDIT_ROLE === "SuperAdmin") {
      if (selectedLocationId) {
        query = query.eq("location_id", selectedLocationId);
      }
    } else if (AUDIT_LOCATION_ID) {
      query = query.eq("location_id", AUDIT_LOCATION_ID);
    }

    // Date filter
    if (fromDate) query = query.gte("date", fromDate);
    if (toDate) query = query.lte("date", toDate);

    // Machine filter
    if (machineNoFilter) {
      query = query.ilike("machine_no", `%${machineNoFilter}%`);
    }

    // Health filter
    if (healthVal) {
      query = query.eq("machine_health", healthVal);
    }

    const { data, error } = await query;
    if (error) {
      console.error("loadAuditTable error", error);
      showToast("Failed to load audit data", "error");
      setAuditLoading(false);
      return;
    }

    renderAuditTable(data || []);
    renderAuditSummary(data || []);
    setAuditLoading(false);
  } catch (err) {
    console.error("loadAuditTable exception", err);
    setAuditLoading(false);
  }
}

// ======================================================
// RENDER AUDIT TABLE
// ======================================================
function renderAuditTable(rows) {
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;

    tr.addEventListener("click", () => {
      highlightAuditRow(r.id);
      loadAuditForEdit(r.id);
    });

    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.machine_no)}</td>
      <td class="text-right">${r.prev_in ?? 0}</td>
      <td class="text-right">${r.prev_out ?? 0}</td>
      <td class="text-right">${r.cur_in ?? 0}</td>
      <td class="text-right">${r.cur_out ?? 0}</td>
      <td class="text-right">${r.total_in ?? 0}</td>
      <td class="text-right">${r.total_out ?? 0}</td>
      <td class="text-right">${r.net ?? 0}</td>
      <td>${escapeHtml(r.machine_health || "")}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ======================================================
// HIGHLIGHT SELECTED ROW
// ======================================================
function highlightAuditRow(id) {
  const tbody = document.getElementById("auditTableBody");
  if (!tbody) return;

  [...tbody.querySelectorAll("tr")].forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === String(id));
  });
}

// ======================================================
// RENDER SUMMARY (e.g., total net)
// ======================================================
function renderAuditSummary(rows) {
  const footerNet = document.getElementById("auditSummaryNet");
  if (!footerNet) return;

  const totalNet = rows.reduce((sum, r) => sum + (r.net || 0), 0);
  footerNet.textContent = totalNet;
}

// ======================================================
// LOAD ROW FOR EDIT
// ======================================================
async function loadAuditForEdit(id) {
  try {
    AUDIT_SELECTED_ID = id;

    const { data, error } = await supabase
      .from("audit")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("loadAuditForEdit error", error);
      showToast("Failed to load audit entry", "error");
      return;
    }

    const locSelect = document.getElementById("auditLocationSelect");
    if (locSelect && AUDIT_ROLE === "SuperAdmin") {
      locSelect.value = data.location_id;
    }

    setInputValue("auditDate", data.date);
    setInputValue("auditMachineNo", data.machine_no);
    setInputValue("auditPrevIn", data.prev_in);
    setInputValue("auditPrevOut", data.prev_out);
    setInputValue("auditCurIn", data.cur_in);
    setInputValue("auditCurOut", data.cur_out);
    setInputValue("auditJackpot", data.jackpot);
    setInputValue("auditHealth", data.machine_health);

    auditRecalculateTotals();
  } catch (err) {
    console.error("loadAuditForEdit exception", err);
  }
}

// ======================================================
// SAVE AUDIT ENTRY (INSERT / UPDATE)
// ======================================================
async function saveAuditEntry() {
  try {
    const locSelect = document.getElementById("auditLocationSelect");
    const locationId = locSelect ? locSelect.value : null;
    const date = getInputValue("auditDate");
    const machineNo = getInputValue("auditMachineNo");
    const prevIn = Number(getInputValue("auditPrevIn") || 0);
    const prevOut = Number(getInputValue("auditPrevOut") || 0);
    const curIn = Number(getInputValue("auditCurIn") || 0);
    const curOut = Number(getInputValue("auditCurOut") || 0);
    const jackpot = Number(getInputValue("auditJackpot") || 0);
    const health = getInputValue("auditHealth");

    if (!locationId) return showToast("Please select a location", "error");
    if (!date) return showToast("Please select a date", "error");
    if (!machineNo) return showToast("Please select/enter machine number", "error");

    setAuditSaving(true);

    // ---------- UPDATE MODE ----------
    if (AUDIT_SELECTED_ID) {
      const { data: existing, error: exErr } = await supabase
        .from("audit")
        .select("*")
        .eq("id", AUDIT_SELECTED_ID)
        .single();

      if (exErr || !existing) {
        console.error("Existing audit not found", exErr);
        showToast("Audit entry not found", "error");
        setAuditSaving(false);
        return;
      }

      const totalIn = (existing.prev_in || 0) + curIn;
      const totalOut = (existing.prev_out || 0) + curOut;
      const net = totalIn - totalOut;

      const { error: updErr } = await supabase
        .from("audit")
        .update({
          date,
          machine_no: machineNo,
          cur_in: curIn,
          cur_out: curOut,
          jackpot,
          machine_health: health,
          total_in: totalIn,
          total_out: totalOut,
          net: net
        })
        .eq("id", AUDIT_SELECTED_ID);

      if (updErr) {
        console.error("update audit error", updErr);
        showToast("Failed to update audit", "error");
        setAuditSaving(false);
        return;
      }

      // Update machine health only if changed
      if (existing.machine_health !== health) {
        const { error: machErr } = await supabase
          .from("machines")
          .update({
            machine_health: health,
            updated_at: new Date().toISOString()
          })
          .eq("machine_no", existing.machine_no)
          .eq("location_id", existing.location_id);

        if (machErr) {
          console.error("update machines error", machErr);
        }
      }

      showToast("Audit updated successfully", "success");
      AUDIT_SELECTED_ID = null;
      clearAuditForm(false);
      await loadAuditTable();
      setAuditSaving(false);
      return;
    }

    // ---------- INSERT MODE ----------
    // Get last audit for this machine/location to derive prev_in/out
    const { data: lastRows, error: lastErr } = await supabase
      .from("audit")
      .select("*")
      .eq("machine_no", machineNo)
      .eq("location_id", locationId)
      .order("date", { ascending: false })
      .limit(1);

    if (lastErr) {
      console.error("fetch last audit error", lastErr);
    }

    let prevInFinal = 0;
    let prevOutFinal = 0;

    if (lastRows && lastRows.length > 0) {
      prevInFinal = lastRows[0].cur_in || 0;
      prevOutFinal = lastRows[0].cur_out || 0;
    }

    const totalIn = prevInFinal + curIn;
    const totalOut = prevOutFinal + curOut;
    const net = totalIn - totalOut;

    const { error: insErr } = await supabase.from("audit").insert({
      date,
      machine_no: machineNo,
      location_id: locationId,
      prev_in: prevInFinal,
      prev_out: prevOutFinal,
      cur_in: curIn,
      cur_out: curOut,
      jackpot,
      machine_health: health,
      total_in: totalIn,
      total_out: totalOut,
      net: net
    });

    if (insErr) {
      console.error("insert audit error", insErr);
      showToast("Failed to save audit", "error");
      setAuditSaving(false);
      return;
    }

    // Update machine health in machines
    const { error: machErr2 } = await supabase
      .from("machines")
      .update({
        machine_health: health,
        updated_at: new Date().toISOString()
      })
      .eq("machine_no", machineNo)
      .eq("location_id", locationId);

    if (machErr2) {
      console.error("update machines error", machErr2);
    }

    showToast("Audit saved successfully", "success");
    clearAuditForm(false);
    await loadAuditTable();
    setAuditSaving(false);
  } catch (err) {
    console.error("saveAuditEntry exception", err);
    showToast("Unexpected error while saving", "error");
    setAuditSaving(false);
  }
}

// ======================================================
// DELETE AUDIT ENTRY
// ======================================================
async function deleteAuditEntry() {
  if (!AUDIT_SELECTED_ID) {
    showToast("Select a row to delete", "error");
    return;
  }

  const confirmDelete = window.confirm("Are you sure you want to delete this audit entry?");
  if (!confirmDelete) return;

  try {
    setAuditSaving(true);

    const { error } = await supabase
      .from("audit")
      .delete()
      .eq("id", AUDIT_SELECTED_ID);

    if (error) {
      console.error("deleteAuditEntry error", error);
      showToast("Failed to delete audit entry", "error");
      setAuditSaving(false);
      return;
    }

    showToast("Audit entry deleted", "success");
    AUDIT_SELECTED_ID = null;
    clearAuditForm(false);
    await loadAuditTable();
    setAuditSaving(false);
  } catch (err) {
    console.error("deleteAuditEntry exception", err);
    showToast("Unexpected error while deleting", "error");
    setAuditSaving(false);
  }
}

// ======================================================
// RECALCULATE TOTALS (UI ONLY)
// ======================================================
function auditRecalculateTotals() {
  const prevIn = Number(getInputValue("auditPrevIn") || 0);
  const prevOut = Number(getInputValue("auditPrevOut") || 0);
  const curIn = Number(getInputValue("auditCurIn") || 0);
  const curOut = Number(getInputValue("auditCurOut") || 0);

  const totalIn = prevIn + curIn;
  const totalOut = prevOut + curOut;
  const net = totalIn - totalOut;

  setInputValue("auditTotalIn", totalIn);
  setInputValue("auditTotalOut", totalOut);
  setInputValue("auditNet", net);
}

// ======================================================
// CLEAR FORM
// ======================================================
function clearAuditForm(resetLocation = false) {
  const form = document.getElementById("auditForm");
  if (form) form.reset();

  AUDIT_SELECTED_ID = null;

  if (!resetLocation) {
    const locSelect = document.getElementById("auditLocationSelect");
    if (locSelect && AUDIT_ROLE !== "SuperAdmin" && AUDIT_LOCATION_ID) {
      locSelect.value = AUDIT_LOCATION_ID;
    }
  }

  auditRecalculateTotals();
  highlightAuditRow(null);
}

// ======================================================
// LOADING / SAVING UI HELPERS
// ======================================================
function setAuditLoading(isLoading) {
  const overlay = document.getElementById("auditLoadingOverlay");
  if (overlay) overlay.style.display = isLoading ? "flex" : "none";
}

function setAuditSaving(isSaving) {
  const btn = document.getElementById("auditSaveBtn");
  if (btn) {
    btn.disabled = isSaving;
    btn.textContent = isSaving ? "Saving..." : "Save";
  }
}

// ======================================================
// SMALL UTILITIES
// ======================================================
function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Simple console-based toast if you don't have a UI one wired
function showToast(message, type = "info") {
  console.log(`[${type}] ${message}`);
}
