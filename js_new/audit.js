// audit.js

let selectedAuditId = null;
let currentUser = null;
let currentRole = null;
let currentLocationId = null;

// Utility
const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// Init
document.addEventListener("DOMContentLoaded", () => {
  initAuditModule();
});

async function initAuditModule() {
  await loadSessionInfo();
  bindAuditEvents();
  await loadLocations();
  await loadMachines();
  await loadAudits(true);
}

async function loadSessionInfo() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  currentUser = session?.user || null;

  const jwt = currentUser?.app_metadata || {};
  // If you store role/location in JWT custom claims, adjust here
  // For Supabase, often in user.user_metadata or in JWT directly
  const tokenRole = currentUser?.user_metadata?.role || null;
  const tokenLocationId = currentUser?.user_metadata?.location_id || null;

  currentRole = tokenRole;
  currentLocationId = tokenLocationId;
}

function bindAuditEvents() {
  const saveBtn = document.getElementById("auditSaveBtn");
  const resetBtn = document.getElementById("auditResetBtn");
  const curInInput = document.getElementById("auditCurIn");
  const curOutInput = document.getElementById("auditCurOut");
  const dateInput = document.getElementById("auditDate");
  const machineSelect = document.getElementById("auditMachineSelect");

  if (saveBtn) saveBtn.addEventListener("click", saveAudit);
  if (resetBtn) resetBtn.addEventListener("click", resetAuditForm);

  if (curInInput) curInInput.addEventListener("input", recalcTotalsFromInputs);
  if (curOutInput) curOutInput.addEventListener("input", recalcTotalsFromInputs);
  if (dateInput) dateInput.addEventListener("change", handleDateChange);
  if (machineSelect) machineSelect.addEventListener("change", handleMachineChange);
}

async function loadLocations() {
  const select = document.getElementById("auditLocationSelect");
  if (!select) return;

  const { data, error } = await supabase.from("locations").select("id, name").order("name");
  if (error) {
    console.error("loadLocations error:", error);
    return;
  }

  select.innerHTML = "";
  data.forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    select.appendChild(opt);
  });

  if (currentLocationId) {
    select.value = currentLocationId;
  }
}

async function loadMachines() {
  const select = document.getElementById("auditMachineSelect");
  if (!select) return;

  const { data, error } = await supabase.from("machines").select("id, machine_no").order("machine_no");
  if (error) {
    console.error("loadMachines error:", error);
    return;
  }

  select.innerHTML = "";
  data.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.machine_no;
    opt.textContent = m.machine_no;
    select.appendChild(opt);
  });
}

async function loadAudits(initial = false) {
  const tbody = document.querySelector("#auditTable tbody");
  if (!tbody) return;

  const { data, error } = await supabase
    .from("audit")
    .select("id, date, machine_no, prev_in, prev_out, cur_in, cur_out, total_in, total_out, net_total, user_id")
    .order("date", { ascending: false });

  if (error) {
    console.error("loadAudits error:", error);
    return;
  }

  tbody.innerHTML = "";
  data.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.machine_no}</td>
      <td>${row.prev_in ?? ""}</td>
      <td>${row.prev_out ?? ""}</td>
      <td>${row.cur_in ?? ""}</td>
      <td>${row.cur_out ?? ""}</td>
      <td>${row.total_in ?? ""}</td>
      <td>${row.total_out ?? ""}</td>
      <td>${row.net_total ?? ""}</td>
      <td>${row.user_id ?? ""}</td>
      <td>
        <button class="audit-edit-btn" data-id="${row.id}">Edit</button>
        <button class="audit-delete-btn" data-id="${row.id}">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".audit-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => editAudit(btn.dataset.id));
  });

  tbody.querySelectorAll(".audit-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteAudit(btn.dataset.id));
  });
}

function handleDateChange() {
  // For now, just recalc prev values when date changes if needed
  // Could be extended to refetch last row for that date context
}

