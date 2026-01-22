console.log("MSP JS Loaded");

// ⭐ THIS IS THE MISSING LINE ⭐
// Your dashboard dispatches "MSPModuleLoaded"
// This line tells MSP.js to run initMSPModule() when that event fires.
window.addEventListener("MSPModuleLoaded", initMSPModule);

export function initMSPModule() {
  console.log("MSP Module Initialized");

  const supabase = window.supabaseClient;

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

  let selectedMachine = null;
  let editingEntryId = null;

  // Default date = today
  dateInput.value = new Date().toISOString().split("T")[0];
  formDate.value = dateInput.value;

  init();

  async function init() {
    await loadLocations();
    loadTable();

    deleteBtn.disabled = !["SuperAdmin", "LocationAdmin"].includes(window.userRole);

    attachEvents();
  }

  function attachEvents() {
    dateInput.addEventListener("change", () => {
      formDate.value = dateInput.value;
      loadTable();
    });

    locationSelect.addEventListener("change", loadTable);

    saveBtn.addEventListener("click", saveEntry);
    deleteBtn.addEventListener("click", deleteEntry);

    document.getElementById("mspQRBtn").addEventListener("click", () => {
      openQRScanner((result) => {
        formMachineNo.value = result;
        selectedMachine = result;
        loadMachineEntries(result);
      });
    });
  }

  async function loadLocations() {
    if (window.userRole === "SuperAdmin") {
      const { data } = await supabase.from("locations").select("*").order("name");
      locationSelect.innerHTML = data.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
    } else {
      locationSelect.innerHTML = `<option value="${window.userLocationId}">${window.userLocationName}</option>`;
    }
  }

  async function loadTable() {
    const date = dateInput.value;
    const locationId = locationSelect.value;

    const { data } = await supabase
      .from("msp_entries")
      .select("*")
      .eq("entry_date", date)
      .eq("location_id", locationId)
      .order("created_at");

    renderTable(data);
  }

  function renderTable(entries) {
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

    document.querySelectorAll(".msp-row").forEach(row => {
      row.addEventListener("click", () => {
        selectedMachine = row.dataset.machine;
        loadMachineEntries(selectedMachine);
      });
    });
  }

  async function loadMachineEntries(machineNo) {
    formMachineNo.value = machineNo;

    const { data } = await supabase
      .from("msp_entries")
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
      alert("Select a machine from the table");
      return;
    }

    const payload = {
      type: formType.value,
      amount: Number(formAmount.value),
      remarks: formNotes.value
    };

    await supabase.from("msp_entries").update(payload).eq("id", editingEntryId);

    loadTable();
    loadMachineEntries(selectedMachine);
  }

  async function deleteEntry() {
    if (!editingEntryId) return;
    if (!confirm("Delete this entry?")) return;

    await supabase.from("msp_entries").delete().eq("id", editingEntryId);

    loadTable();
    formMachineTotal.textContent = `$0.00`;
  }
}
