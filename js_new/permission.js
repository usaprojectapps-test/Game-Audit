// -------------------------------------------------------------
// DATE HELPERS
// -------------------------------------------------------------
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function getToday() {
  return formatDate(new Date());
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// -------------------------------------------------------------
// ROLE GROUPS
// -------------------------------------------------------------
const FULL_ACCESS_ROLES = ["SuperAdmin", "LocationAdmin"];

const DATE_RESTRICTED_ROLES = ["Audit", "MSP", "Silver", "SilverAgent"];

const MANAGER_EDIT_MODULES = ["Vendors", "Machines", "Users", "SilverPurchase"];

// -------------------------------------------------------------
// CORE PERMISSION CHECKS
// -------------------------------------------------------------
export function canEdit(role, moduleName, selectedDate = null) {
  // SuperAdmin & LocationAdmin → full access
  if (FULL_ACCESS_ROLES.includes(role)) {
    return true;
  }

  // Manager → special rules
  if (role === "Manager") {
    return MANAGER_EDIT_MODULES.includes(moduleName);
  }

  // Date‑restricted roles → only today + yesterday
  if (DATE_RESTRICTED_ROLES.includes(role)) {
    if (!selectedDate) return false;
    const today = getToday();
    const yesterday = getYesterday();
    return selectedDate === today || selectedDate === yesterday;
  }

  // Default fallback → no edit
  return false;
}

export function canView(role, moduleName) {
  // Everyone can view everything unless restricted later
  return true;
}

// -------------------------------------------------------------
// FORM CONTROL HELPERS
// -------------------------------------------------------------
export function disableForm(formElement) {
  if (!formElement) return;
  const inputs = formElement.querySelectorAll("input, select, textarea, button");
  inputs.forEach(el => (el.disabled = true));
}

export function enableForm(formElement) {
  if (!formElement) return;
  const inputs = formElement.querySelectorAll("input, select, textarea, button");
  inputs.forEach(el => (el.disabled = false));
}

// -------------------------------------------------------------
// APPLY PERMISSIONS TO ANY MODULE
// -------------------------------------------------------------
export function applyModulePermissions(role, moduleName, formElement, selectedDate = null) {
  const allowed = canEdit(role, moduleName, selectedDate);

  if (allowed) {
    enableForm(formElement);
  } else {
    disableForm(formElement);
  }
}
