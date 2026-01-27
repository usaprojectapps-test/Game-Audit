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
  "Promo Bonus"
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

  // NEW: initialize delete button
  initDeleteButtonVisibility();

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
// DELETE BUTTON — ROLE‑BASED VISIBILITY (NEW)
// -------------------------------------------------------------
function initDeleteButtonVisibility() {
  const deleteBtn = document.getElementById("asDeleteBtn");
  if (!deleteBtn) return;

  // Default: hide until a slip is loaded
  deleteBtn.style.display = "none";
}

// Called later when a slip is loaded
function updateDeleteButtonVisibility(slip) {
  const deleteBtn = document.getElementById("asDeleteBtn");
  if (!deleteBtn) return;

  let canDelete = false;

  // SuperAdmin → always allowed
  if (currentUser.role === "SuperAdmin") {
    canDelete = true;
  }

  // LocationAdmin → only if slip belongs to their location
  if (
    currentUser.role === "LocationAdmin" &&
    slip.location_id === currentUser.location_id
  ) {
    canDelete = true;
  }

  // Everyone else → cannot delete
  deleteBtn.style.display = canDelete ? "inline-block" : "none";
}

// -------------------------------------------------------------
// FILTERS
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
// SLIP TYPE UI
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
// FORM DEFAULTS
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
// SAVE BUTTON
// -------------------------------------------------------------
function initSaveButton() {
  const saveBtn = document.getElementById("asSaveBtn");

  saveBtn.addEventListener("click", async () => {
    try {
      saveBtn.disabled = true;

      const slipData = await collectSlipFormData();

      let saved;
      if (currentSlip) {
        saved = await updateSlipInSupabase(slipData);
        showToast("Slip updated successfully", "success");
      } else {
        saved = await saveSlipToSupabase(slipData);
        showToast("Slip saved successfully", "success");
      }

      currentSlip = saved;

      // Update QR preview
      updateQrPreview(saved.slip_no);

      await loadSlipsTable();

      // Open print modal
      showPrintModal(saved);

    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Error saving slip", "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// -------------------------------------------------------------
// COLLECT FORM DATA + MACHINE VALIDATION
// -------------------------------------------------------------
async function collectSlipFormData() {
  const locSelect = document.getElementById("as_filter_location");
  const selectedLocationId = locSelect.value;

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

  const slip_no = currentSlip
    ? currentSlip.slip_no
    : await generateSlipNumber(
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

    if (!machine_no) {
      showToast("Machine No is required", "error");
      throw new Error("Machine No missing");
    }

    const { data: machineRow, error: machineErr } = await supabase
      .from("machines")
      .select("machineid, location_id, healthstatus")
      .eq("machineid", machine_no)
      .single();

    if (machineErr || !machineRow) {
      showToast("Invalid Machine No — not found", "error");
      throw new Error("Machine not found");
    }

    if (machineRow.location_id !== (selectedLocationId || currentUser.location_id)) {
      showToast("Machine does not belong to this location", "error");
      throw new Error("Machine location mismatch");
    }

    if (machineRow.healthstatus !== "Active") {
      showToast("Machine is not Active", "error");
      throw new Error("Machine inactive");
    }

  } else {
    bonus_type = bonusTypeInput.value;
    bonus_amount = parseFloat(bonusAmountInput.value || "0");

    machine_no = "BONUS";
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
    is_paid: currentSlip ? currentSlip.is_paid : false,
  };
}

// -------------------------------------------------------------
// INSERT NEW SLIP
// -------------------------------------------------------------
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
// UPDATE EXISTING SLIP
// -------------------------------------------------------------
async function updateSlipInSupabase(slip) {
  const { data, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .update(slip)
    .eq("slip_no", slip.slip_no)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// -------------------------------------------------------------
// QR PREVIEW (RIGHT SIDE)
// -------------------------------------------------------------
function renderFormQr(slipNo) {
  const img = document.getElementById("asFormQrImage");
  if (!img || !window.QRious) return;

  const qr = new QRious({
    value: slipNo,
    size: 128
  });

  img.src = qr.toDataURL();
}

function updateQrPreview(slipNo) {
  renderFormQr(slipNo);

  const text = document.getElementById("asQrText");
  if (text) {
    text.textContent = slipNo;
  }
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
    tr.classList.add("as-slip-row");

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

  attachRowClickHandlers();
}

// -------------------------------------------------------------
// ROW CLICK → LOAD SLIP
// -------------------------------------------------------------
function attachRowClickHandlers() {
  const rows = document.querySelectorAll("#as_table_body tr");

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const slipNo = row.children[0].textContent;
      loadSlipIntoForm(slipNo);
    });
  });
}

async function loadSlipIntoForm(slipNo) {
  const { data: slip, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .select("*")
    .eq("slip_no", slipNo)
    .single();

  if (error || !slip) {
    showToast("Error loading slip", "error");
    return;
  }

  currentSlip = slip;
  currentSlipType = slip.slip_category;
  updateSlipTypeUI();

  document.getElementById("asDateTime").value =
    toLocalDateTimeInputValue(new Date(slip.datetime));

  if (slip.slip_category === SLIP_TYPE.REGULAR) {
    document.getElementById("asMachineNo").value = slip.machine_no || "";
    document.getElementById("asAmount").value = Number(slip.amount).toFixed(2);
  } else {
    document.getElementById("asBonusType").value = slip.bonus_type || "";
    document.getElementById("asBonusAmount").value =
      Number(slip.bonus_amount).toFixed(2);
  }

  // Update QR preview
  updateQrPreview(slip.slip_no);

  // NEW: Update delete button visibility
  updateDeleteButtonVisibility(slip);
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
      const img = document.getElementById("asModalQrImage");

      // Always re-render QR before printing
      renderModalQr(currentSlip.slip_no);

      // If QR already loaded → print immediately
      if (img.complete) {
        window.print();
      } else {
        img.onload = () => {
          window.print();
          img.onload = null;
        };
      }
    });
  }
}

