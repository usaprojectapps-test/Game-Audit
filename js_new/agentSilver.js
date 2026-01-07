// /js_new/agentSilver.js

import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function setupAgentSilverModal() {
  const formDateTime = document.getElementById("asDateTime");
  const formAgentName = document.getElementById("asAgentName");
  const formMachineNo = document.getElementById("asMachineNo");
  const formAmount = document.getElementById("asAmount");
  const formStatusText = document.getElementById("asFormStatus");
  const saveBtn = document.getElementById("asSaveBtn");
  const qrCanvas = document.getElementById("asQrCanvas");
  const qrText = document.getElementById("asQrText");
  const tableBody = document.getElementById("asTableBody");

  let qrInstance = new QRious({
    element: qrCanvas,
    size: 128,
    value: ""
  });

  let slips = [];

  loadSlips();

  async function loadSlips() {
    const snap = await getDocs(collection(db, "agentSilver"));
    slips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
  }

  function renderTable() {
    tableBody.innerHTML = "";
    slips.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.slipId}</td>
        <td>${s.agentName}</td>
        <td>${s.machineNo}</td>
        <td>₹${s.amount}</td>
        <td>${s.status}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  saveBtn.addEventListener("click", async () => {
    const dateTime = formDateTime.value;
    const agentName = formAgentName.value.trim();
    const machineNo = formMachineNo.value.trim();
    const amount = Number(formAmount.value);

    if (!dateTime || !agentName || !machineNo || !amount) {
      formStatusText.textContent = "All fields are required.";
      formStatusText.className = "error-text";
      return;
    }

    const slipId = `AS_${Date.now()}`;
    const data = {
      slipId,
      dateTime,
      agentName,
      machineNo,
      amount,
      status: "Pending"
    };

    try {
      await setDoc(doc(db, "agentSilver", slipId), data);
      formStatusText.textContent = "Slip saved.";
      formStatusText.className = "success-text";

      // Generate QR preview in modal
      qrInstance.value = slipId;
      qrText.textContent = `Slip ID: ${slipId}`;

      // Open print slip in new window
      const printWin = window.open("", "_blank");
      printWin.document.write(`
        <html>
        <head>
          <title>Agent Silver Slip</title>
          <style>
            body { font-family: Arial; margin:20px; }
            .slip-container { width:300px; border:1px solid #333; padding:15px; border-radius:8px; }
            .slip-header { text-align:center; font-weight:bold; margin-bottom:10px; }
            .slip-row { display:flex; justify-content:space-between; margin:4px 0; }
            .qr-box, .barcode-box { text-align:center; margin-top:15px; }
            .footer { text-align:center; font-size:12px; margin-top:10px; border-top:1px dashed #999; padding-top:5px; }
          </style>
        </head>
        <body>
          <div class="slip-container">
            <div class="slip-header">Agent Silver Slip</div>
            <div class="slip-row"><span>Slip ID:</span><span>${slipId}</span></div>
            <div class="slip-row"><span>Date/Time:</span><span>${dateTime}</span></div>
            <div class="slip-row"><span>Agent:</span><span>${agentName}</span></div>
            <div class="slip-row"><span>Machine:</span><span>${machineNo}</span></div>
            <div class="slip-row"><span>Amount:</span><span>₹${amount}</span></div>

            <div class="qr-box">
              <canvas id="qrCanvas" width="128" height="128"></canvas>
              <div style="font-size:12px; color:#666;">Scan QR to confirm payment</div>
            </div>

            <div class="barcode-box">
              <svg id="barcode"></svg>
              <div style="font-size:12px; color:#666;">Barcode for POS scanners</div>
            </div>

            <div class="footer">Game Audit System</div>
          </div>

          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
          <script src="https://cdn.jsdelivr.net/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
          <script>
            // Generate QR
            new QRious({
              element: document.getElementById("qrCanvas"),
              size: 128,
              value: "${slipId}"
            });

            // Generate Barcode
            JsBarcode("#barcode", "${slipId}", {
              format: "CODE128",
              displayValue: true,
              fontSize: 14,
              height: 40
            });

            // Trigger print dialog
            window.print();
          </script>
        </body>
        </html>
      `);

      // Reset form
      formDateTime.value = "";
      formAgentName.value = "";
      formMachineNo.value = "";
      formAmount.value = "";

      loadSlips();
    } catch (err) {
      formStatusText.textContent = "Error saving slip.";
      formStatusText.className = "error-text";
    }
  });
}