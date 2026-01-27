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

const BONUS_TYPES = [
  "Raffle",
  "Birthday Gift",
  "Festival Bonus",
  "Promo Bonus",
];

let currentUser = null;
let currentSlipType = SLIP_TYPE.REGULAR;
let currentSlip = null;

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
initAgentSilver().catch((err) => {
  console.error("INIT ERROR:", err);
  showToast("Error loading Agent Silver module", "error");
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
  await loadBonusTypes();
  await loadSlipsTable();

  window.dispatchEvent(new Event("agentSilverModuleLoaded"));
}

// -------------------------------------------------------------
// USER
// -------------------------------------------------------------
async function loadCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not logged in");

  const email = data.user.email;

  const { data: accessRow, error: accessErr } = await supabase
    .from("user_access")
    .select("email, role, location_id")
    .eq("email", email)
    .single();

  if (accessErr || !accessRow) throw new Error("User not found");

  currentUser = {
    id: data.user.id,
    email,
    role: accessRow.role,
    location_id: accessRow.location_id,
    name: email.split("@")[0],
  };

  if (currentUser.role === "SuperAdmin") {
    currentUser.name = "Super Admin";
  }
}

// -------------------------------------------------------------
// FILTERS (LEFT SIDE) — Date, Location, User
// -------------------------------------------------------------
function initFilters() {
  const dateInput = document.getElementById("as_filter_date");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today; // Option B: set today on load, user can change
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

  // LOCATIONS
  if (locSelect) {
    locSelect.innerHTML = "";

    const { data: locations } = await supabase
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true });

    if (currentUser.role !== "SuperAdmin") {
      const userLoc = locations.find((l) => l.id === currentUser.location_id);
      if (userLoc) {
        const opt = document.createElement("option");
        opt.value = userLoc.id;
        opt.textContent = userLoc.name;
        opt.selected = true;
        locSelect.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Select Location";
      locSelect.appendChild(opt);

      locations.forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc.id;
        opt.textContent = loc.name;
        locSelect.appendChild(opt);
      });
    }
  }

  // USERS
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

    const { data: users } = await query.order("name", { ascending: true });

    users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.name;
      userSelect.appendChild(opt);
    });

    userSelect.value = currentUser.id;
  }
}

// -------------------------------------------------------------
// BONUS TYPES
// -------------------------------------------------------------
async function loadBonusTypes() {
  const select = document.getElementById("asBonusType");
  if (!select) return;

  BONUS_TYPES.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

// -------------------------------------------------------------
// SLIP TYPE UI (Regular / Bonus)
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
  document.getElementById("rowBonusAmount").style.display = isBonus ? "" : "none";

  const amountInput = document.getElementById("asAmount");
  if (amountInput) amountInput.disabled = isBonus;
}

// -------------------------------------------------------------
// FORM DEFAULTS (Right Side)
// -------------------------------------------------------------
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

function initFormDefaults() {
  const dtInput = document.getElementById("asDateTime");
  if (dtInput) dtInput.value = toLocalDateTimeInputValue(new Date());

  const agentNameInput = document.getElementById("asAgentName");
  if (agentNameInput) agentNameInput.value = currentUser.name;

  const amountInput = document.getElementById("asAmount");
  if (amountInput) amountInput.value = "0.00";
}

// -------------------------------------------------------------
// QR SCAN BUTTON (Machine No)
// -------------------------------------------------------------
function initScanButton() {
  const scanBtn = document.getElementById("asScanBtn");
  if (!scanBtn) return;

  scanBtn.addEventListener("click", () => {
    if (!window.qrScanner || typeof window.qrScanner.open !== "function") {
      showToast("QR scanner not available", "error");
      return;
    }
    window.qrScanner.open({ targetInputId: "asMachineNo" });
  });
}
// -------------------------------------------------------------
// COLLECT FORM DATA
// -------------------------------------------------------------
function collectFormData() {
  const dtInput = document.getElementById("asDateTime");
  const machineInput = document.getElementById("asMachineNo");
  const amountInput = document.getElementById("asAmount");
  const bonusTypeInput = document.getElementById("asBonusType");
  const bonusAmountInput = document.getElementById("asBonusAmount");

  const slip = {
    slip_category: currentSlipType,
    datetime: dtInput.value,
    agent_id: currentUser.id,
    agent_name: currentUser.name,
    location_id: currentUser.location_id,
  };

  if (currentSlipType === SLIP_TYPE.REGULAR) {
    slip.machine_no = machineInput.value.trim();
    slip.amount = parseFloat(amountInput.value || 0);
  } else {
    slip.bonus_type = bonusTypeInput.value;
    slip.bonus_amount = parseFloat(bonusAmountInput.value || 0);
  }

  return slip;
}

