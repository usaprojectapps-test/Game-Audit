// -------------------------------------------------------------
// PREVENT DOUBLE LOAD
// -------------------------------------------------------------
if (window.__MSP_LOADED__) {
  console.log("⚠ MSP.js already loaded — skipping duplicate load");
} else {
  window.__MSP_LOADED__ = true;
}

// -------------------------------------------------------------
// SUPABASE IMPORT
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

const IS_DEV =
  window.location.hostname === "localhost" ||
  window.location.hostname.endsWith(".local");

function dbg(...args) {
  if (IS_DEV) console.log(...args);
}

dbg("msp.js loaded — waiting for mspModuleLoaded event");

// -------------------------------------------------------------
// INITIALIZER — WAIT FOR FINAL DOM
// -------------------------------------------------------------
window.addEventListener("mspModuleLoaded", () => {
  console.log("🔥 mspModuleLoaded — waiting for DOM to stabilize");

  const check = setInterval(() => {
    const saveBtn = document.getElementById("mspSaveBtn");

    if (saveBtn && saveBtn.isConnected) {
      console.log("🔥 DOM stable — initializing MSP");
      clearInterval(check);
      initMSPModule();
    }
  }, 100);
});

// -------------------------------------------------------------
// MAIN MODULE FUNCTION
// -------------------------------------------------------------
async function initMSPModule() {
  dbg("MSP module initializing...");

  if (!document.getElementById("mspSaveBtn")) {
    dbg("MSP HTML not ready — retrying in 200ms");
    setTimeout(initMSPModule, 200);
    return;
  }

  try {
    // -------------------------------------------------------------
    // LOAD USER PROFILE
    // -------------------------------------------------------------
    let userRole = null;
    let userLocationId = null;

    async function loadUserProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const meta = sessionData?.session?.user?.user_metadata || {};

      userRole = meta.role || null;
      userLocationId = meta.location_id || null;

      dbg("Loaded userRole:", userRole);
      dbg("Loaded userLocationId:", userLocationId);
    }

    await loadUserProfile();

    if (!userLocationId) {
      console.error("❌ MSP ERROR: userLocationId is NULL — cannot continue");
      return;
    }

    // -------------------------------------------------------------
    // ELEMENTS
    // -------------------------------------------------------------
    const locationSelect = document.getElementById("mspLocation");
    const dateInput = document.getElementById("mspDate");
    const dailyTotalBox = document.getElementById("mspDailyTotal");

    const tableHead = document.getElementById("mspTableHead");
    const tableBody = document.getElementById("mspTableBody");

    const formDate = document.getElementById("formDate");
    const formMachineNo = document.getElementById("formMachineNo");
    const formType = document.getElementById("formType");
    const formAmount = document.getElementById("formAmount");
    const formNotes = document.getElementById("formNotes");
    const formMachineTotal = document.getElementById("formMachineTotal");

    const saveBtn = document.getElementById("mspSaveBtn");
    const deleteBtn = document.getElementById("mspDeleteBtn");
    const scanBtn = document.getElementById("mspQRBtn");

    // -------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------
    let selectedMachine = null;
    let editingEntryId = null;

    // -------------------------------------------------------------
    // DEFAULT DATE
    // -------------------------------------------------------------
    dateInput.value = new Date().toISOString().split("T")[0];
    formDate.value = dateInput.value;

    // -------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------
    setTimeout(() => {
      dateInput.addEventListener("change", () => {
      formDate.value = dateInput.value;
      loadTable();
      });
    }, 200);


    locationSelect.addEventListener("change", loadTable);

    saveBtn.addEventListener("click", saveEntry);
    deleteBtn.addEventListener("click", deleteEntry);

    scanBtn.addEventListener("click", async () => {
  try {
    const video = document.getElementById("qrVideo");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = stream;
    await video.play();

    qrScanner.open({
      targetInputId: "formMachineNo",
      videoElement: video,
      onScan: (result) => {
        formMachineNo.value = result;
        selectedMachine = result;
        loadMachineEntries(result);

        // Stop camera
        stream.getTracks().forEach(t => t.stop());
      }
    });

  } catch (err) {
    console.error("Camera error:", err);
    showToast("Camera failed to open", "error");
  }
});
  // -------------------------------------------------------------
    // INITIAL LOAD
    // -------------------------------------------------------------
    await loadLocations();

      setTimeout(() => {
        loadTable();
      }, 200);


    // -------------------------------------------------------------
    // FUNCTIONS
    // -------------------------------------------------------------
      function clearForm() {
        formMachineNo.value = "";
        formType.value = "MSP";
        formAmount.value = "";
        formNotes.value = "";
        formMachineTotal.textContent = "₹0.00";
        editingEntryId = null;
        selectedMachine = null;
      }



    async function loadLocations() {
  if (userRole === "SuperAdmin") {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .order("name");

    if (error) {
      console.error("Failed to load locations:", error);
      return;
    }

    locationSelect.innerHTML =
    `<option value="">-- Select Location --</option>` +
    data.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");

    locationSelect.value = data?.[0]?.id || "";
    return;
  }

  // LocationAdmin — show actual location name
  const { data: loc, error: locErr } = await supabase
    .from("locations")
    .select("name")
    .eq("id", userLocationId)
    .single();

  if (locErr) {
    console.error("Failed to load location name:", locErr);
    locationSelect.innerHTML = `<option value="${userLocationId}">My Location</option>`;
  } else {
    locationSelect.innerHTML = `<option value="${userLocationId}">${loc.name}</option>`;
  }

  // Set value immediately
  locationSelect.value = userLocationId;
}


    async function loadTable() {
      const date = dateInput.value;
      const locationId = locationSelect.value;

      dbg("Loading MSP for:", { date, locationId });

      if (!locationId) {
        console.error("❌ MSP ERROR: locationId is EMPTY — cannot query");
        return;
      }

      const { data, error } = await supabase
        .from("msp")
        .select("*")
        .eq("entry_date", date)
        .eq("location_id", locationId)
        .order("created_at");

      if (error) {
        console.error("MSP load error:", error);
        return;
      }

      renderTable(data || []);
    }

    function renderTable(entries = []) {
  const machines = {};
  let dailyTotal = 0;

  // Group by machine
  entries.forEach(e => {
    if (!machines[e.machine_no]) machines[e.machine_no] = [];
    machines[e.machine_no].push(e);
    dailyTotal += Number(e.amount);
  });

  dailyTotalBox.textContent = `₹${dailyTotal}`;

  // Count MSP columns
  let maxMSP = 0;
  Object.values(machines).forEach(list => {
    const mspCount = list.filter(x => x.type === "MSP").length;
    if (mspCount > maxMSP) maxMSP = mspCount;
  });

  // -------------------------------
  // BUILD HEADER
  // -------------------------------
  let headerHTML = `<tr>
      <th>Date</th>
      <th>Machine No</th>`;

  for (let i = 1; i <= maxMSP; i++) {
    headerHTML += `<th>MSP${i}</th>`;
  }

  headerHTML += `<th>Total</th>`;

  if (userRole === "SuperAdmin") {
    headerHTML += `<th>Location</th>`;
  }

  headerHTML += `</tr>`;

  tableHead.innerHTML = headerHTML;

  // -------------------------------
  // BUILD BODY
  // -------------------------------
  tableBody.innerHTML = "";

  Object.keys(machines).forEach(machineNo => {
    const list = machines[machineNo];

    const msps = list.filter(x => x.type === "MSP");
    const total = list.reduce((sum, x) => sum + Number(x.amount), 0);

    let rowHTML = `<tr class="msp-row" data-machine="${machineNo}">
        <td>${dateInput.value}</td>
        <td>${machineNo}</td>`;

    for (let i = 0; i < maxMSP; i++) {
      rowHTML += `<td>${msps[i] ? msps[i].amount : ""}</td>`;
    }

    rowHTML += `<td>${total}</td>`;

    if (userRole === "SuperAdmin") {
      rowHTML += `<td>${locationSelect.options[locationSelect.selectedIndex].text}</td>`;
    }

    rowHTML += `</tr>`;

    tableBody.innerHTML += rowHTML;
  });

  // Row click handler
  const rows = document.querySelectorAll(".msp-row");
  rows.forEach(row => {
    row.addEventListener("click", () => {
      selectedMachine = row.dataset.machine;
      loadMachineEntries(selectedMachine);
    });
  });
}

    async function loadMachineEntries(machineNo) {
      formMachineNo.value = machineNo;
        
      formMachineNo.addEventListener("change", () => {
        const machine = formMachineNo.value?.trim();
        if (machine) {
          selectedMachine = machine;
          loadMachineEntries(machine);
        }
      });

      const { data, error } = await supabase
        .from("msp")
        .select("*")
        .eq("machine_no", machineNo)
        .eq("entry_date", dateInput.value)
        .order("created_at");

      if (error) {
        console.error("MSP machine load error:", error);
        return;
      }

      if (!data || data.length === 0) {
        editingEntryId = null;
        formType.value = "MSP";
        formAmount.value = "";
        formNotes.value = "";
        formMachineTotal.textContent = `$0.00`;
        return;
      }

      const last = data[data.length - 1];
      editingEntryId = last.id;

      formType.value = last.type;
      formAmount.value = last.amount;
      formNotes.value = last.remarks || "";

      const total = data.reduce((sum, x) => sum + Number(x.amount), 0);
      formMachineTotal.textContent = `$${total.toFixed(2)}`;
    }

  async function saveEntry() {
      if (userRole === "SuperAdmin" && !locationSelect.value) {
       showToast("Please select a location", "error");
        return;
      }

    const machine = formMachineNo.value?.trim();

    if (!machine) {
      showToast("Enter or scan a machine number first", "error");
      return;
    }

    // Build payload
    const { data: userData } = await supabase.auth.getUser();

    const payload = {
      machine_no: machine,
      entry_date: formDate.value,
      amount: Number(formAmount.value),
      type: formType.value,
      remarks: formNotes.value,
      location_id: locationSelect.value,
      created_by: userData.user.id
    };

    // UPDATE
    if (editingEntryId) {
      const { error } = await supabase
        .from("msp")
        .update(payload)
        .eq("id", editingEntryId);

      if (error) {
        console.error("MSP update error:", error);
        showToast("Update failed", "error");
        return;
      }

      showToast("Updated", "success");
    }

    // INSERT
    else {
      const { error } = await supabase
        .from("msp")
        .insert(payload);

      if (error) {
        console.error("MSP insert error:", error);
        showToast("Insert failed", "error");
        return;
      }

      showToast("Saved", "success");
    }

    await loadTable();
    await loadMachineEntries(machine);
    clearForm();
  }


    async function deleteEntry() {
      if (!editingEntryId) return;
      if (!confirm("Delete this entry?")) return;

      const { error } = await supabase
        .from("msp")
        .delete()
        .eq("id", editingEntryId);

      if (error) {
        console.error("MSP delete error:", error);
        showToast("Delete failed", "error");
        return;
      }

      showToast("Deleted", "warning");
      await loadTable();
      formMachineTotal.textContent = `$0.00`;
      editingEntryId = null;
    }
  } catch (err) {
    console.error("initMSPModule error:", err);
  }
}

// -------------------------------------------------------------
// MAKE FUNCTION AVAILABLE GLOBALLY
// -------------------------------------------------------------
window.initMSPModule = initMSPModule;
