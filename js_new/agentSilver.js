// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

// -------------------------------------------------------------
// CONSTANTS & STATE
// -------------------------------------------------------------
const AGENT_SILVER_TABLE = "agent_silver";

const SLIP_TYPE = {
  REGULAR: "regular",
  BONUS: "bonus",
};

const PREFIX = {
  REGULAR: "AS",
  BONUS: "BS",
};

let currentUser = null;
let currentLocation = null;
let currentSlipType = SLIP_TYPE.REGULAR; // "regular" | "bonus"
let currentSlip = null;

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initAgentSilver().catch((err) => {
    console.error("Error initializing Agent Silver:", err);
    showToast("Error loading Agent Silver module", "error");
  });
});

async function initAgentSilver() {
  await loadCurrentUser();
  initFilters();
  initSlipTypeButtons();
  initFormDefaults();
  initScanButton();
  initSaveButton();
  initPrintModal();
  await loadFilterOptions();
  await loadSlipsTable();
}

// -------------------------------------------------------------
// USER / LOCATION
// -------------------------------------------------------------
async function loadCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not logged in");

  const userId = data.user.id;

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, role, location_id")
    .eq("id", userId)
    .single();

  if (userErr || !userRow) throw new Error("User profile not found");

  currentUser = {
    id: userRow.id,
    name: userRow.full_name,
    role: userRow.role,
    location_id: userRow.location_id,
  };

  const { data: locRow } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", currentUser.location_id)
    .single();

  currentLocation = locRow || null;

  const agentNameInput = document.getElementById("asAgentName");
  if (agentNameInput) agentNameInput.value = currentUser.name || "";
}

// -------------------------------------------------------------
// FILTERS (DATE, LOCATION, USER)
// -------------------------------------------------------------
function initFilters() {
  const dateInput = document.getElementById("as_filter_date");
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;

    dateInput.addEventListener("change", () => loadSlipsTable());
  }

  const locSelect = document.getElementById("as_filter_location");
  const userSelect = document.getElementById("as_filter_user");

  if (locSelect) locSelect.addEventListener("change", () => loadSlipsTable());
  if (userSelect) userSelect.addEventListener("change", () => loadSlipsTable());
}

async function loadFilterOptions() {
  const locSelect = document.getElementById("as_filter_location");
  const userSelect = document.getElementById("as_filter_user");

  // Locations
  if (locSelect) {
    locSelect.innerHTML = "";
    const { data: locations, error: locErr } = await supabase
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true });

    if (locErr) {
      console.error("Error loading locations:", locErr);
    } else {
      const optAll = document.createElement("option");
      optAll.value = "current";
      optAll.textContent = currentLocation ? currentLocation.name : "Current Location";
      locSelect.appendChild(optAll);

      locations.forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc.id;
        opt.textContent = loc.name;
        if (loc.id === currentUser.location_id) opt.selected = true;
        locSelect.appendChild(opt);
      });
    }
  }

  // Users (Agents) for this location
  if (userSelect) {
    userSelect.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = "All Users";
    userSelect.appendChild(optAll);

    const { data: users, error: userErr } = await supabase
      .from("users")
      .select("id, full_name, role, location_id")
      .eq("location_id", currentUser.location_id)
      .order("full_name", { ascending: true });

    if (userErr) {
      console.error("Error loading users:", userErr);
    } else {
      users.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.full_name;
        userSelect.appendChild(opt);
      });
    }

    // Default: current user
    userSelect.value = currentUser.id;
  }
}

// -------------------------------------------------------------
// SLIP TYPE BUTTONS (REGULAR / BONUS)
// -------------------------------------------------------------
function initSlipTypeButtons() {
  const btnRegular = document.getElementById("asBtnRegular");
  const btnBonus = document.getElementById("asBtnBonus");

  if (!btnRegular || !btnBonus) return;

  // SilverAgent: force Regular only
  if (currentUser.role === "silveragent") {
    currentSlipType = SLIP_TYPE.REGULAR;
    btnRegular.classList.add("active");
    btnBonus.classList.remove("active");
    btnBonus.disabled = true;
  }

  btnRegular.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentSlipType === SLIP_TYPE.REGULAR) return;
    currentSlipType = SLIP_TYPE.REGULAR;
    updateSlipTypeUI();
  });

  btnBonus.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentUser.role === "silveragent") return; // not allowed
    if (currentSlipType === SLIP_TYPE.BONUS) return;
    currentSlipType = SLIP_TYPE.BONUS;
    updateSlipTypeUI();
  });

  updateSlipTypeUI();
}