async function handleMachineChange() {
  // When machine changes, refetch last row to populate prev_in/out
  await fetchAndSetPrevValues();
  recalcTotalsFromInputs();
}

async function fetchAndSetPrevValues() {
  const machineSelect = document.getElementById("auditMachineSelect");
  const prevInInput = document.getElementById("auditPrevIn");
  const prevOutInput = document.getElementById("auditPrevOut");

  if (!machineSelect || !prevInInput || !prevOutInput) return;

  const machine_no = (machineSelect.value || "").trim();
  if (!machine_no) {
    prevInInput.value = "";
    prevOutInput.value = "";
    return;
  }

  const { data, error } = await supabase
    .from("audit")
    .select("cur_in, cur_out, date")
    .eq("machine_no", machine_no)
    .not("cur_in", "is", null)
    .not("cur_out", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchAndSetPrevValues error:", error);
    prevInInput.value = "";
    prevOutInput.value = "";
    return;
  }

  if (data) {
    prevInInput.value = data.cur_in ?? "";
    prevOutInput.value = data.cur_out ?? "";
  } else {
    prevInInput.value = "";
    prevOutInput.value = "";
  }
}

function recalcTotalsFromInputs() {
  const prevInInput = document.getElementById("auditPrevIn");
  const prevOutInput = document.getElementById("auditPrevOut");
  const curInInput = document.getElementById("auditCurIn");
  const curOutInput = document.getElementById("auditCurOut");
  const totalInInput = document.getElementById("auditTotalIn");
  const totalOutInput = document.getElementById("auditTotalOut");
  const netInput = document.getElementById("auditNet");

  const prev_in = toNumberOrNull(prevInInput?.value ?? "");
  const prev_out = toNumberOrNull(prevOutInput?.value ?? "");
  const cur_in = toNumberOrNull(curInInput?.value ?? "");
  const cur_out = toNumberOrNull(curOutInput?.value ?? "");

  const totalIn = (cur_in ?? 0) - (prev_in ?? 0);
  const totalOut = (cur_out ?? 0) - (prev_out ?? 0);
  const net = totalIn - totalOut;

  if (totalInInput) totalInInput.value = Number.isFinite(totalIn) ? totalIn : "";
  if (totalOutInput) totalOutInput.value = Number.isFinite(totalOut) ? totalOut : "";
  if (netInput) netInput.value = Number.isFinite(net) ? net : "";
}

function resetAuditForm() {
  selectedAuditId = null;
  document.getElementById("auditDate").value = todayISO();
  document.getElementById("auditPrevIn").value = "";
  document.getElementById("auditPrevOut").value = "";
  document.getElementById("auditCurIn").value = "";
  document.getElementById("auditCurOut").value = "";
  document.getElementById("auditTotalIn").value = "";
  document.getElementById("auditTotalOut").value = "";
  document.getElementById("auditNet").value = "";
}

