// agentSilver.js
// Assumptions:
// - Global `supabase` client is available
// - QRious library is loaded
// - You have a main form with inputs:
//   #slipTypeRegular, #slipTypeBonus (radio)
//   #machineNo, #amount, #bonusType, #bonusAmount
//   #savePrintBtn
// - You have a table container #slipTableBody for listing slips

// ---------- CONFIG ----------

const AGENT_SILVER_TABLE = 'agent_silver';
const SLIP_TYPE = {
  REGULAR: 'regular',
  BONUS: 'bonus',
};
const REGULAR_PREFIX = 'AS';
const BONUS_PREFIX = 'BS';

// ---------- STATE ----------

let currentUser = null; // { id, name, role, location_id }
let currentLocation = null; // { id, name }
let currentSlip = null; // last saved slip for printing

// ---------- INIT ----------

async function initAgentSilver() {
  await loadCurrentUser();
  setupSlipTypeToggle();
  setupFormVisibility();
  setupSaveAndPrint();
  setupModal();
  await loadSlipsTable();
}

// Load user + location from your existing profile logic
async function loadCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  // Assuming you have a users table with name + location_id
  const { data: userRow } = await supabase
    .from('users')
    .select('id, full_name, role, location_id')
    .eq('id', user.id)
    .single();

  currentUser = {
    id: userRow.id,
    name: userRow.full_name,
    role: userRow.role,
    location_id: userRow.location_id,
  };

  // Load location (optional, for display)
  const { data: loc } = await supabase
    .from('locations')
    .select('id, name')
    .eq('id', currentUser.location_id)
    .single();

  currentLocation = loc;
}

// ---------- SLIP TYPE / FORM UI ----------

function setupSlipTypeToggle() {
  const regularRadio = document.getElementById('slipTypeRegular');
  const bonusRadio = document.getElementById('slipTypeBonus');

  if (!regularRadio || !bonusRadio) return;

  // SilverAgent: force Regular only
  if (currentUser.role === 'silveragent') {
    regularRadio.checked = true;
    regularRadio.disabled = false;
    bonusRadio.checked = false;
    bonusRadio.disabled = true;
  } else {
    regularRadio.disabled = false;
    bonusRadio.disabled = false;
  }

  regularRadio.addEventListener('change', setupFormVisibility);
  bonusRadio.addEventListener('change', setupFormVisibility);
}

function getSelectedSlipCategory() {
  const regularRadio = document.getElementById('slipTypeRegular');
  const bonusRadio = document.getElementById('slipTypeBonus');
  if (bonusRadio && bonusRadio.checked) return SLIP_TYPE.BONUS;
  return SLIP_TYPE.REGULAR;
}

function setupFormVisibility() {
  const category = getSelectedSlipCategory();

  const machineRow = document.getElementById('rowMachineNo');
  const amountRow = document.getElementById('rowAmount');
  const bonusTypeRow = document.getElementById('rowBonusType');
  const bonusAmountRow = document.getElementById('rowBonusAmount');

  if (category === SLIP_TYPE.REGULAR) {
    if (machineRow) machineRow.style.display = '';
    if (amountRow) amountRow.style.display = '';
    if (bonusTypeRow) bonusTypeRow.style.display = 'none';
    if (bonusAmountRow) bonusAmountRow.style.display = 'none';
  } else {
    if (machineRow) machineRow.style.display = 'none';
    if (amountRow) amountRow.style.display = 'none';
    if (bonusTypeRow) bonusTypeRow.style.display = '';
    if (bonusAmountRow) bonusAmountRow.style.display = '';
  }

  // SilverAgent: hide bonus fields always
  if (currentUser.role === 'silveragent') {
    if (bonusTypeRow) bonusTypeRow.style.display = 'none';
    if (bonusAmountRow) bonusAmountRow.style.display = 'none';
  }
}

// ---------- SLIP NUMBER GENERATION ----------

async function generateSlipNumber(category) {
  const prefix = category === SLIP_TYPE.BONUS ? BONUS_PREFIX : REGULAR_PREFIX;
  const timestamp = Date.now();

  // Daily serial per category + location
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const { data, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('location_id', currentUser.location_id)
    .eq('slip_category', category)
    .gte('datetime', `${todayStr} 00:00:00`)
    .lte('datetime', `${todayStr} 23:59:59`);

  if (error) {
    console.error('Error counting slips for serial:', error);
  }

  const count = data?.length ? data.length : (data === null ? 0 : 0);
  const serial = String(count + 1).padStart(3, '0');

  return `${prefix}-${timestamp}-${serial}`;
}

// ---------- SAVE & PRINT FLOW ----------

function setupSaveAndPrint() {
  const btn = document.getElementById('savePrintBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      const slip = await collectSlipFormData();
      const saved = await saveSlipToSupabase(slip);
      currentSlip = saved;
      showPrintModal(saved);
    } catch (err) {
      console.error(err);
      alert('Error saving slip. Check console.');
    } finally {
      btn.disabled = false;
    }
  });
}

