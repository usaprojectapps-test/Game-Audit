import { ROLES } from "./roles.js";

export function applyDashboardVisibility(role) {
  const tiles = {
    locations: document.getElementById("tile-locations"),
    vendors: document.getElementById("tile-vendors"),
    machines: document.getElementById("tile-machines"),
    users: document.getElementById("tile-users"),
    audit: document.getElementById("tile-audit"),
    msp: document.getElementById("tile-msp"),
    silver: document.getElementById("tile-silver"),
    silverAgent: document.getElementById("tile-silverAgent"),
    silverPurchase: document.getElementById("tile-silverPurchase")
  };

  // Hide all tiles first
  Object.values(tiles).forEach(t => t.style.display = "none");

  // SuperAdmin → all tiles
  if (role === ROLES.SUPER_ADMIN) {
    Object.values(tiles).forEach(t => t.style.display = "block");
    return;
  }

  // LocationAdmin → all except Locations
  if (role === ROLES.LOCATION_ADMIN) {
    Object.values(tiles).forEach(t => t.style.display = "block");
    tiles.locations.style.display = "none";
    return;
  }

  // Manager → all tiles
  if (role === ROLES.MANAGER) {
    Object.values(tiles).forEach(t => t.style.display = "block");
    return;
  }

  // Audit
  if (role === ROLES.AUDIT) {
    tiles.audit.style.display = "block";
    tiles.vendors.style.display = "block";
    tiles.machines.style.display = "block";
    return;
  }

  // MSP
  if (role === ROLES.MSP) {
    tiles.msp.style.display = "block";
    return;
  }

  // Silver
  if (role === ROLES.SILVER) {
    tiles.silver.style.display = "block";
    tiles.silverPurchase.style.display = "block";
    return;
  }

  // SilverAgent
  if (role === ROLES.SILVER_AGENT) {
    tiles.silverAgent.style.display = "block";
    return;
  }
}
