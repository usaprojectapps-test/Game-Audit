console.log("Agent Silver JS loaded");
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
let currentSlipType = SLIP_TYPE.REGULAR;
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

  // IMPORTANT: Trigger global scanner initializer
  window.dispatchEvent(new Event("agentSilverModuleLoaded"));
}

// -------------------------------------------------------------
// USER / LOCATION
// -------------------------------------------------------------
async function loadCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not logged in");

  const email = data.user.email;

  // Load from user_access instead of users table
  const { data: accessRow, error: accessErr } = await supabase
    .from("user_access")
    .select("email, role, location_id")
    .eq("email", email)
    .single();

  if (accessErr || !accessRow) {
    throw new Error("User not found in user_access");
  }

  currentUser = {
    id: data.user.id,
    email,
    name: email.split("@")[0], // fallback
    role: accessRow.role,
    location_id: accessRow.location_id,
  };

  // SuperAdmin name override
  if (currentUser.role === "SuperAdmin") {
    currentUser.name = "Super Admin";
  }
}

// -------------------------------------------------------------
// FILTERS (DATE, LOCATION, USER)
// -------------------------------------------------------------
function initFilters() {
  const dateInput = document.getElementById("as_filter_date");
  if (dateInput) {
    const now = new Date();
    dateInput.value = now.toISOString().split("T")[0];
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

  // -------------------------------
  // LOAD LOCATIONS
  // -------------------------------
  if (locSelect) {
    locSelect.innerHTML = "";

    const { data: locations, error: locErr } = await supabase
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true });

    if (locErr) {
      console.error("Error loading locations:", locErr);
    } else {
      // SuperAdmin → default = "Select Location"
      if (currentUser.role === "SuperAdmin") {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Select Location";
        locSelect.appendChild(opt);
      }

      locations.forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc.id;
        opt.textContent = loc.name;

        if (
          currentUser.role !== "SuperAdmin" &&
          loc.id === currentUser.location_id
        ) {
          opt.selected = true;
        }

        locSelect.appendChild(opt);
      });
    }
  }

  // -------------------------------
  // LOAD USERS
  // -------------------------------
  if (userSelect) {
    userSelect.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = "All Users";
    userSelect.appendChild(optAll);

    let query = supabase.from("users").select("id, name, role, location_id");

    if (currentUser.role !== "SuperAdmin") {
      query = query.eq("location_id", currentUser.location_id);
    }

    const { data: users, error: userErr } = await query.order("name", {
      ascending: true,
    });

    if (userErr) {
      console.error("Error loading users:", userErr);
    } else {
      users.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.name;
        userSelect.appendChild(opt);
      });
    }

    // Default = current user
    userSelect.value = currentUser.id;
  }
}

// -------------------------------------------------------------
// SLIP TYPE BUTTONS
// -------------------------------------------------------------
function initSlipTypeButtons() {
  const btnRegular = document.getElementById("asBtnRegular");
  const btnBonus = document.getElementById("asBtnBonus");

  btnRegular.addEventListener("click", () => {
    currentSlipType = SLIP_TYPE.REGULAR;
    updateSlipTypeUI();
  });

  btnBonus.addEventListener("click", () => {
    currentSlipType = SLIP_TYPE.BONUS;
    updateSlipTypeUI();
  });

  updateSlipTypeUI();
}

function updateSlipTypeUI() {
  const isBonus = currentSlipType === SLIP_TYPE.BONUS;

  document.getElementById("asBtnRegular").classList.toggle("active", !isBonus);
  document.getElementById("asBtnBonus").classList.toggle("active", isBonus);

  document.getElementById("rowMachineNo").style.display = isBonus ? "none" : "";
  document.getElementById("rowAmount").style.display = isBonus ? "none" : "";

  document.getElementById("rowBonusType").style.display = isBonus ? "" : "none";
  document.getElementById("rowBonusAmount").style.display = isBonus
    ? ""
    : "none";
}

