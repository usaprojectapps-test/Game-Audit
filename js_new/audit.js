// DOM ELEMENTS
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

// USER INFO
let currentUser = null;
let userLocationId = null;
let userRole = null;

async function loadUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user;
  userRole = currentUser.user_metadata.role;
  userLocationId = currentUser.user_metadata.location_id;
}
loadUser();

// AUTO-FILL PREVIOUS METERS
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

// CALCULATIONS
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

// SAVE AUDIT
document.getElementById("auditSaveBtn").addEventListener("click", async () => {
  const payload = {
    machine_no: auditMachineNo.value.trim(),
    date: auditDate.value,
    prev_in: Number(auditPrevIn.value || 0),
    prev_out: Number(auditPrevOut.value || 0),
    cur_in: Number(auditCurIn.value || 0),
    cur_out: Number(auditCurOut.value || 0),
    jackpot: Number(auditJackpot.value || 0),
    location_id: userLocationId,
    user_id: currentUser.id
  };

  await supabase.from("audit_entries").insert(payload);

  loadAuditList();
});

// LOAD AUDIT LIST
async function loadAuditList() {
  const date = document.getElementById("auditListDate").value;
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

  machinesEnteredCount.textContent = data.length;
}

document.getElementById("auditListDate").addEventListener("change", loadAuditList);
