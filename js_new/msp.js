document.addEventListener("DOMContentLoaded", () => {
  const supabase = window.supabaseClient;

  const dateInput = document.getElementById("mspDate");
  const machineInput = document.getElementById("mspMachineNo");
  const amountInput = document.getElementById("mspAmount");
  const typeInput = document.getElementById("mspType");
  const remarksInput = document.getElementById("mspRemarks");
  const totalBox = document.getElementById("mspTotalBox");
  const entryList = document.getElementById("mspEntryList");
  const saveBtn = document.getElementById("mspSaveBtn");

  // Default date = today
  dateInput.value = new Date().toISOString().split("T")[0];

  // Load entries when date or machine changes
  dateInput.addEventListener("change", loadEntries);
  machineInput.addEventListener("change", loadEntries);

  async function loadEntries() {
    const machineNo = machineInput.value.trim();
    const date = dateInput.value;

    if (!machineNo || !date) return;

    entryList.innerHTML = "Loading...";

    const { data, error } = await supabase
      .from("msp_entries")
      .select("*")
      .eq("machine_no", machineNo)
      .eq("entry_date", date)
      .order("created_at", { ascending: true });

    if (error) {
      entryList.innerHTML = "Error loading entries";
      return;
    }

    renderEntries(data);
  }

  function renderEntries(entries) {
    entryList.innerHTML = "";

    let total = 0;

    entries.forEach((e) => {
      total += Number(e.amount);

      const card = document.createElement("div");
      card.className = "entry-card";
      card.innerHTML = `
        <div><strong>${e.type}</strong> — ₹${e.amount}</div>
        <div class="entry-remarks">${e.remarks || ""}</div>
        <div class="entry-time">${new Date(e.created_at).toLocaleTimeString()}</div>
      `;
      entryList.appendChild(card);
    });

    totalBox.textContent = `₹${total}`;
  }

  saveBtn.addEventListener("click", async () => {
    const machineNo = machineInput.value.trim();
    const date = dateInput.value;
    const amount = Number(amountInput.value);
    const type = typeInput.value;
    const remarks = remarksInput.value;

    if (!machineNo || !date || !amount) {
      alert("Please fill all required fields");
      return;
    }

    const { error } = await supabase.from("msp_entries").insert({
      machine_no: machineNo,
      entry_date: date,
      amount,
      type,
      remarks,
      location_id: window.userLocationId,
      created_by: window.userId
    });

    if (error) {
      alert("Error saving entry");
      return;
    }

    amountInput.value = "";
    remarksInput.value = "";

    loadEntries();
  });

  // QR Scanner Hook
  document.getElementById("mspQRBtn").addEventListener("click", () => {
    openQRScanner((result) => {
      machineInput.value = result;
      loadEntries();
    });
  });
});

