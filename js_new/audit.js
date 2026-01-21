// audit.js — final

let currentUser = null;
let currentRole = null;
let currentLocationId = null;
let qrStream = null;

// ---------- Helpers ----------

const todayISO = () => new Date().toISOString().slice(0, 10);

const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function showToast(msg, type = "info") {
  console.log(`[${type}] ${msg}`);
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", () => {
  initAuditModule();
});

async function initAuditModule() {
  await loadSessionInfo();
  bindAuditEvents();
  setDefaultDates();
  await loadLocations();
  await loadAudits();
  await refreshSummary();
}

// ---------- Session ----------

async function loadSessionInfo() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  currentUser = session?.user || null;

  currentRole = currentUser?.user_metadata?.role || null;
  currentLocationId = currentUser?.user_metadata?.location_id || null;
}

// ---------- Bindings ----------

function bindAuditEvents() {
  const saveBtn = document.getElementById("auditSaveBtn");
  const resetBtn = document.getElementById("auditResetBtn");
  const filterDate = document.getElementById("auditFilterDate");
  const entryDate = document.getElementById("auditEntryDate");
  const machineNoInput = document.getElementById("auditMachineNo");
  const curInInput = document.getElementById("auditCurIn");
  const curOutInput = document.getElementById("auditCurOut");
  const qrScanBtn = document.getElementById("qrScanBtn");
  const qrCloseBtn = document.getElementById("qrCloseBtn");

  if (saveBtn) saveBtn.addEventListener("click", saveAudit);
  if (resetBtn) resetBtn.addEventListener("click", resetAuditForm);

  if (filterDate) filterDate.addEventListener("change", async () => {
    await loadAudits();
    await refreshSummary();
  });

  if (entryDate) entryDate.addEventListener("change", () => {
    // nothing special now, but kept for future rules
  });

  if (machineNoInput) {
    machineNoInput.addEventListener("change", async () => {
      await fetchAndSetPrevValues();
      recalcTotals();
    });
    machineNoInput.addEventListener("blur", async () => {
      await fetchAndSetPrevValues();
      recalcTotals();
    });
  }

  if (curInInput) curInInput.addEventListener("input", recalcTotals);
  if (curOutInput) curOutInput.addEventListener("input", recalcTotals);

  if (qrScanBtn) qrScanBtn.addEventListener("click", openQRModal);
  if (qrCloseBtn) qrCloseBtn.addEventListener("click", closeQRModal);
}

// ---------- Defaults ----------

function setDefaultDates() {
  const filterDate = document.getElementById("auditFilterDate");
  const entryDate = document.getElementById("auditEntryDate");
  const today = todayISO();

  if (filterDate) filterDate.value = today;
  if (entryDate) entryDate.value = today;
}

// ---------- Locations ----------

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

// ---------- Audits table ----------

async function loadAudits() {
  const tbody = document.querySelector("#auditTable tbody");
  if (!tbody) return;

  const filterDate = document.getElementById("auditFilterDate")?.value || todayISO();
  const locationId = document.getElementById("auditLocationSelect")?.value || null;

  let query = supabase
    .from("audit")
    .select("id, date, machine_no, prev_in, prev_out, cur_in, cur_out, total_in, total_out, net_total, user_id")
    .eq("date", filterDate)
    .order("machine_no", { ascending: true });

  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

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
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Summary ----------

async function refreshSummary() {
  const filterDate = document.getElementById("auditFilterDate")?.value || todayISO();
  const locationId = document.getElementById("auditLocationSelect")?.value || null;

  let base = supabase.from("audit").select("machine_no, total_in, total_out").eq("date", filterDate);
  if (locationId) base = base.eq("location_id", locationId);

  const { data, error } = await base;

  if (error) {
    console.error("refreshSummary error:", error);
    return;
  }

  const totalMachines = new Set(data.map((r) => r.machine_no)).size;
  const totalIn = data.reduce((sum, r) => sum + (r.total_in || 0), 0);
  const totalOut = data.reduce((sum, r) => sum + (r.total_out || 0), 0);
  const net = totalIn - totalOut;

  const elMachines = document.getElementById("summaryTotalMachines");
  const elIn = document.getElementById("summaryTotalIn");
  const elOut = document.getElementById("summaryTotalOut");
  const elNet = document.getElementById("summaryNet");

  if (elMachines) elMachines.textContent = totalMachines || 0;
  if (elIn) elIn.textContent = totalIn || 0;
  if (elOut) elOut.textContent = totalOut || 0;
  if (elNet) elNet.textContent = net || 0;
}

// ---------- Prev IN/OUT ----------

async function fetchAndSetPrevValues() {
  const machineNo = document.getElementById("auditMachineNo")?.value.trim();
  const prevIn = document.getElementById("auditPrevIn");
  const prevOut = document.getElementById("auditPrevOut");

  if (!machineNo || !prevIn || !prevOut) {
    if (prevIn) prevIn.value = "";
    if (prevOut) prevOut.value = "";
    return;
  }

  const { data, error } = await supabase
    .from("audit")
    .select("cur_in, cur_out, date")
    .eq("machine_no", machineNo)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    prevIn.value = "";
    prevOut.value = "";
    return;
  }

  prevIn.value = data.cur_in ?? 0;
  prevOut.value = data.cur_out ?? 0;
}

