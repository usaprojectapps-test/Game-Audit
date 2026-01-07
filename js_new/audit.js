// /js_new/audit.js

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function setupAuditModal() {
  const machineInput = document.getElementById("auditMachineNo");
  const dateInput = document.getElementById("auditDate");
  const prevIn = document.getElementById("auditPrevIn");
  const prevOut = document.getElementById("auditPrevOut");
  const curIn = document.getElementById("auditCurIn");
  const curOut = document.getElementById("auditCurOut");
  const statusBox = document.getElementById("auditStatus");
  const saveBtn = document.getElementById("auditSaveBtn");

  // Validate machine exists
  async function validateMachine(machineNo) {
    const q = query(
      collection(db, "machines"),
      where("machineNo", "==", machineNo)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  // Auto-fill previous meters
  async function autoFillPrevious(machineNo, dateStr) {
    prevIn.value = "";
    prevOut.value = "";

    const q = query(
      collection(db, "audit"),
      where("machineNo", "==", machineNo),
      where("dateString", "<", dateStr),
      orderBy("dateString", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      alert("No previous audit found. Please enter manually.");
      return;
    }

    const data = snap.docs[0].data();
    prevIn.value = data.prevMeterIn;
    prevOut.value = data.prevMeterOut;
  }

  // When date changes → auto-fill previous
  dateInput.addEventListener("change", async () => {
    const machineNo = machineInput.value.trim();
    const dateStr = dateInput.value;

    if (!machineNo || !dateStr) return;

    const exists = await validateMachine(machineNo);
    if (!exists) {
      alert("Machine number not found.");
      return;
    }

    await autoFillPrevious(machineNo, dateStr);
  });

  // Save audit entry
  saveBtn.addEventListener("click", async () => {
    statusBox.textContent = "";
    statusBox.className = "";

    const machineNo = machineInput.value.trim();
    const dateStr = dateInput.value;
    const prevInVal = prevIn.value;
    const prevOutVal = prevOut.value;
    const curInVal = curIn.value;
    const curOutVal = curOut.value;

    if (!machineNo || !dateStr || !curInVal || !curOutVal) {
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
      await addDoc(collection(db, "audit"), {
        machineNo: machineNo,
        dateString: dateStr,
        dateTimestamp: Timestamp.fromDate(new Date(dateStr)),
        prevMeterIn: Number(prevInVal || 0),
        prevMeterOut: Number(prevOutVal || 0),
        curMeterIn: Number(curInVal),
        curMeterOut: Number(curOutVal),
        createdAt: Timestamp.now()
      });

      statusBox.textContent = "Audit saved successfully.";
      statusBox.className = "success-text";

      setTimeout(() => {
        document.getElementById("auditModal").style.display = "none";
      }, 1200);

    } catch (err) {
      console.error(err);
      statusBox.textContent = "Error saving audit.";
      statusBox.className = "error-text";
    }
  });
}