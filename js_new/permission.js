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
// PERMISSION CHECKS
// -------------------------------------------------------------
export function canEdit(department) {
  // Admin & Owner → full access
  if (department === "Admin" || department === "Owner") {
    return true;
  }

  // Manager → view only
  if (department === "Manager") {
    return false;
  }

  // All others → edit only today + yesterday
  return true;
}

export function isDateAllowed(department, selectedDate) {
  // Admin & Owner → full access
  if (department === "Admin" || department === "Owner") {
    return true;
  }

  // Manager → view only (no editing)
  if (department === "Manager") {
    return false;
  }

  // Others → only today + yesterday
  const today = getToday();
  const yesterday = getYesterday();

  return selectedDate === today || selectedDate === yesterday;
}

// -------------------------------------------------------------
// FORM CONTROL HELPERS
// -------------------------------------------------------------
export function disableForm(formElement) {
  if (!formElement) return;
  const inputs = formElement.querySelectorAll("input, select, textarea, button");
  inputs.forEach(el => el.disabled = true);
}

export function enableForm(formElement) {
  if (!formElement) return;
  const inputs = formElement.querySelectorAll("input, select, textarea, button");
  inputs.forEach(el => el.disabled = false);
}

// -------------------------------------------------------------
// APPLY PERMISSIONS TO ANY MODULE
// -------------------------------------------------------------
export function applyModulePermissions(department, formElement, selectedDate = null) {
  // Admin & Owner → full access
  if (department === "Admin" || department === "Owner") {
    enableForm(formElement);
    return;
  }

  // Manager → view only
  if (department === "Manager") {
    disableForm(formElement);
    return;
  }

  // Others → date‑restricted editing
  if (selectedDate && !isDateAllowed(department, selectedDate)) {
    disableForm(formElement);
  } else {
    enableForm(formElement);
  }
}