async function collectSlipFormData() {
  const category = getSelectedSlipCategory();

  const machineInput = document.getElementById('machineNo');
  const amountInput = document.getElementById('amount');
  const bonusTypeInput = document.getElementById('bonusType');
  const bonusAmountInput = document.getElementById('bonusAmount');

  const now = new Date();
  const datetime = now.toISOString();

  const slip_no = await generateSlipNumber(category);

  let machine_no = null;
  let amount = 0.0;
  let bonus_type = null;
  let bonus_amount = 0.0;

  if (category === SLIP_TYPE.REGULAR) {
    machine_no = machineInput?.value?.trim() || null;
    amount = parseFloat(amountInput?.value || '0') || 0.0;
  } else {
    // BONUS slip
    bonus_type = bonusTypeInput?.value || null;
    bonus_amount = parseFloat(bonusAmountInput?.value || '0') || 0.0;
  }

  // SilverAgent cannot set bonus
  if (currentUser.role === 'silveragent') {
    bonus_type = null;
    bonus_amount = 0.0;
  }

  return {
    slip_no,
    slip_category: category,
    datetime,
    agent_id: currentUser.id,
    agent_name: currentUser.name,
    machine_no,
    amount,
    bonus_type,
    bonus_amount,
    location_id: currentUser.location_id,
    created_by: currentUser.id,
    is_paid: false,
  };
}

async function saveSlipToSupabase(slip) {
  const { data, error } = await supabase
    .from(AGENT_SILVER_TABLE)
    .insert(slip)
    .select('*')
    .single();

  if (error) throw error;
  await loadSlipsTable();
  return data;
}

// ---------- TABLE LISTING ----------