// -------------------------------------------------------------
// SAVE BUTTON
// -------------------------------------------------------------
function initSaveButton() {
  const saveBtn = document.getElementById("asSaveBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    try {
      const slipData = collectFormData();

      if (!slipData.datetime) {
        showToast("Please select date & time", "error");
        return;
      }

      if (slipData.slip_category === SLIP_TYPE.REGULAR) {
        if (!slipData.machine_no) {
          showToast("Machine number required", "error");
          return;
        }
        if (slipData.amount <= 0) {
          showToast("Amount must be greater than 0", "error");
          return;
        }
      } else {
        if (!slipData.bonus_type) {
          showToast("Select a bonus type", "error");
          return;
        }
        if (slipData.bonus_amount <= 0) {
          showToast("Bonus amount must be greater than 0", "error");
          return;
        }
      }

      const slipNo = await generateSlipNumber(
        slipData.slip_category,
        slipData.location_id
      );
      slipData.slip_no = slipNo;

      const { data, error } = await supabase
        .from(AGENT_SILVER_TABLE)
        .insert(slipData)
        .select()
        .single();

      if (error) throw error;

      currentSlip = data;

      // ⭐ Update QR preview on right side
      renderFormQr(data.slip_no);

      showToast("Slip saved", "success");

      await loadSlipsTable();

      // ⭐ Open print modal
      showPrintModal(data);
    } catch (err) {
      console.error(err);
      showToast("Error saving slip", "error");
    }
  });
}

// -------------------------------------------------------------
// QR PREVIEW (RIGHT SIDE FORM)
// -------------------------------------------------------------
function renderFormQr(slipNo) {
  const img = document.getElementById("asFormQrImage");
  if (!img || !window.QRious) return;

  const qr = new QRious({
    value: slipNo,
    size: 128,
  });

  img.src = qr.toDataURL();
}

// -------------------------------------------------------------
// LOAD SLIPS TABLE
// -------------------------------------------------------------
async function loadSlipsTable() {
  const tbody = document.getElementById("as_table_body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const date = document.getElementById("as_filter_date").value;
  const loc = document.getElementById("as_filter_location").value;
  const user = document.getElementById("as_filter_user").value;

  let query = supabase
    .from(AGENT_SILVER_TABLE)
    .select("*")
    .gte("datetime", `${date} 00:00:00`)
    .lte("datetime", `${date} 23:59:59`)
    .order("datetime", { ascending: false });

  if (loc) query = query.eq("location_id", loc);
  if (user !== "all") query = query.eq("agent_id", user);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }

  renderSummary(data);
  renderTableRows(data);
}

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
function renderSummary(rows) {
  let totalSlips = rows.length;
  let totalAmount = 0;
  let totalBonus = 0;

  rows.forEach((r) => {
    if (r.slip_category === SLIP_TYPE.REGULAR) {
      totalAmount += r.amount || 0;
    } else {
      totalBonus += r.bonus_amount || 0;
    }
  });

  document.getElementById("as_sum_slips").textContent = totalSlips;
  document.getElementById("as_sum_amount").textContent = totalAmount.toFixed(2);
  document.getElementById("as_sum_bonus").textContent = totalBonus.toFixed(2);
  document.getElementById("as_sum_grand").textContent = (
    totalAmount + totalBonus
  ).toFixed(2);
}