function updateSlipTypeUI() {
  const isBonus = currentSlipType === SLIP_TYPE.BONUS;

  const btnRegular = document.getElementById("asBtnRegular");
  const btnBonus = document.getElementById("asBtnBonus");
  const rowMachineNo = document.getElementById("rowMachineNo");
  const rowAmount = document.getElementById("rowAmount");
  const rowBonusType = document.getElementById("rowBonusType");
  const rowBonusAmount = document.getElementById("rowBonusAmount");

  if (btnRegular) btnRegular.classList.toggle("active", !isBonus);
  if (btnBonus) btnBonus.classList.toggle("active", isBonus);

  if (rowMachineNo) rowMachineNo.style.display = isBonus ? "none" : "";
  if (rowAmount) rowAmount.style.display = isBonus ? "none" : "";

  // SilverAgent never sees bonus fields
  if (currentUser.role === "silveragent") {
    if (rowBonusType) rowBonusType.style.display = "none";
    if (rowBonusAmount) rowBonusAmount.style.display = "none";
  } else {
    if (rowBonusType) rowBonusType.style.display = isBonus ? "" : "none";
    if (rowBonusAmount) rowBonusAmount.style.display = isBonus ? "" : "none";
  }
}

// -------------------------------------------------------------
// FORM DEFAULTS
// -------------------------------------------------------------
function initFormDefaults() {
  const dtInput = document.getElementById("asDateTime");
  if (dtInput) {
    const now = new Date();
    dtInput.value = toLocalDateTimeInputValue(now);
  }

  const amountInput = document.getElementById("asAmount");
  if (amountInput) amountInput.value = "0.00";

  const bonusAmountInput = document.getElementById("asBonusAmount");
  if (bonusAmountInput) bonusAmountInput.value = "0.00";
}

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// -------------------------------------------------------------
// QR SCAN BUTTON (MACHINE NO)
// -------------------------------------------------------------
function initScanButton() {
  const scanBtn = document.getElementById("asScanBtn");
  if (!scanBtn) return;

  scanBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!window.qrScanner || typeof window.qrScanner.open !== "function") {
      showToast("QR scanner not available", "error");
      return;
    }
    window.qrScanner.open({ targetInputId: "asMachineNo" });
  });
}