async function saveAudit() {
  try {
    console.log(">>> saveAudit start, selectedAuditId:", selectedAuditId);

    if (!currentUser) {
      showToast("Not authenticated", "error");
      return;
    }

    const dateInput = document.getElementById("auditDate");
    const machineSelect = document.getElementById("auditMachineSelect");
    const locationSelect = document.getElementById("auditLocationSelect");
    const prevInInput = document.getElementById("auditPrevIn");
    const prevOutInput = document.getElementById("auditPrevOut");
    const cur_InInput = document.getElementById("auditCurIn");
    const cur_OutInput = document.getElementById("auditCurOut");

    const date = dateInput?.value || todayISO();
    const machine_no = (machineSelect?.value || "").trim();
    const location_id = locationSelect?.value || null;

    if (!machine_no) {
      showToast("Machine is required", "error");
      return;
    }

    // Role-based date restriction (client-side)
    if (currentRole === "Audit") {
      const selected = new Date(date);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const selectedDay = new Date(selected.toISOString().slice(0, 10));
      const todayDay = new Date(today.toISOString().slice(0, 10));
      const yesterdayDay = new Date(yesterday.toISOString().slice(0, 10));

      if (selectedDay < yesterdayDay || selectedDay > todayDay) {
        showToast("Audit users can only enter today or yesterday", "error");
        return;
      }
    }

    const prev_in = toNumberOrNull(prevInInput?.value ?? "");
    const prev_out = toNumberOrNull(prevOutInput?.value ?? "");
    const cur_in = toNumberOrNull(curInInput?.value ?? "");
    const cur_out = toNumberOrNull(curOutInput?.value ?? "");

    // Duplicate check (machine + date)
    if (!selectedAuditId) {
      const existing = await supabase
        .from("audit")
        .select("id")
        .eq("machine_no", machine_no)
        .eq("date", date)
        .maybeSingle();

      if (existing.data) {
        showToast("Entry already exists for this machine and date", "error");
        return;
      }
    }

    // If prev_in/out not set yet, fetch them once more (in case machine changed)
    if (prev_in === null && prev_out === null) {
      await fetchAndSetPrevValues();
    }

    const finalPrevIn = toNumberOrNull(document.getElementById("auditPrevIn")?.value ?? "");
    const finalPrevOut = toNumberOrNull(document.getElementById("auditPrevOut")?.value ?? "");

    const totalIn = (cur_in ?? 0) - (finalPrevIn ?? 0);
    const totalOut = (cur_out ?? 0) - (finalPrevOut ?? 0);
    const net = totalIn - totalOut;

    const payload = {
      machine_no,
      date,
      location_id,
      prev_in: finalPrevIn,
      prev_out: finalPrevOut,
      cur_in,
      cur_out,
      total_in: totalIn,
      total_out: totalOut,
      net_total: net,
      user_id: currentUser.id,
    };

    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });

    console.log("Audit save payload:", payload);

    let result;
    if (selectedAuditId) {
      result = await supabase
        .from("audit")
        .update(payload)
        .eq("id", selectedAuditId)
        .select();
    } else {
      result = await supabase.from("audit").insert(payload).select();
    }

    console.log("Supabase result:", result);

    if (result.error) {
      console.error("Supabase error:", result.error);
      showToast(result.error.message || "Save failed", "error");
      return;
    }

    showToast(selectedAuditId ? "Audit updated" : "Audit added", "success");
    resetAuditForm();
    await loadAudits(true);
  } catch (err) {
    console.error("Unexpected error in saveAudit:", err);
    showToast("Save failed", "error");
  }
}

async function editAudit(id) {
  selectedAuditId = id;

  const { data, error } = await supabase
    .from("audit")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("editAudit error:", error);
    showToast("Unable to load audit", "error");
    return;
  }

  document.getElementById("auditDate").value = data.date;
  document.getElementById("auditMachineSelect").value = data.machine_no;
  document.getElementById("auditLocationSelect").value = data.location_id || "";
  document.getElementById("auditPrevIn").value = data.prev_in ?? "";
  document.getElementById("auditPrevOut").value = data.prev_out ?? "";
  document.getElementById("auditCurIn").value = data.cur_in ?? "";
  document.getElementById("auditCurOut").value = data.cur_out ?? "";
  document.getElementById("auditTotalIn").value = data.total_in ?? "";
  document.getElementById("auditTotalOut").value = data.total_out ?? "";
  document.getElementById("auditNet").value = data.net_total ?? "";
}

async function deleteAudit(id) {
  if (currentRole !== "SuperAdmin" && currentRole !== "LocationAdmin") {
    showToast("Only SuperAdmin or LocationAdmin can delete", "error");
    return;
  }

  if (!confirm("Delete this audit entry?")) return;

  const { error } = await supabase.from("audit").delete().eq("id", id);
  if (error) {
    console.error("deleteAudit error:", error);
    showToast("Delete failed", "error");
    return;
  }

  showToast("Audit deleted", "success");
  await loadAudits(true);
}

// You already have a global showToast in your system; if not, stub:
function showToast(msg, type = "info") {
  console.log(`[${type}] ${msg}`);
}