// ---------- Totals ----------

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

  if (totalInInput) totalInInput.value = totalIn;
  if (totalOutInput) totalOutInput.value = totalOut;
  if (netInput) netInput.value = net;
}

// ---------- Reset ----------

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

// ---------- Save ----------

async function saveAudit() {
  try {
    if (!currentUser) {
      showToast("Not authenticated", "error");
      return;
    }

    const date = document.getElementById("auditEntryDate")?.value || todayISO();
    const machineNo = document.getElementById("auditMachineNo")?.value.trim();
    const locationId = document.getElementById("auditLocationSelect")?.value || null;

    const prevIn = Number(document.getElementById("auditPrevIn")?.value || 0);
    const prevOut = Number(document.getElementById("auditPrevOut")?.value || 0);
    const curIn = Number(document.getElementById("auditCurIn")?.value || 0);
    const curOut = Number(document.getElementById("auditCurOut")?.value || 0);
    const jackpot = document.getElementById("auditJackpot")?.value || null;
    const machineHealth = document.getElementById("auditMachineHealth")?.value || null;

    if (!machineNo) {
      showToast("Machine No is required", "error");
      return;
    }

    // Role-based date restriction (optional, kept from your earlier logic)
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

    // Duplicate check: same machine + same date
    const { data: existing, error: dupError } = await supabase
      .from("audit")
      .select("id")
      .eq("machine_no", machineNo)
      .eq("date", date)
      .maybeSingle();

    if (dupError) {
      console.error("Duplicate check error:", dupError);
    }

    if (existing) {
      showToast("This machine already has an entry for this date", "error");
      return;
    }

    // Calculate totals
    const totalIn = curIn - prevIn;
    const totalOut = curOut - prevOut;
    const net = totalIn - totalOut;

    const payload = {
      date,
      machine_no: machineNo,
      location_id: locationId,
      prev_in: prevIn,
      prev_out: prevOut,
      cur_in: curIn,
      cur_out: curOut,
      total_in: totalIn,
      total_out: totalOut,
      net_total: net,
      jackpot,
      machine_health: machineHealth,
      user_id: currentUser.id
    };

    const { error } = await supabase.from("audit").insert(payload);

    if (error) {
      console.error("saveAudit error:", error);
      showToast("Save failed: " + error.message, "error");
      return;
    }

    showToast("Audit saved successfully", "success");
    resetAuditForm();
    await loadAudits();
    await refreshSummary();
  } catch (err) {
    console.error("Unexpected error in saveAudit:", err);
    showToast("Save failed", "error");
  }
}

// ---------- QR Scanner ----------

function openQRModal() {
  const modal = document.getElementById("qrModal");
  if (!modal) return;
  modal.style.display = "flex";
  startQRScanner();
}

function closeQRModal() {
  const modal = document.getElementById("qrModal");
  if (!modal) return;
  stopQRScanner();
  modal.style.display = "none";
}

async function startQRScanner() {
  try {
    const video = document.getElementById("qrVideo");
    if (!video) return;

    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = qrStream;
    video.setAttribute("playsinline", true);
    await video.play();

    // NOTE: You still need a QR decoding library (like jsQR) to actually read the code
    // and then set document.getElementById("auditMachineNo").value = decodedValue;
  } catch (err) {
    console.error("startQRScanner error:", err);
    showToast("Unable to access camera", "error");
  }
}

function stopQRScanner() {
  if (qrStream) {
    qrStream.getTracks().forEach((t) => t.stop());
    qrStream = null;
  }
}
