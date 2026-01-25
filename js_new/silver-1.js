// /js_new/silver.js

import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function setupSilverModal() {
  const tableBody = document.getElementById("seTableBody");
  const totalSumBox = document.getElementById("seTotalSum");

  let entries = [];

  loadEntries();

  async function loadEntries() {
    const snap = await getDocs(collection(db, "silver"));
    entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
    updateTotalSum();
  }

  function updateTotalSum() {
    const total = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    totalSumBox.textContent = `Total Paid Amount: ₹${total}`;
  }

  function renderTable() {
    tableBody.innerHTML = "";
    entries.forEach(e => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.slipId}</td>
        <td>${e.dateTime}</td>
        <td>${e.agentName}</td>
        <td>${e.machineNo}</td>
        <td>₹${e.amount}</td>
        <td>${e.paidBy}</td>
        <td><svg id="barcode-${e.slipId}"></svg></td>
      `;
      tableBody.appendChild(tr);

      // Generate barcode for each slip
      JsBarcode(`#barcode-${e.slipId}`, e.slipId, {
        format: "CODE128",
        displayValue: true,
        fontSize: 12,
        height: 40
      });
    });
  }
}

// ======================================================
// QR Scan Processing
// ======================================================
export async function processSilverScan(slipId) {
  const slipRef = doc(db, "agentSilver", slipId);
  const slipSnap = await getDoc(slipRef);

  if (!slipSnap.exists()) {
    showToast("Invalid slip code.");
    return;
  }

  const slip = slipSnap.data();

  if (slip.status === "Paid") {
    showToast("This ticket has already been paid.");
    return;
  }

  // Get current Silver user name from session
  const silverUserName = sessionStorage.getItem("userName") || "Unknown";

  // Copy to Silver Entry
  const entryRef = doc(db, "silver", slipId);
  await setDoc(entryRef, {
    slipId,
    dateTime: slip.dateTime,
    agentName: slip.agentName,
    machineNo: slip.machineNo,
    amount: slip.amount,
    status: "Paid",
    confirmedBy: "Silver",
    paidBy: silverUserName
  });

  // Update AgentSilver
  await updateDoc(slipRef, {
    status: "Paid",
    confirmedBy: "Silver",
    paidBy: silverUserName
  });

  showToast(`Payment confirmed by ${silverUserName}: ₹${slip.amount}`);
}