// -------------------------------------------------------------
// SAVE & PRINT
// -------------------------------------------------------------
function initSaveButton() {
  const saveBtn = document.getElementById("asSaveBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      saveBtn.disabled = true;
      const slipData = await collectSlipFormData();
      const saved = await saveSlipToSupabase(slipData);
      currentSlip = saved;
      updateQrPreview(saved.slip_no);
      showToast("Slip saved successfully", "success");
      await loadSlipsTable();
      showPrintModal(saved);
    } catch (err) {
      console.error("Error saving slip:", err);
      showToast("Error saving slip", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function collectSlipFormData() {
  const dtInput = document.getElementById("asDateTime");
  const machineInput = document.getElementById("asMachineNo");
  const amountInput = document.getElementById("asAmount");
  const bonusTypeInput = document.getElementById("asBonusType");
  const bonusAmountInput = document.getElementById("asBonusAmount");

  const slip_category = currentSlipType;
  const slip_no = await generateSlipNumber(slip_category);

  const datetime = dtInput?.value
    ? new Date(dtInput.value).toISOString()
    : new Date().toISOString();

  let machine_no = null;
  let amount = 0.0;
  let bonus_type = null;
  let bonus_amount = 0.0;

  if (slip_category === SLIP_TYPE.REGULAR) {
    machine_no = machineInput?.value?.trim() || null;
    amount = parseFloat(amountInput?.value || "0") || 0.0;
  } else {
    bonus_type = bonusTypeInput?.value || null;
    bonus_amount = parseFloat(bonusAmountInput?.value || "0") || 0.0;
  }

  // SilverAgent cannot set bonus
  if (currentUser.role === "silveragent") {
    bonus_type = null;
    bonus_amount = 0.0;
  }

  return {
    slip_no,
    slip_category,
    datetime,
    agent_id: currentUser.id,
    agent_name: currentUser.name,
    machine_no,
    amount,
    bonus_type,
    bonus_amount,
    location_id: currentUser.location_id,
    created_by: currentUser.id,
    is_paid: false,
  };
}

async function generateSlipNumber(category) {
  const prefix = category === SLIP_TYPE.BONUS ? PREFIX.BONUS : PREFIX.REGULAR;
  const timestamp = Date.now();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dayStart = `${yyyy}-${mm}-${dd} 00:00:00`;
  const dayEnd = `${yyyy}-${mm}-${dd} 23:59:59`;

  let query = supabase
    .from(AGENT_SILVER_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("location_id", currentUser.location_id)
    .eq("slip_category", category)
    .gte("datetime", dayStart)
    .lte("datetime", dayEnd);

  const { count, error } = await query;
  if (error) {
    console.error("Error counting slips for serial:", error);
  }

  const serial = String((count || 0) + 1).padStart(3, "0");
  return `${prefix}-${timestamp}-${serial}`;
}

async function saveSlipToSupabase(slip) {
  const { data, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .insert(slip)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// -------------------------------------------------------------
// TABLE + SUMMARY
// -------------------------------------------------------------
async function loadSlipsTable() {
  const tbody = document.getElementById("as_table_body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const dateInput = document.getElementById("as_filter_date");
  const locSelect = document.getElementById("as_filter_location");
  const userSelect = document.getElementById("as_filter_user");

  const selectedDate = dateInput?.value || null;
  let selectedLocationId = currentUser.location_id;
  let selectedUserId = userSelect?.value || "all";

  if (locSelect && locSelect.value && locSelect.value !== "current") {
    selectedLocationId = locSelect.value;
  }

  let query = supabase
    .from(AGENT_SILVER_TABLE)
    .select("*")
    .eq("location_id", selectedLocationId)
    .order("datetime", { ascending: false });

  if (selectedDate) {
    const dayStart = `${selectedDate} 00:00:00`;
    const dayEnd = `${selectedDate} 23:59:59`;
    query = query.gte("datetime", dayStart).lte("datetime", dayEnd);
  }

  if (selectedUserId && selectedUserId !== "all") {
    query = query.eq("created_by", selectedUserId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error loading slips:", error);
    return;
  }

  let totalSlips = 0;
  let totalAmount = 0;
  let totalBonus = 0;

  data.forEach((row) => {
    totalSlips += 1;

    if (row.slip_category === SLIP_TYPE.REGULAR) {
      totalAmount += Number(row.amount || 0);
    }
    if (row.bonus_amount && Number(row.bonus_amount) > 0) {
      totalBonus += Number(row.bonus_amount);
    }

    const tr = document.createElement("tr");

    const tdSlipNo = document.createElement("td");
    tdSlipNo.textContent = row.slip_no;

    const tdDate = document.createElement("td");
    tdDate.textContent = new Date(row.datetime).toLocaleString();

    const tdAgent = document.createElement("td");
    tdAgent.textContent = row.agent_name || "";

    const tdMachine = document.createElement("td");
    tdMachine.textContent =
      row.slip_category === SLIP_TYPE.REGULAR ? row.machine_no || "" : "-";

    const tdAmount = document.createElement("td");
    if (row.slip_category === SLIP_TYPE.REGULAR) {
      tdAmount.textContent = Number(row.amount || 0).toFixed(2);
    } else {
      tdAmount.textContent = Number(row.bonus_amount || 0).toFixed(2);
    }

    tr.appendChild(tdSlipNo);
    tr.appendChild(tdDate);
    tr.appendChild(tdAgent);
    tr.appendChild(tdMachine);
    tr.appendChild(tdAmount);

    tbody.appendChild(tr);
  });

  const grandTotal = totalAmount + totalBonus;

  const sumSlips = document.getElementById("as_sum_slips");
  const sumAmount = document.getElementById("as_sum_amount");
  const sumBonus = document.getElementById("as_sum_bonus");
  const sumGrand = document.getElementById("as_sum_grand");

  if (sumSlips) sumSlips.textContent = totalSlips;
  if (sumAmount) sumAmount.textContent = totalAmount.toFixed(2);
  if (sumBonus) sumBonus.textContent = totalBonus.toFixed(2);
  if (sumGrand) sumGrand.textContent = grandTotal.toFixed(2);
}

// -------------------------------------------------------------
// QR PREVIEW (RIGHT SIDE)
// -------------------------------------------------------------
function updateQrPreview(slipNo) {
  const canvas = document.getElementById("asQrCanvas");
  const text = document.getElementById("asQrText");
  if (!canvas || !window.QRious) return;

  new QRious({
    element: canvas,
    size: 128,
    value: slipNo,
  });

  if (text) text.textContent = slipNo;
}

// -------------------------------------------------------------
// PRINT MODAL
// -------------------------------------------------------------
let asPrintOverlay = null;

function initPrintModal() {
  // Create overlay + modal dynamically
  asPrintOverlay = document.createElement("div");
  asPrintOverlay.id = "asPrintOverlay";
  Object.assign(asPrintOverlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.5)",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "9999",
  });

  const modal = document.createElement("div");
  modal.id = "asPrintModal";
  Object.assign(modal.style, {
    background: "#fff",
    padding: "15px",
    borderRadius: "8px",
    width: "320px",
    boxShadow: "0 0 10px rgba(0,0,0,0.3)",
  });

  modal.innerHTML = `
    <div class="slip-container" style="width:300px;border:1px solid #333;padding:15px;border-radius:8px;font-family:Arial,sans-serif;">
      <div class="slip-header" style="text-align:center;font-weight:bold;margin-bottom:10px;">Agent Silver Slip</div>

      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Slip ID:</span> <span id="asModalSlipId"></span>
      </div>
      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Date/Time:</span> <span id="asModalSlipDateTime"></span>
      </div>
      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Agent:</span> <span id="asModalSlipAgent"></span>
      </div>

      <div class="slip-row" id="asModalRowMachine" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Machine:</span> <span id="asModalSlipMachine"></span>
      </div>
      <div class="slip-row" id="asModalRowAmount" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Amount:</span> <span id="asModalSlipAmount"></span>
      </div>

      <div class="slip-row" id="asModalRowBonusType" style="display:none;justify-content:space-between;margin:4px 0;">
        <span>Bonus Type:</span> <span id="asModalSlipBonusType"></span>
      </div>
      <div class="slip-row" id="asModalRowBonusAmount" style="display:none;justify-content:space-between;margin:4px 0;">
        <span>Bonus Amount:</span> <span id="asModalSlipBonusAmount"></span>
      </div>

      <div class="qr-box" style="text-align:center;margin-top:15px;">
        <canvas id="asModalQrCanvas" width="128" height="128"></canvas>
        <div style="font-size:12px;color:#666;">Scan to confirm payment</div>
      </div>

      <div class="footer" style="text-align:center;font-size:12px;margin-top:10px;border-top:1px dashed #999;padding-top:5px;">
        Game Audit System
      </div>

      <div style="margin-top:10px;display:flex;justify-content:space-between;">
        <button id="asModalPrintBtn">Print</button>
        <button id="asModalCloseBtn">Close</button>
      </div>
    </div>
  `;

  asPrintOverlay.appendChild(modal);
  document.body.appendChild(asPrintOverlay);

  document
    .getElementById("asModalCloseBtn")
    .addEventListener("click", hidePrintModal);
  document
    .getElementById("asModalPrintBtn")
    .addEventListener("click", () => window.print());

  // Print CSS
  const style = document.createElement("style");
  style.innerHTML = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #asPrintOverlay, #asPrintOverlay * {
        visibility: visible !important;
      }
      #asPrintOverlay {
        position: fixed;
        inset: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

function showPrintModal(slip) {
  if (!asPrintOverlay) return;

  const isBonus = slip.slip_category === SLIP_TYPE.BONUS;

  document.getElementById("asModalSlipId").textContent = slip.slip_no;
  document.getElementById("asModalSlipDateTime").textContent = new Date(
    slip.datetime
  ).toLocaleString();
  document.getElementById("asModalSlipAgent").textContent =
    slip.agent_name || "";

  const rowMachine = document.getElementById("asModalRowMachine");
  const rowAmount = document.getElementById("asModalRowAmount");
  const rowBonusType = document.getElementById("asModalRowBonusType");
  const rowBonusAmount = document.getElementById("asModalRowBonusAmount");

  if (isBonus) {
    if (rowMachine) rowMachine.style.display = "none";
    if (rowAmount) rowAmount.style.display = "none";
    if (rowBonusType) rowBonusType.style.display = "";
    if (rowBonusAmount) rowBonusAmount.style.display = "";

    document.getElementById("asModalSlipMachine").textContent = "";
    document.getElementById("asModalSlipAmount").textContent = "";
    document.getElementById("asModalSlipBonusType").textContent =
      slip.bonus_type || "";
    document.getElementById("asModalSlipBonusAmount").textContent = Number(
      slip.bonus_amount || 0
    ).toFixed(2);
  } else {
    if (rowMachine) rowMachine.style.display = "";
    if (rowAmount) rowAmount.style.display = "";
    if (rowBonusType)
      rowBonusType.style.display =
        slip.bonus_amount && Number(slip.bonus_amount) > 0 ? "" : "none";
    if (rowBonusAmount)
      rowBonusAmount.style.display =
        slip.bonus_amount && Number(slip.bonus_amount) > 0 ? "" : "none";

    document.getElementById("asModalSlipMachine").textContent =
      slip.machine_no || "";
    document.getElementById("asModalSlipAmount").textContent = Number(
      slip.amount || 0
    ).toFixed(2);
    document.getElementById("asModalSlipBonusType").textContent =
      slip.bonus_type || "";
    document.getElementById("asModalSlipBonusAmount").textContent = Number(
      slip.bonus_amount || 0
    ).toFixed(2);
  }

  // QR
  if (window.QRious) {
    new QRious({
      element: document.getElementById("asModalQrCanvas"),
      size: 128,
      value: slip.slip_no,
    });
  }

  asPrintOverlay.style.display = "flex";
}

function hidePrintModal() {
  if (asPrintOverlay) asPrintOverlay.style.display = "none";
}
