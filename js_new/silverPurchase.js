// /js_new/silverPurchase.js

import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export function setupSilverPurchaseModal() {
  const formDateTime = document.getElementById("spDateTime");
  const formAmount = document.getElementById("spAmount");
  const formStatusText = document.getElementById("spFormStatus");
  const saveBtn = document.getElementById("spSaveBtn");
  const tableBody = document.getElementById("spTableBody");
  const totalSumBox = document.getElementById("spTotalSum");

  const userDept = sessionStorage.getItem("department"); // "Manager" or "Silver"

  let purchases = [];

  loadPurchases();

  async function loadPurchases() {
    const snap = await getDocs(collection(db, "silverPurchase"));
    purchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
    updateTotalSum();
  }

  function updateTotalSum() {
    const total = purchases
      .filter(p => p.status === "Approved")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    totalSumBox.textContent = `Total Approved Purchases: ₹${total}`;
  }

  function renderTable() {
    tableBody.innerHTML = "";
    purchases.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.dateTime}</td>
        <td>₹${p.amount}</td>
        <td>${p.status}</td>
        <td>${p.enteredBy}</td>
        <td>${p.approvedBy || "-"}</td>
        <td>
          ${p.status === "Pending" && p.enteredBy !== userDept
            ? `<button class="btn btn-primary btn-approve" data-id="${p.id}">Approve</button>`
            : ""}
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Attach approve buttons
    document.querySelectorAll(".btn-approve").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        await updateDoc(doc(db, "silverPurchase", id), {
          status: "Approved",
          approvedBy: userDept
        });
        loadPurchases();
      });
    });
  }

  saveBtn.addEventListener("click", async () => {
    const dateTime = formDateTime.value;
    const amount = formAmount.value;

    if (!dateTime || !amount) {
      formStatusText.textContent = "Date/Time and Amount are required.";
      formStatusText.className = "error-text";
      return;
    }

    const id = `SP_${Date.now()}`;
    const data = {
      purchaseId: id,
      dateTime: dateTime,
      amount: Number(amount),
      status: "Pending",
      enteredBy: userDept,
      approvedBy: null
    };

    try {
      await setDoc(doc(db, "silverPurchase", id), data);
      formStatusText.textContent = "Purchase entry saved.";
      formStatusText.className = "success-text";
      formDateTime.value = "";
      formAmount.value = "";
      loadPurchases();
    } catch (err) {
      formStatusText.textContent = "Error saving purchase.";
      formStatusText.className = "error-text";
    }
  });
}