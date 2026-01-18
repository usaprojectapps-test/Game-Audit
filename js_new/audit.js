console.log("AUDIT JS LOADED");
console.log("auditSaveBtn:", document.getElementById("auditSaveBtn"));

document.addEventListener("DOMContentLoaded", () => {

  console.log("TOP OF AUDIT.JS REACHED");

  // -------------------------------------------------------------
  // REAL QR SCANNER (GLOBAL)
  // -------------------------------------------------------------
  window.openQRScanner = function (targetInputId) {
    const overlay = document.createElement("div");
    overlay.className = "qr-overlay";

    overlay.innerHTML = `
      <div class="qr-modal">
        <h3>Scan Machine QR</h3>
        <video id="qr-video" class="qr-video"></video>
        <button id="closeScannerBtn" class="qr-close-btn">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const videoElem = document.getElementById("qr-video");

    const scanner = new QrScanner(
      videoElem,
      result => {
        const clean = result.data.replace("MACHINE:", "").trim();
        document.getElementById(targetInputId).value = clean;

        scanner.stop();
        overlay.remove();
      },
      { highlightScanRegion: true }
    );

    scanner.start();

    document.getElementById("closeScannerBtn").onclick = () => {
      scanner.stop();
      overlay.remove();
    };
  };

  // -------------------------------------------------------------
  // DOM ELEMENTS
  // -------------------------------------------------------------
  const auditMachineNo = document.getElementById("auditMachineNo");
  const auditDate = document.getElementById("auditDate");
  const auditPrevIn = document.getElementById("auditPrevIn");
  const auditPrevOut = document.getElementById("auditPrevOut");
  const auditCurIn = document.getElementById("auditCurIn");
  const auditCurOut = document.getElementById("auditCurOut");
  const auditJackpot = document.getElementById("auditJackpot");
  const auditHealth = document.getElementById("auditHealth");
  const auditStatus = document.getElementById("auditStatus");

  const calcTotalIn = document.getElementById("calcTotalIn");
  const calcTotalOut = document.getElementById("calcTotalOut");
  const calcNet = document.getElementById("calcNet");

  const machinesEnteredCount = document.getElementById("machinesEnteredCount");
  const auditListDate = document.getElementById("auditListDate");
  const auditSaveBtn = document.getElementById("auditSaveBtn");

  if (!auditSaveBtn) return;

  // -------------------------------------------------------------
  // USER INFO
  // -------------------------------------------------------------
  let currentUser = null;
  let userLocationId = null;

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    if (!data || !data.user) return;

    currentUser = data.user;
    userLocationId = currentUser.user_metadata?.location_id;
  }

  await loadUser();


  // -------------------------------------------------------------
  // LOAD PREVIOUS METERS
  // -------------------------------------------------------------
  async function loadPreviousAudit() {
    const machineNo = auditMachineNo.value.trim();
    const date = auditDate.value;
    if (!machineNo || !date) return;

    const { data } = await supabase
      .from("audit_entries")
      .select("*")
      .eq("machine_no", machineNo)
      .eq("location_id", userLocationId)
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(1);

    if (!data.length) {
      auditPrevIn.value = "";
      auditPrevOut.value = "";
      return;
    }

    const prev = data[0];
    auditPrevIn.value = prev.cur_in;
    auditPrevOut.value = prev.cur_out;

    calculateTotals();
  }

  auditMachineNo.addEventListener("change", loadPreviousAudit);
  auditDate.addEventListener("change", loadPreviousAudit);

  // -------------------------------------------------------------
  // CALCULATIONS
  // -------------------------------------------------------------
  function calculateTotals() {
    const prevIn = Number(auditPrevIn.value || 0);
    const prevOut = Number(auditPrevOut.value || 0);
    const curIn = Number(auditCurIn.value || 0);
    const curOut = Number(auditCurOut.value || 0);

    calcTotalIn.value = curIn - prevIn;
    calcTotalOut.value = curOut - prevOut;
    calcNet.value = calcTotalIn.value - calcTotalOut.value;
  }

  auditCurIn.addEventListener("input", calculateTotals);
  auditCurOut.addEventListener("input", calculateTotals);

  // -------------------------------------------------------------
  // DUPLICATE ENTRY PREVENTION
  // -------------------------------------------------------------
  async function isDuplicateEntry(machineNo, date) {
    const { data } = await supabase
      .from("audit_entries")
      .select("id")
      .eq("machine_no", machineNo)
      .eq("date", date)
      .eq("location_id", userLocationId)
      .limit(1);

    return data.length > 0;
  }

  // -------------------------------------------------------------
  // SAVE ENTRY
  // -------------------------------------------------------------
  auditSaveBtn.addEventListener("click", async () => {
    console.log("SAVE BUTTON LISTENER ATTACHED");

    if (!currentUser || !userLocationId) {
    auditStatus.textContent = "User not loaded yet. Please wait.";
    auditStatus.style.color = "red";
    return;
    }

    const machineNo = auditMachineNo.value.trim();
    const date = auditDate.value;

    if (!machineNo || !date) {
      auditStatus.textContent = "Enter Machine No and Date.";
      auditStatus.style.color = "red";
      return;
    }

    if (await isDuplicateEntry(machineNo, date)) {
      auditStatus.textContent = "This machine is already entered for this date.";
      auditStatus.style.color = "red";
      return;
    }

    const payload = {
      machine_no: machineNo,
      date: date,
      prev_in: Number(auditPrevIn.value || 0),
      prev_out: Number(auditPrevOut.value || 0),
      cur_in: Number(auditCurIn.value || 0),
      cur_out: Number(auditCurOut.value || 0),
      jackpot: Number(auditJackpot.value || 0),
      location_id: userLocationId,
      user_id: currentUser.id
    };

    const { error } = await supabase.from("audit_entries").insert(payload);

    if (error) {
      auditStatus.textContent = "Error saving audit.";
      auditStatus.style.color = "red";
      return;
    }

    auditStatus.textContent = "Audit saved successfully.";
    auditStatus.style.color = "lightgreen";

    loadAuditList();
  });

  // -------------------------------------------------------------
  // LOAD AUDIT LIST
  // -------------------------------------------------------------
  async function loadAuditList() {
    const date = auditListDate.value;
    if (!date) return;

    const { data } = await supabase
      .from("audit_entries")
      .select("*")
      .eq("location_id", userLocationId)
      .eq("date", date)
      .order("machine_no");

    const tbody = document.querySelector("#auditTable tbody");
    tbody.innerHTML = "";

    let totalIn = 0;
    let totalOut = 0;
    let totalNet = 0;

    data.forEach(row => {
      const tIn = row.cur_in - row.prev_in;
      const tOut = row.cur_out - row.prev_out;
      const net = tIn - tOut;

      totalIn += tIn;
      totalOut += tOut;
      totalNet += net;

      tbody.innerHTML += `
        <tr>
          <td>${row.machine_no}</td>
          <td>${row.cur_in}</td>
          <td>${row.cur_out}</td>
          <td>${row.jackpot}</td>
          <td>${tIn}</td>
          <td>${tOut}</td>
          <td>${net}</td>
        </tr>
      `;
    });

    machinesEnteredCount.value = data.length;
    document.getElementById("sumTotalIn").value = totalIn;
    document.getElementById("sumTotalOut").value = totalOut;
    document.getElementById("sumNet").value = totalNet;
  }

  auditListDate.addEventListener("change", loadAuditList);

});
