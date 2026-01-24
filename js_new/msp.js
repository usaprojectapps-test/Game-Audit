if (window.__MSP_SCRIPT_INCLUDED__) {
  console.log("MSP.js was included twice — preventing duplicate execution");
  throw new Error("Duplicate MSP.js load");
}
window.__MSP_SCRIPT_INCLUDED__ = true;

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
    let editMode = false; // NEW FLAG

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

    // SCANNER
    scanBtn.addEventListener("click", () => {
      qrScanner.open({
        targetInputId: "formMachineNo",
        onScan: (result) => {
          formMachineNo.value = result;
          selectedMachine = result;
          loadMachineEntries(result, false); // NEW ENTRY MODE
        }
      });
    });

    // Manual machine entry
    formMachineNo.addEventListener("change", () => {
      const machine = formMachineNo.value?.trim();
      if (machine) {
        selectedMachine = machine;
        loadMachineEntries(machine, false); // NEW ENTRY MODE
      }
    });

    // -------------------------------------------------------------
    // INITIAL LOAD
    // -------------------------------------------------------------
    await loadLocations();
    loadTable();

    // -------------------------------------------------------------
    // FUNCTIONS
    // -------------------------------------------------------------
    function clearForm() {
      formMachineNo.value = "";
      formType.value = "MSP";
      formAmount.value = "";
      formNotes.value = "";
      formMachineTotal.textContent = "$0.00";
      editingEntryId = null;
      editMode = false;
      selectedMachine = null;
    }

    async function loadLocations() {
      if (userRole === "SuperAdmin") {
        const { data, error } = await supabase
          .from("locations")
          .select("*")
          .order("name");

        if (error) return;

        locationSelect.innerHTML =
          `<option value="">-- Select Location --</option>` +
          data.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");

        locationSelect.value = "";
        return;
      }

      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", userLocationId)
        .single();

      locationSelect.innerHTML = `<option value="${userLocationId}">${loc?.name || "My Location"}</option>`;
      locationSelect.value = userLocationId;
    }

    async function loadTable() {
      const date = dateInput.value;
      const locationId = locationSelect.value;

      if (!locationId) return;

      const { data, error } = await supabase
        .from("msp")
        .select("*")
        .eq("entry_date", date)
        .eq("location_id", locationId)
        .order("created_at");

      if (error) return;

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

      dailyTotalBox.textContent = `$${dailyTotal.toFixed(2)}`;

      let maxMSP = 0;
      Object.values(machines).forEach(list => {
        const mspCount = list.filter(x => x.type === "MSP").length;
        if (mspCount > maxMSP) maxMSP = mspCount;
      });

      let headerHTML = `<tr>
        <th>Date</th>
        <th>Machine No</th>`;

      for (let i = 1; i <= maxMSP; i++) {
        headerHTML += `<th>MSP${i}</th>`;
      }

      headerHTML += `<th>EOD</th><th>Total</th>`;

      if (userRole === "SuperAdmin") {
        headerHTML += `<th>Location</th>`;
      }

      headerHTML += `</tr>`;
      tableHead.innerHTML = headerHTML;

      tableBody.innerHTML = "";

      Object.keys(machines).forEach(machineNo => {
        const list = machines[machineNo];
        const msps = list.filter(x => x.type === "MSP");
        const eod = list.find(x => x.type === "EOD");
        const total = list.reduce((sum, x) => sum + Number(x.amount), 0);

        let rowHTML = `<tr class="msp-row" data-machine="${machineNo}">
          <td>${dateInput.value}</td>
          <td>${machineNo}</td>`;

        for (let i = 0; i < maxMSP; i++) {
          rowHTML += `<td>${msps[i] ? msps[i].amount : ""}</td>`;
        }

        rowHTML += `<td>${eod ? eod.amount : ""}</td>`;
        rowHTML += `<td>$${total.toFixed(2)}</td>`;

        if (userRole === "SuperAdmin") {
          rowHTML += `<td>${locationSelect.options[locationSelect.selectedIndex].text}</td>`;
        }

        rowHTML += `</tr>`;

        tableBody.innerHTML += rowHTML;
      });

      document.querySelectorAll(".msp-row").forEach(row => {
        row.addEventListener("click", () => {
          selectedMachine = row.dataset.machine;
          loadMachineEntries(selectedMachine, true); // EDIT MODE
        });
      });
    }

    async function loadMachineEntries(machineNo, fromClick) {
      formMachineNo.value = machineNo;

      const { data, error } = await supabase
        .from("msp")
        .select("*")
        .eq("machine_no", machineNo)
        .eq("entry_date", dateInput.value)
        .eq("location_id", locationSelect.value) // FIXED
        .order("created_at");

      if (error) return;

      const total = (data || []).reduce((sum, x) => sum + Number(x.amount), 0);
      formMachineTotal.textContent = `$${total.toFixed(2)}`;

      if (!fromClick || !data || data.length === 0) {
        editingEntryId = null;
        editMode = false;
        formType.value = "MSP";
        formAmount.value = "";
        formNotes.value = "";
        return;
      }

      const last = data[data.length - 1];
      editingEntryId = last.id;
      editMode = true;

      formType.value = last.type;
      formAmount.value = last.amount;
      formNotes.value = last.remarks || "";
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

      // -------------------------------------------------------------
      // MACHINE VALIDATION
      // -------------------------------------------------------------
      const { data: machineCheck, error: machineErr } = await supabase
        .from("machines")
        .select("machineid, location_id, healthstatus")
        .eq("machineid", machine)
        .single();

      if (machineErr || !machineCheck) {
        showToast("Machine number not found in machine list", "error");
        return;
      }

      if (machineCheck.location_id !== locationSelect.value) {
        showToast("Machine does not belong to the selected location", "error");
        return;
      }

      if (machineCheck.healthstatus !== "Active") {
        showToast("Machine is not active", "error");
        return;
      }

      // -------------------------------------------------------------
      // BUILD PAYLOAD
      // -------------------------------------------------------------
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

      if (editMode && editingEntryId) {
        const { error } = await supabase
          .from("msp")
          .update(payload)
          .eq("id", editingEntryId);

        if (error) {
          showToast("Update failed", "error");
          return;
        }

        showToast("Updated", "success");
      } else {
        const { error } = await supabase
          .from("msp")
          .insert(payload);

        if (error) {
          showToast("Insert failed", "error");
          return;
        }

        showToast("Saved", "success");
      }

      await loadTable();
      clearForm(); // FIXED
    }

    async function deleteEntry() {
      if (!editingEntryId) return;
      if (!confirm("Delete this entry?")) return;

      const { error } = await supabase
        .from("msp")
        .delete()
        .eq("id", editingEntryId);

      if (error) {
        showToast("Delete failed", "error");
        return;
      }

      showToast("Deleted", "warning");
      await loadTable();
      clearForm();
    }

  } catch (err) {
    console.error("initMSPModule error:", err);
  }
}

window.initMSPModule = initMSPModule;
