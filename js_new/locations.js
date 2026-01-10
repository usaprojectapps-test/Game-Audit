import { supabase } from "./supabaseClient.js";
import { getLocationFilter } from "./dashboard.js";
import { ROLES } from "./roles.js";
import { showToast } from "/js_new/toast.js"; // ⭐ REQUIRED

// -------------------------------------------------------------
// DOM ELEMENTS
// -------------------------------------------------------------
const tableBody = document.getElementById("locationsTableBody");
const searchInput = document.getElementById("searchLocation");

const form = document.getElementById("locationForm");
const codeInput = document.getElementById("locCode");
const nameInput = document.getElementById("locName");
const addressInput = document.getElementById("locAddress");
const cityInput = document.getElementById("locCity");
const stateInput = document.getElementById("locState");
const countryInput = document.getElementById("locCountry");
const contactPersonInput = document.getElementById("locContactPerson");
const contactPhoneInput = document.getElementById("locContactPhone");

const btnSave = document.getElementById("saveLocation");
const btnDelete = document.getElementById("deleteLocation");
const btnClear = document.getElementById("clearLocation");

let selectedId = null;

// -------------------------------------------------------------
// INITIAL LOAD
// -------------------------------------------------------------
loadLocations();

// -------------------------------------------------------------
// LOAD LOCATIONS
// -------------------------------------------------------------
async function loadLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    console.error("Load error:", error);
    showToast("Failed to load locations.", "error");
    return;
  }

  renderTable(data);
}

// -------------------------------------------------------------
// RENDER TABLE
// -------------------------------------------------------------
function renderTable(rows) {
  tableBody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.code || ""}</td>
      <td>${row.name || ""}</td>
      <td>${row.city || ""}</td>
      <td>${row.state || ""}</td>
      <td>${row.country || ""}</td>
    `;

    tr.addEventListener("click", () => loadForm(row));
    tableBody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// LOAD FORM WITH SELECTED ROW
// -------------------------------------------------------------
function loadForm(row) {
  selectedId = row.id;

  codeInput.value = row.code || "";
  nameInput.value = row.name || "";
  addressInput.value = row.address || "";
  cityInput.value = row.city || "";
  stateInput.value = row.state || "";
  countryInput.value = row.country || "";
  contactPersonInput.value = row.contact_person || "";
  contactPhoneInput.value = row.contact_phone || "";
}

// -------------------------------------------------------------
// CLEAR FORM
// -------------------------------------------------------------
btnClear.addEventListener("click", () => {
  selectedId = null;
  form.reset();
});

// -------------------------------------------------------------
// AUTO‑GENERATE LOCATION CODE
// -------------------------------------------------------------
async function generateLocationCode(city, country) {
  if (!city || !country) return "";

  const cityCode = city.substring(0, 3).toUpperCase();
  const countryCode = country.substring(0, 3).toUpperCase();
  const prefix = `${countryCode}-${cityCode}`;

  const { data } = await supabase
    .from("locations")
    .select("code")
    .like("code", `${prefix}-%`);

  const next = (data?.length || 0) + 1;
  const padded = String(next).padStart(3, "0");

  return `${prefix}-${padded}`;
}

// -------------------------------------------------------------
// SAVE LOCATION (INSERT OR UPDATE)
// -------------------------------------------------------------
btnSave.addEventListener("click", async () => {
  const city = cityInput.value.trim();
  const country = countryInput.value.trim();

  let code = codeInput.value.trim();

  if (!selectedId && !code) {
    code = await generateLocationCode(city, country);
  }

  const payload = {
    code: code || null,
    name: nameInput.value.trim() || null,
    address: addressInput.value.trim() || null,
    city: city || null,
    state: stateInput.value.trim() || null,
    country: country || null,
    contact_person: contactPersonInput.value.trim() || null,
    contact_phone: contactPhoneInput.value.trim() || null
  };

  let result;

  if (selectedId) {
    result = await supabase
      .from("locations")
      .update(payload)
      .eq("id", selectedId);
  } else {
    result = await supabase
      .from("locations")
      .insert(payload);
  }

  if (result.error) {
    console.error("Save error:", result.error);
    showToast("Failed to save location.", "error");
    return;
  }

  showToast("Location saved successfully.", "success");
  form.reset();
  selectedId = null;
  await loadLocations(); // refresh table immediately
});

// -------------------------------------------------------------
// DELETE LOCATION
// -------------------------------------------------------------
btnDelete.addEventListener("click", async () => {
  if (!selectedId) {
    showToast("Select a location first.", "warning");
    return;
  }

  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", selectedId);

  if (error) {
    console.error("Delete error:", error);
    showToast("Failed to delete location.", "error");
    return;
  }

  showToast("Location deleted.", "success");
  form.reset();
  selectedId = null;
  await loadLocations(); // refresh table
});

// -------------------------------------------------------------
// SEARCH
// -------------------------------------------------------------
searchInput.addEventListener("input", async () => {
  const term = searchInput.value.toLowerCase();

  const { data } = await supabase
    .from("locations")
    .select("*");

  const filtered = data.filter(row =>
    (row.code || "").toLowerCase().includes(term) ||
    (row.name || "").toLowerCase().includes(term) ||
    (row.city || "").toLowerCase().includes(term)
  );

  renderTable(filtered);
});
