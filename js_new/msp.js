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

// ----------------------
// Debug helper
// ----------------------
const IS_DEV = window.location.hostname === "localhost" || window.location.hostname.endsWith(".local");
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

  // Wait until FULL MSP HTML is in DOM
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
    dateInput.addEventListener("change", () => {
      formDate.value = dateInput.value;
      loadTable();
    });

    locationSelect.addEventListener("change", loadTable);

    saveBtn.addEventListener("click", saveEntry);
    deleteBtn.addEventListener("click", deleteEntry);

    scanBtn.addEventListener("click", () => {
      qrScanner.open({
        targetInputId: "formMachineNo",
        onScan: (result) => {
          formMachineNo.value = result;
          selectedMachine = result;
          loadMachineEntries(result);
        }
      });
    });

    // -------------------------------------------------------------
    // INITIAL LOAD
    // -------------------------------------------------------------
    await loadLocations();
    await loadTable();

    // -------------------------------------------------------------
    // FUNCTIONS
    // -------------------------------------------------------------
    async function loadLocations() {
      if (userRole === "SuperAdmin") {
        const { data } = await supabase.from("locations").select("*").order("name");

        locationSelect.innerHTML = data.map(l => `<option value="${l.id}">${l.name}</option>`).join("");

        setTimeout(() => {
          locationSelect.value = data[0]?.id || "";
          dbg("SuperAdmin locationSelect.value:", locationSelect.value);
        }, 50);

      } else {
        locationSelect.innerHTML = `<option value="${userLocationId}">My Location</option>`;

        setTimeout(() => {
          locationSelect.value = userLocationId;
          dbg("User locationSelect.value:", locationSelect.value);
        }, 50);
      }
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

      entries.forEach(e => {
        if (!machines[e.machine_no]) machines[e.machine_no] = [];
        machines[e.machine_no].push(e);
        dailyTotal += Number(e.amount);
      });

      dailyTotalBox.textContent = `₹${dailyTotal}`;

      let maxMSP = 0;
      Object.values(machines).forEach(list => {
        const mspCount = list.filter(x => x.type === "MSP").length;
        if (mspCount > maxMSP) maxMSP = mspCount;
      });

      let headerHTML = `<tr><th>Machine No</th>`;
      for (let i = 1; i <= maxMSP; i++) headerHTML += `<th>MSP${i}</th>`;
      headerHTML += `<th>EOD</th><th>Total</th></tr>`;
      tableHead.innerHTML = headerHTML;

      tableBody.innerHTML = "";

      Object.keys(machines).forEach(machineNo => {
        const list = machines[machineNo];

        const msps = list.filter(x => x.type === "MSP");
        const eod = list.find(x => x.type === "EOD");
        const total = list.reduce((sum, x) => sum + Number(x.amount), 0);

        let rowHTML = `<tr class="msp-row" data-machine="${machineNo}">
          <td>${machineNo}</td>`;

        for (let i = 0; i < maxMSP; i++) {
          rowHTML += `<td>${msps[i] ? msps[i].amount : ""}</td>`;
        }

        rowHTML += `<td>${eod ? eod.amount : ""}</td>`;
        rowHTML += `<td>${total}</td></tr>`;

        tableBody.innerHTML += rowHTML;
      });

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

      const { data } = await supabase
        .from("msp")
        .select("*")
        .eq("machine_no", machineNo)
        .eq("entry_date", dateInput.value)
        .order("created_at");

      if (!data || data.length === 0) {
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
      if (!selectedMachine) {
        showToast("Select a machine first", "error");
        return;
      }

      const payload = {
        type: formType.value,
        amount: Number(formAmount.value),
        remarks: formNotes.value
      };

      await supabase.from("msp").update(payload).eq("id", editingEntryId);

      showToast("Saved", "success");
      loadTable();
      loadMachineEntries(selectedMachine);
    }

    async function deleteEntry() {
      if (!editingEntryId) return;
      if (!confirm("Delete this entry?")) return;

      await supabase.from("msp").delete().eq("id", editingEntryId);

      showToast("Deleted", "warning");
      loadTable();
      formMachineTotal.textContent = `$0.00`;
    }

  } catch (err) {
    console.error("initMSPModule error:", err);
  }
}

// -------------------------------------------------------------
// MAKE FUNCTION AVAILABLE GLOBALLY
// -------------------------------------------------------------
window.initMSPModule = initMSPModule;