// -------------------------------------------------------------
// QR RENDERING (IMAGE VERSION)
// -------------------------------------------------------------
function renderModalQr(slipNo) {
  const img = document.getElementById("asModalQrImage");
  if (!img || !window.QRious) {
    console.log("QRious or image element missing");
    return;
  }

  const qr = new QRious({
    value: slipNo,
    size: 128,
  });

  const qrData = qr.toDataURL();

  console.log("QR DATA URL:", qrData.substring(0, 50), "...");

  img.src = qrData;
}

// -------------------------------------------------------------
// SHOW PRINT MODAL
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

  // Render QR
  const img = document.getElementById("asModalQrImage");
  renderModalQr(slip.slip_no);

  // Wait for QR to load before showing modal
  if (img.complete) {
    asPrintOverlay.style.display = "flex";
  } else {
    img.onload = () => {
      asPrintOverlay.style.display = "flex";
      img.onload = null;
    };
  }

  // Footer
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
}

// -------------------------------------------------------------
// HIDE PRINT MODAL
// -------------------------------------------------------------
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
// DELETE BUTTON — ACTION (NEW)
// -------------------------------------------------------------
const deleteBtn = document.getElementById("asDeleteBtn");
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    try {
      if (!currentSlip) {
        showToast("No slip selected to delete", "error");
        return;
      }

      // Extra safety: enforce same rules as visibility
      let canDelete = false;

      if (currentUser.role === "SuperAdmin") {
        canDelete = true;
      }

      if (
        currentUser.role === "LocationAdmin" &&
        currentSlip.location_id === currentUser.location_id
      ) {
        canDelete = true;
      }

      if (!canDelete) {
        showToast("You are not allowed to delete this slip", "error");
        return;
      }

      const confirmDelete = window.confirm(
        `Delete slip ${currentSlip.slip_no}? This cannot be undone.`
      );
      if (!confirmDelete) return;

      const { error } = await supabase
        .from(AGENT_SILVER_TABLE)
        .delete()
        .eq("id", currentSlip.id);

      if (error) {
        console.error("Delete error:", error);
        showToast("Error deleting slip", "error");
        return;
      }

      showToast("Slip deleted successfully", "success");

      // Reset form + state
      currentSlip = null;
      initFormDefaults();
      updateSlipTypeUI();
      updateQrPreview(""); // clear QR
      updateDeleteButtonVisibility({ location_id: null }); // hide button

      await loadSlipsTable();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Error deleting slip", "error");
    }
  });
}