async function loadSlipsTable() {
  const tbody = document.getElementById('slipTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let query = supabase
    .from(AGENT_SILVER_TABLE)
    .select('*')
    .order('datetime', { ascending: false })
    .limit(100);

  // Role-based filtering (RLS already applies, this is just UI)
  if (currentUser.role === 'silveragent') {
    query = query.eq('created_by', currentUser.id);
  } else if (['manager', 'asstmanager', 'locationadmin', 'silver'].includes(currentUser.role)) {
    query = query.eq('location_id', currentUser.location_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading slips:', error);
    return;
  }

  data.forEach(row => {
    const tr = document.createElement('tr');

    const tdSlipNo = document.createElement('td');
    tdSlipNo.textContent = row.slip_no;

    const tdType = document.createElement('td');
    tdType.textContent = row.slip_category === SLIP_TYPE.BONUS ? 'Bonus' : 'Regular';

    const tdAgent = document.createElement('td');
    tdAgent.textContent = row.agent_name;

    const tdMachine = document.createElement('td');
    tdMachine.textContent = row.slip_category === SLIP_TYPE.REGULAR ? (row.machine_no || '') : '-';

    const tdAmount = document.createElement('td');
    tdAmount.textContent = row.slip_category === SLIP_TYPE.REGULAR ? row.amount.toFixed(2) : '-';

    const tdBonus = document.createElement('td');
    if (row.slip_category === SLIP_TYPE.BONUS) {
      tdBonus.textContent = `${row.bonus_type || ''} (${row.bonus_amount.toFixed(2)})`;
    } else if (row.bonus_amount && row.bonus_amount > 0) {
      tdBonus.textContent = `${row.bonus_type || ''} (+${row.bonus_amount.toFixed(2)})`;
    } else {
      tdBonus.textContent = '-';
    }

    const tdStatus = document.createElement('td');
    tdStatus.textContent = row.is_paid ? 'Paid' : 'Pending';

    const tdActions = document.createElement('td');
    const printBtn = document.createElement('button');
    printBtn.textContent = 'Print';
    printBtn.onclick = () => {
      currentSlip = row;
      showPrintModal(row);
    };
    tdActions.appendChild(printBtn);

    tr.appendChild(tdSlipNo);
    tr.appendChild(tdType);
    tr.appendChild(tdAgent);
    tr.appendChild(tdMachine);
    tr.appendChild(tdAmount);
    tr.appendChild(tdBonus);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// ---------- PRINT MODAL ----------

let printModal = null;
let printOverlay = null;

function setupModal() {
  // Overlay
  printOverlay = document.createElement('div');
  printOverlay.id = 'printOverlay';
  Object.assign(printOverlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.5)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9999',
  });

  // Modal
  printModal = document.createElement('div');
  printModal.id = 'printModal';
  Object.assign(printModal.style, {
    background: '#fff',
    padding: '15px',
    borderRadius: '8px',
    width: '320px',
    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
  });

  printModal.innerHTML = `
    <div class="slip-container" style="width:300px;border:1px solid #333;padding:15px;border-radius:8px;font-family:Arial,sans-serif;">
      <div class="slip-header" style="text-align:center;font-weight:bold;margin-bottom:10px;">Agent Silver Slip</div>
      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Slip ID:</span> <span id="modalSlipId"></span>
      </div>
      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Date/Time:</span> <span id="modalSlipDateTime"></span>
      </div>
      <div class="slip-row" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Agent:</span> <span id="modalSlipAgent"></span>
      </div>
      <div class="slip-row" id="modalRowMachine" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Machine:</span> <span id="modalSlipMachine"></span>
      </div>
      <div class="slip-row" id="modalRowAmount" style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Amount:</span> <span id="modalSlipAmount"></span>
      </div>
      <div class="slip-row" id="modalRowBonusType" style="display:none;justify-content:space-between;margin:4px 0;">
        <span>Bonus Type:</span> <span id="modalSlipBonusType"></span>
      </div>
      <div class="slip-row" id="modalRowBonusAmount" style="display:none;justify-content:space-between;margin:4px 0;">
        <span>Bonus Amount:</span> <span id="modalSlipBonusAmount"></span>
      </div>
      <div class="qr-box" style="text-align:center;margin-top:15px;">
        <canvas id="modalSlipQrCanvas" width="128" height="128"></canvas>
        <div style="font-size:12px;color:#666;">Scan to confirm payment</div>
      </div>
      <div class="footer" style="text-align:center;font-size:12px;margin-top:10px;border-top:1px dashed #999;padding-top:5px;">
        Game Audit System
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;">
        <button id="modalPrintBtn">Print</button>
        <button id="modalCloseBtn">Close</button>
      </div>
    </div>
  `;

  printOverlay.appendChild(printModal);
  document.body.appendChild(printOverlay);

  document.getElementById('modalCloseBtn').addEventListener('click', hidePrintModal);
  document.getElementById('modalPrintBtn').addEventListener('click', () => {
    window.print();
  });

  // Print CSS: only modal
  const style = document.createElement('style');
  style.innerHTML = `
    @media print {
      body * {
        visibility: hidden !important;
      }
      #printOverlay, #printOverlay * {
        visibility: visible !important;
      }
      #printOverlay {
        position: fixed;
        inset: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

function showPrintModal(slip) {
  if (!printOverlay || !printModal) return;

  const isBonus = slip.slip_category === SLIP_TYPE.BONUS;

  document.getElementById('modalSlipId').textContent = slip.slip_no;
  document.getElementById('modalSlipDateTime').textContent = new Date(slip.datetime).toLocaleString();
  document.getElementById('modalSlipAgent').textContent = slip.agent_name || '';

  const rowMachine = document.getElementById('modalRowMachine');
  const rowAmount = document.getElementById('modalRowAmount');
  const rowBonusType = document.getElementById('modalRowBonusType');
  const rowBonusAmount = document.getElementById('modalRowBonusAmount');

  if (isBonus) {
    if (rowMachine) rowMachine.style.display = 'none';
    if (rowAmount) rowAmount.style.display = 'none';
    if (rowBonusType) rowBonusType.style.display = '';
    if (rowBonusAmount) rowBonusAmount.style.display = '';

    document.getElementById('modalSlipMachine').textContent = '';
    document.getElementById('modalSlipAmount').textContent = '';
    document.getElementById('modalSlipBonusType').textContent = slip.bonus_type || '';
    document.getElementById('modalSlipBonusAmount').textContent = slip.bonus_amount?.toFixed(2) || '0.00';
  } else {
    if (rowMachine) rowMachine.style.display = '';
    if (rowAmount) rowAmount.style.display = '';
    if (rowBonusType) rowBonusType.style.display = slip.bonus_amount && slip.bonus_amount > 0 ? '' : 'none';
    if (rowBonusAmount) rowBonusAmount.style.display = slip.bonus_amount && slip.bonus_amount > 0 ? '' : 'none';

    document.getElementById('modalSlipMachine').textContent = slip.machine_no || '';
    document.getElementById('modalSlipAmount').textContent = slip.amount?.toFixed(2) || '0.00';
    document.getElementById('modalSlipBonusType').textContent = slip.bonus_type || '';
    document.getElementById('modalSlipBonusAmount').textContent = slip.bonus_amount?.toFixed(2) || '0.00';
  }

  // QR with slip_no (Silver will scan this)
  new QRious({
    element: document.getElementById('modalSlipQrCanvas'),
    size: 128,
    value: slip.slip_no,
  });

  printOverlay.style.display = 'flex';
}

function hidePrintModal() {
  if (printOverlay) {
    printOverlay.style.display = 'none';
  }
}

// ---------- START ----------

document.addEventListener('DOMContentLoaded', () => {
  initAgentSilver().catch(err => {
    console.error('Error initializing Agent Silver module:', err);
  });
});
