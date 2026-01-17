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
const auditStatus = document.getElementById("auditStatus");
const auditSaveBtn = document.getElementById("auditSaveBtn");

// -------------------------------------------------------------
// GET LOGGED-IN USER + LOCATION
// -------------------------------------------------------------
let currentUser = null;
let userLocationId = null;
let userRole = null;

async function loadUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return;

  currentUser = data.user;
  userRole = currentUser.user_metadata.role;
  userLocationId = currentUser.user_metadata.location_id;
}

loadUser();

// -------------------------------------------------------------
// AUTO-FILL PREVIOUS METERS
// -------------------------------------------------------------
async function loadPreviousAudit() {
  const machineNo = auditMachineNo.value.trim();
  const date = auditDate.value;

  if (!machineNo || !date) return;

  const { data, error } = await supabase
    .from("audit_entries")
    .select("*")
    .eq("machine_no", machineNo)
    .eq("location_id", userLocationId)
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1);

  if (error) {
    auditStatus.textContent = "Error loading previous audit";
    auditStatus.style.color = "red";
    return;
  }

  if (data.length === 0) {
    auditPrevIn.value = "";
    auditPrevOut.value = "";
    auditStatus.textContent = "No previous audit found";
    auditStatus.style.color = "orange";
    return;
  }

  const prev = data[0];
  auditPrevIn.value = prev.cur_in;
  auditPrevOut.value = prev.cur_out;

  auditStatus.textContent = "Previous audit loaded";
  auditStatus.style.color = "green";
}

auditMachineNo.addEventListener("change", loadPreviousAudit);
auditDate.addEventListener("change", loadPreviousAudit);

// -------------------------------------------------------------
// VALIDATE DATE (Audit user can edit only today/yesterday)
// -------------------------------------------------------------
function canEditSelectedDate(dateStr) {
  const selected = new Date(dateStr);
  const today = new Date();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  selected.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);

  return selected.getTime() === today.getTime() ||
         selected.getTime() === yesterday.getTime();
}

// -------------------------------------------------------------
// SAVE AUDIT ENTRY
// -------------------------------------------------------------
auditSaveBtn.addEventListener("click", async () => {
  const machineNo = auditMachineNo.value.trim();
  const date = auditDate.value;

  if (!machineNo || !date) {
    auditStatus.textContent = "Machine No and Date are required";
    auditStatus.style.color = "red";
    return;
  }

  // Role-based restrictions
  if (userRole === "Manager") {
    auditStatus.textContent = "Managers cannot create or edit audits";
    auditStatus.style.color = "red";
    return;
  }

  if (userRole === "Audit" && !canEditSelectedDate(date)) {
    auditStatus.textContent = "Audit User can edit only today or yesterday";
    auditStatus.style.color = "red";
    return;
  }

  const payload = {
    machine_no: machineNo,
    date,
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
    auditStatus.textContent = "Failed to save audit";
    auditStatus.style.color = "red";
    return;
  }

  auditStatus.textContent = "Audit saved successfully";
  auditStatus.style.color = "green";

  auditCurIn.value = "";
  auditCurOut.value = "";
  auditJackpot.value = "";

  loadAuditList();
});

// -------------------------------------------------------------
// LOAD AUDIT LIST (LEFT TABLE)
// -------------------------------------------------------------
async function loadAuditList() {
  const date = document.getElementById("auditListDate").value;
  if (!date) return;

  const { data, error } = await supabase
    .from("audit_entries")
    .select("*")
    .eq("location_id", userLocationId)
    .eq("date", date)
    .order("machine_no", { ascending: true });

  const tbody = document.querySelector("#auditTable tbody");
  tbody.innerHTML = "";

  if (error || !data.length) {
    tbody.innerHTML = `<tr><td colspan="4">No entries</td></tr>`;
    return;
  }

  data.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${row.machine_no}</td>
        <td>${row.cur_in}</td>
        <td>${row.cur_out}</td>
        <td>${row.jackpot}</td>
      </tr>
    `;
  });
}

document.getElementById("auditListDate").addEventListener("change", loadAuditList);
