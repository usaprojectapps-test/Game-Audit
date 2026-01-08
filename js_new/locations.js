import { supabase } from "/js_new/supabaseClient.js";

const searchInput = document.getElementById("searchLocation");
const tableBody = document.getElementById("locationTableBody");

const codeInput = document.getElementById("locationCode");
const nameInput = document.getElementById("locationName");
const addressInput = document.getElementById("locationAddress");
const cityInput = document.getElementById("locationCity");
const stateInput = document.getElementById("locationState");
const countryInput = document.getElementById("locationCountry");
const contactPersonInput = document.getElementById("locationContactPerson");
const contactPhoneInput = document.getElementById("locationContactPhone");

const saveBtn = document.getElementById("saveLocation");
const deleteBtn = document.getElementById("deleteLocation");

let currentLocationId = null;

// AUTO-CODE GENERATOR
async function generateLocationCode() {
  const country = countryInput.value.trim().toUpperCase().slice(0, 3);
  const city = cityInput.value.trim().toUpperCase().slice(0, 3);

  if (!country || !city) return;

  const prefix = `${country}-${city}-`;

  const { data, error } = await supabase
    .from("locations")
    .select("code")
    .ilike("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(1);

  let nextNumber = 1;

  if (data && data.length > 0) {
    const lastCode = data[0].code;
    const lastNum = parseInt(lastCode.split("-")[2]);
    nextNumber = lastNum + 1;
  }

  const padded = String(nextNumber).padStart(3, "0");
  codeInput.value = `${prefix}${padded}`;
}

// Trigger auto-code when country or city changes
countryInput.addEventListener("input", generateLocationCode);
cityInput.addEventListener("input", generateLocationCode);

// LOAD LOCATIONS
async function loadLocations() {
  tableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;

  let query = supabase.from("locations").select("*");

  const search = searchInput.value.trim();
  if (search) {
    query = query.or(
      `code.ilike.%${search}%,name.ilike.%${search}%,city.ilike.%${search}%`
    );
  }

  const { data, error } = await query.order("code", { ascending: true });

  if (error) {
    tableBody.innerHTML = `<tr><td colspan="4">Failed to load.</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";

  data.forEach(loc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${loc.code}</td>
      <td>${loc.name}</td>
      <td>${loc.city}</td>
      <td>${loc.state}</td>
    `;
    tr.addEventListener("click", () => fillForm(loc));
    tableBody.appendChild(tr);
  });
}

// FILL FORM
function fillForm(loc) {
  currentLocationId = loc.id;

  codeInput.value = loc.code;
  nameInput.value = loc.name;
  addressInput.value = loc.address;
  cityInput.value = loc.city;
  stateInput.value = loc.state;
  countryInput.value = loc.country;
  contactPersonInput.value = loc.contact_person;
  contactPhoneInput.value = loc.contact_phone;
}

// CLEAR FORM
function clearForm() {
  currentLocationId = null;
  codeInput.value = "";
  nameInput.value = "";
  addressInput.value = "";
  cityInput.value = "";
  stateInput.value = "";
  countryInput.value = "";
  contactPersonInput.value = "";
  contactPhoneInput.value = "";
}

// SAVE LOCATION
saveBtn.addEventListener("click", async () => {
  const payload = {
    code: codeInput.value.trim(),
    name: nameInput.value.trim(),
    address: addressInput.value.trim(),
    city: cityInput.value.trim(),
    state: stateInput.value.trim(),
    country: countryInput.value.trim(),
    contact_person: contactPersonInput.value.trim(),
    contact_phone: contactPhoneInput.value.trim()
  };

  if (!payload.code || !payload.name) {
    alert("Code and Name are required.");
    return;
  }

  if (currentLocationId) {
    await supabase.from("locations").update(payload).eq("id", currentLocationId);
    alert("Location updated.");
  } else {
    await supabase.from("locations").insert(payload);
    alert("Location created.");
  }

  clearForm();
  loadLocations();
});

// DELETE LOCATION
deleteBtn.addEventListener("click", async () => {
  if (!currentLocationId) {
    alert("Select a location first.");
    return;
  }

  if (!confirm("Delete this location?")) return;

  await supabase.from("locations").delete().eq("id", currentLocationId);

  alert("Location deleted.");
  clearForm();
  loadLocations();
});

searchInput.addEventListener("input", loadLocations);

loadLocations();
