// /js_new/msp.js

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function setupMspModal() {
  const machineInput = document.getElementById("mspMachineNo");
  const dateInput = document.getElementById("mspDate");
  const amountInput = document.getElementById("mspAmount");
  const typeInput = document.getElementById("mspType");
  const remarksInput = document.getElementById("mspRemarks");

  const entryList = document.getElementById("mspEntryList");
  const totalBox = document.getElementById("mspTotalBox");
  const statusBox = document.getElementById("mspStatus");
  const saveBtn = document.getElementById("mspSaveBtn");

  // Validate machine exists
  async function validateMachine(machineNo) {
    const q = query(
      collection(db, "machines"),
      where("machineNo", "==", machineNo)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  // Load MSP entries for machine/date
  async function loadMspEntries(machineNo, dateStr) {
    entryList.innerHTML = "";
    totalBox.textContent = "Total MSP Today: ₹0";

    const q = query(
      collection(db, "msp"),
      where("machineNo", "==", machineNo),
      where("dateString", "==", dateStr),
      orderBy("createdAt", "asc")
    );

    const snap = await getDocs(q);

    let total = 0;

    snap.forEach(docSnap => {
      const data = docSnap.data();
      total += Number(data.amount);

      const time = data.createdAt.toDate().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });

      // Create card
      const card = document.createElement("div");
      card.style.padding = "10px 14px";
      card.style.borderRadius = "10px";
      card.style.background = "var(--card-bg)";
      card.style.boxShadow = "var(--shadow-soft)";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";

      card.innerHTML = `
        <div style="display:flex; flex-direction:column;">
          <strong>[${data.type}] ₹${data.amount}</strong>
          <span style="font-size:12px; color:var(--subtext-color);">${time}</span>
        </div>
        <span style="font-size:12px; color:var(--subtext-color);">${data.remarks || ""}</span>
      `;

      entryList.appendChild(card);
    });

    totalBox.textContent = `Total MSP Today: ₹${total}`;
  }

  // Refresh when machine/date changes
  async function refreshMspData() {
    const machineNo = machineInput.value.trim();
    const dateStr = dateInput.value;

    if (!machineNo || !dateStr) return;

    const exists = await validateMachine(machineNo);
    if (!exists) {
      alert("Machine number not found.");
      return;
    }

    await loadMspEntries(machineNo, dateStr);
  }

  machineInput.addEventListener("change", refreshMspData);
  dateInput.addEventListener("change", refreshMspData);

  // Save MSP entry
  saveBtn.addEventListener("click", async () => {
    statusBox.textContent = "";
    statusBox.className = "";

    const machineNo = machineInput.value.trim();
    const dateStr = dateInput.value;
    const amount = amountInput.value;
    const type = typeInput.value;
    const remarks = remarksInput.value.trim();

    if (!machineNo || !dateStr || !amount) {
      statusBox.textContent = "Please fill all required fields.";
      statusBox.className = "error-text";
      return;
    }

    const exists = await validateMachine(machineNo);
    if (!exists) {
      alert("Machine number not found.");
      return;
    }

    try {
      await addDoc(collection(db, "msp"), {
        machineNo: machineNo,
        dateString: dateStr,
        dateTimestamp: Timestamp.fromDate(new Date(dateStr)),
        amount: Number(amount),
        type: type,
        remarks: remarks,
        createdAt: Timestamp.now()
      });

      statusBox.textContent = "MSP entry saved successfully.";
      statusBox.className = "success-text";

      // Refresh list + total
      await loadMspEntries(machineNo, dateStr);

      // Auto-close modal
      setTimeout(() => {
        document.getElementById("mspModal").style.display = "none";
      }, 1200);

    } catch (err) {
      console.error(err);
      statusBox.textContent = "Error saving MSP entry.";
      statusBox.className = "error-text";
    }
  });
}