// -------------------------------------------------------------
// TABLE ROWS
// -------------------------------------------------------------
function renderTableRows(rows) {
  const tbody = document.getElementById("as_table_body");
  tbody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.slip_no}</td>
      <td>${new Date(r.datetime).toLocaleString()}</td>
      <td>${r.agent_name}</td>
      <td>${r.machine_no || "-"}</td>
      <td>${(r.amount || r.bonus_amount || 0).toFixed(2)}</td>
    `;

    tr.addEventListener("click", () => loadSlipIntoForm(r));
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// LOAD SLIP INTO FORM (Right Side)
// -------------------------------------------------------------
function loadSlipIntoForm(slip) {
  currentSlip = slip;

  document.getElementById("asDateTime").value = toLocalDateTimeInputValue(
    new Date(slip.datetime)
  );

  if (slip.slip_category === SLIP_TYPE.REGULAR) {
    currentSlipType = SLIP_TYPE.REGULAR;
    updateSlipTypeUI();

    document.getElementById("asMachineNo").value = slip.machine_no;
    document.getElementById("asAmount").value = slip.amount.toFixed(2);
  } else {
    currentSlipType = SLIP_TYPE.BONUS;
    updateSlipTypeUI();

    document.getElementById("asBonusType").value = slip.bonus_type;
    document.getElementById("asBonusAmount").value =
      slip.bonus_amount.toFixed(2);
  }

  // ⭐ Update QR preview on right side
  renderFormQr(slip.slip_no);
}
// -------------------------------------------------------------
// PRINT MODAL (FINAL QR IMAGE VERSION)
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
    printBtn.addEventListener("click", () => {
      if (currentSlip?.slip_no) {
        renderModalQr(currentSlip.slip_no);
      }

      // ⭐ Delay ensures QR loads before print
      setTimeout(() => {
        window.print();
      }, 300);
    });
  }
}

// -------------------------------------------------------------
// QR FOR PRINT MODAL
// -------------------------------------------------------------
function renderModalQr(slipNo) {
  const img = document.getElementById("asModalQrImage");
  if (!img || !window.QRious) return;

  const qr = new QRious({
    value: slipNo,
    size: 128,
  });

  img.src = qr.toDataURL();
}

// -------------------------------------------------------------
// SHOW / HIDE PRINT MODAL
// -------------------------------------------------------------
function showPrintModal(slip) {
  if (!asPrintOverlay) return;

  const isBonus = slip.slip_category === SLIP_TYPE.BONUS;

  document.getElementById("asModalSlipId").textContent = slip.slip_no;
  document.getElementById("asModalSlipDateTime").textContent =
    new Date(slip.datetime).toLocaleString();
  document.getElementById("asModalSlipAgent").textContent =
    slip.agent_name || "";

  const rowMachine = document.getElementById("asModalRowMachine");
  const rowAmount = document.getElementById("asModalRowAmount");
  const rowBonusType = document.getElementById("asModalRowBonusType");
  const rowBonusAmount = document.getElementById("asModalRowBonusAmount");

  const elMachine = document.getElementById("asModalSlipMachine");
  const elAmount = document.getElementById("asModalSlipAmount");
  const elBonusType = document.getElementById("asModalSlipBonusType");
  const elBonusAmount = document.getElementById("asModalSlipBonusAmount");

  if (isBonus) {
    rowMachine.style.display = "none";
    rowAmount.style.display = "none";
    rowBonusType.style.display = "";
    rowBonusAmount.style.display = "";

    elBonusType.textContent = slip.bonus_type || "";
    elBonusAmount.textContent = Number(slip.bonus_amount || 0).toFixed(2);
  } else {
    rowMachine.style.display = "";
    rowAmount.style.display = "";
    rowBonusType.style.display = "none";
    rowBonusAmount.style.display = "none";

    elMachine.textContent = slip.machine_no || "";
    elAmount.textContent = Number(slip.amount || 0).toFixed(2);
  }

  // ⭐ Render QR for print modal
  renderModalQr(slip.slip_no);

  // ⭐ Footer: Game-Audit System + Location Name
  const footerEl = document.getElementById("asModalFooterText");
  if (footerEl) {
    const locationNameElement = document.querySelector(
      "#as_filter_location option:checked"
    );
    const locationName =
      locationNameElement?.textContent || "Location";

    footerEl.innerHTML = `
      Game-Audit System<br/>
      -------------------------<br/>
      ${locationName}
    `;
  }

  asPrintOverlay.style.display = "flex";
}

function hidePrintModal() {
  if (asPrintOverlay) {
    asPrintOverlay.style.display = "none";
  }
}

// -------------------------------------------------------------
// SLIP NUMBER GENERATION
// -------------------------------------------------------------
async function generateSlipNumber(slip_category, location_id) {
  const prefix =
    slip_category === SLIP_TYPE.REGULAR ? PREFIX.REGULAR : PREFIX.BONUS;

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const datePart = `${y}${m}${d}`;

  const { data, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .select("slip_no")
    .eq("slip_category", slip_category)
    .eq("location_id", location_id)
    .gte("datetime", `${y}-${m}-${d} 00:00:00`)
    .lte("datetime", `${y}-${m}-${d} 23:59:59`)
    .order("slip_no", { ascending: false })
    .limit(1);

  let serial = 1;

  if (!error && data && data.length > 0) {
    const lastSlipNo = data[0].slip_no;
    const parts = lastSlipNo.split("-");
    const lastSerialStr = parts[parts.length - 1];
    const lastSerial = parseInt(lastSerialStr, 10);
    if (!isNaN(lastSerial)) {
      serial = lastSerial + 1;
    }
  }

  const serialPart = String(serial).padStart(3, "0");
  return `${prefix}-${datePart}-${serialPart}`;
}

// -------------------------------------------------------------
// END OF FILE
// -------------------------------------------------------------