// -------------------------------------------------------------
// FORM DEFAULTS
// -------------------------------------------------------------
function initFormDefaults() {
  const dtInput = document.getElementById("asDateTime");
  if (dtInput) {
    dtInput.value = toLocalDateTimeInputValue(new Date());
  }
}

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

// -------------------------------------------------------------
// QR SCAN BUTTON
// -------------------------------------------------------------
function initScanButton() {
  const scanBtn = document.getElementById("asScanBtn");
  scanBtn.addEventListener("click", () => {
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

  saveBtn.addEventListener("click", async () => {
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
      console.error("Save error:", err);
      showToast("Error saving slip", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function collectSlipFormData() {
  const locSelect = document.getElementById("as_filter_location");
  const selectedLocationId = locSelect.value;

  // SuperAdmin MUST select a location
  if (currentUser.role === "SuperAdmin" && !selectedLocationId) {
    showToast("Please select a location before saving", "error");
    throw new Error("Location not selected");
  }

  const dtInput = document.getElementById("asDateTime");
  const machineInput = document.getElementById("asMachineNo");
  const amountInput = document.getElementById("asAmount");
  const bonusTypeInput = document.getElementById("asBonusType");
  const bonusAmountInput = document.getElementById("asBonusAmount");

  const slip_category = currentSlipType;
  const slip_no = await generateSlipNumber(
    slip_category,
    selectedLocationId || currentUser.location_id
  );

  const datetime = dtInput.value
    ? new Date(dtInput.value).toISOString()
    : new Date().toISOString();

  let machine_no = null;
  let amount = 0;
  let bonus_type = null;
  let bonus_amount = 0;

  if (slip_category === SLIP_TYPE.REGULAR) {
    machine_no = machineInput.value.trim();
    amount = parseFloat(amountInput.value || "0");
  } else {
    bonus_type = bonusTypeInput.value;
    bonus_amount = parseFloat(bonusAmountInput.value || "0");
  }

  return {
    slip_no,
    slip_category,
    datetime,
    agent_id: currentUser.id,
    agent_name: currentUser.role === "SuperAdmin" ? "Super Admin" : currentUser.name,
    machine_no,
    amount,
    bonus_type,
    bonus_amount,
    location_id: selectedLocationId || currentUser.location_id,
    created_by: currentUser.id,
    is_paid: false,
  };
}

async function generateSlipNumber(category, locationId) {
  const prefix = category === SLIP_TYPE.BONUS ? PREFIX.BONUS : PREFIX.REGULAR;
  const timestamp = Date.now();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const dayStart = `${yyyy}-${mm}-${dd} 00:00:00`;
  const dayEnd = `${yyyy}-${mm}-${dd} 23:59:59`;

  const { count } = await supabase
    .from(AGENT_SILVER_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .eq("slip_category", category)
    .gte("datetime", dayStart)
    .lte("datetime", dayEnd);

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
  tbody.innerHTML = "";

  const dateInput = document.getElementById("as_filter_date");
  const locSelect = document.getElementById("as_filter_location");
  const userSelect = document.getElementById("as_filter_user");

  const selectedDate = dateInput.value;
  const selectedLocationId =
    currentUser.role === "SuperAdmin"
      ? locSelect.value || null
      : currentUser.location_id;

  const selectedUserId = userSelect.value;

  let query = supabase
    .from(AGENT_SILVER_TABLE)
    .select("*")
    .order("datetime", { ascending: false });

  if (selectedLocationId) {
    query = query.eq("location_id", selectedLocationId);
  }

  if (selectedDate) {
    query = query
      .gte("datetime", `${selectedDate} 00:00:00`)
      .lte("datetime", `${selectedDate} 23:59:59`);
  }

  if (selectedUserId !== "all") {
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
    totalSlips++;

    if (row.slip_category === SLIP_TYPE.REGULAR) {
      totalAmount += Number(row.amount || 0);
    } else {
      totalBonus += Number(row.bonus_amount || 0);
    }

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.slip_no}</td>
      <td>${new Date(row.datetime).toLocaleString()}</td>
      <td>${row.agent_name}</td>
      <td>${row.slip_category === "regular" ? row.machine_no : "-"}</td>
      <td>${row.slip_category === "regular"
        ? Number(row.amount).toFixed(2)
        : Number(row.bonus_amount).toFixed(2)}</td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById("as_sum_slips").textContent = totalSlips;
  document.getElementById("as_sum_amount").textContent =
    totalAmount.toFixed(2);
  document.getElementById("as_sum_bonus").textContent =
    totalBonus.toFixed(2);
  document.getElementById("as_sum_grand").textContent = (
    totalAmount + totalBonus
  ).toFixed(2);
}

// -------------------------------------------------------------
// QR PREVIEW
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

  text.textContent = slipNo;
}
// -------------------------------------------------------------
// PRINT MODAL
// -------------------------------------------------------------
let asPrintOverlay = null;

function initPrintModal() {
  asPrintOverlay = document.getElementById("asPrintOverlay");

  if (!asPrintOverlay) {
    console.error("asPrintOverlay not found in DOM");
    return;
  }

  const closeBtn = document.getElementById("asModalCloseBtn");
  const printBtn = document.getElementById("asModalPrintBtn");

  if (closeBtn) {
    closeBtn.addEventListener("click", hidePrintModal);
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }
}

function showPrintModal(slip) {
  if (!asPrintOverlay) return;

  const isBonus = slip.slip_category === SLIP_TYPE.BONUS;

  // Common fields
  document.getElementById("asModalSlipId").textContent = slip.slip_no;
  document.getElementById("asModalSlipDateTime").textContent = new Date(
    slip.datetime
  ).toLocaleString();
  document.getElementById("asModalSlipAgent").textContent =
    slip.agent_name || "";

  // Rows
  const rowMachine = document.getElementById("asModalRowMachine");
  const rowAmount = document.getElementById("asModalRowAmount");
  const rowBonusType = document.getElementById("asModalRowBonusType");
  const rowBonusAmount = document.getElementById("asModalRowBonusAmount");

  // Values
  const elMachine = document.getElementById("asModalSlipMachine");
  const elAmount = document.getElementById("asModalSlipAmount");
  const elBonusType = document.getElementById("asModalSlipBonusType");
  const elBonusAmount = document.getElementById("asModalSlipBonusAmount");

  if (isBonus) {
    if (rowMachine) rowMachine.style.display = "none";
    if (rowAmount) rowAmount.style.display = "none";
    if (rowBonusType) rowBonusType.style.display = "";
    if (rowBonusAmount) rowBonusAmount.style.display = "";

    if (elMachine) elMachine.textContent = "";
    if (elAmount) elAmount.textContent = "";
    if (elBonusType) elBonusType.textContent = slip.bonus_type || "";
    if (elBonusAmount)
      elBonusAmount.textContent = Number(slip.bonus_amount || 0).toFixed(2);
  } else {
    if (rowMachine) rowMachine.style.display = "";
    if (rowAmount) rowAmount.style.display = "";
    if (rowBonusType) rowBonusType.style.display = "none";
    if (rowBonusAmount) rowBonusAmount.style.display = "none";

    if (elMachine) elMachine.textContent = slip.machine_no || "";
    if (elAmount)
      elAmount.textContent = Number(slip.amount || 0).toFixed(2);
    if (elBonusType) elBonusType.textContent = slip.bonus_type || "";
    if (elBonusAmount)
      elBonusAmount.textContent = Number(slip.bonus_amount || 0).toFixed(2);
  }

  // QR in modal
  const modalCanvas = document.getElementById("asModalQrCanvas");
  if (modalCanvas && window.QRious) {
    new QRious({
      element: modalCanvas,
      size: 128,
      value: slip.slip_no,
    });
  }

  asPrintOverlay.style.display = "flex";
}

function hidePrintModal() {
  if (asPrintOverlay) {
    asPrintOverlay.style.display = "none";
  }
}
