// moduleAccess.js
// Central wrapper used by all modules to apply permissions

import { canEdit } from "./permission.js";

/**
 * Applies module-level access rules to a form.
 *
 * @param {string} role - Logged-in user's role
 * @param {string} moduleName - Name of the module (e.g., "Users", "Vendors")
 * @param {HTMLElement} formElement - The form element to enable/disable
 * @param {string|null} selectedDate - Optional date for date-restricted roles
 */
export function applyModuleAccess(role, moduleName, formElement, selectedDate = null) {
  if (!formElement) return;

  const allowed = canEdit(role, moduleName, selectedDate);

  const inputs = formElement.querySelectorAll("input, select, textarea, button");

  inputs.forEach(el => {
    el.disabled = !allowed;
  });
}
