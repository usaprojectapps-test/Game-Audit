// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

console.log("AUDIT JS LOADED");

// MAIN WRAPPER
window.addEventListener("auditModuleLoaded", () => {
  console.log("Audit module fully loaded");

  // Ensure supabase is available
console.log("supabase available:", !!supabase, "supabase.auth:", !!(supabase && supabase.auth));

async function loadUser() {
  try {
    if (!supabase || !supabase.auth) {
      console.error("Supabase client or auth is not available:", supabase);
      return null;
    }

    // Use getSession for broad compatibility
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Error getting session:", sessionError);
      return null;
    }

    const user = sessionData?.session?.user || null;
    if (!user) {
      console.warn("No active user session found.");
      return null;
    }

    // Return the user object for callers
    return user;
  } catch (err) {
    console.error("Unexpected error in loadUser:", err);
    return null;
  }
}

  // -------------------------------------------------------------
  // DOM ELEMENTS
  // -------------------------------------------------------------
  const searchInput = document.getElementById("audit-search-input");
  const locationFilter = document.getElementById("audit-location-filter");
  const tableBody = document.getElementById("audit-table-body");
  const prevPageBtn = document.getElementById("audit-prev-page");
  const nextPageBtn = document.getElementById("audit-next-page");
  const currentPageSpan = document.getElementById("audit-current-page");
  const refreshBtn = document.getElementById("audit-refresh-btn");

  const saveBtn = document.getElementById("audit-save-btn");
  const deleteBtn = document.getElementById("audit-delete-btn");
  const resetBtn = document.getElementById("audit-reset-btn");

  // form fields (example)
  const auditIdInput = document.getElementById("audit-id-input");
  const machineIdInput = document.getElementById("audit-machineid-input");
  const inspectorInput = document.getElementById("audit-inspector-input");
  const notesInput = document.getElementById("audit-notes-input");
  const locationSelect = document.getElementById("audit-location-select");

  // -------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------
  let currentPage = 1;
  const pageSize = 20;
  let selectedAuditId = null;

  // -------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------
  function formatDate(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString();
  }

  // -------------------------------------------------------------
  // LOADERS
  // ------------------------------------------------------------- 
  async function loadLocations() {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("Audit: loadLocations error", error);
      return showToast("Failed to load locations", "error");
    }

    locationSelect.innerHTML = `<option value="">Select location</option>`;
    locationFilter.innerHTML = `<option value="">All locations</option>`;

    (data || []).forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc.id;
      opt.textContent = loc.name;
      locationSelect.appendChild(opt);

      const opt2 = document.createElement("option");
      opt2.value = loc.id;
      opt2.textContent = loc.name;
      locationFilter.appendChild(opt2);
    });
  }

  async function loadAudits(reset = false) {
    if (reset) currentPage = 1;
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("audits")
      .select("*")
      .order("createdat", { ascending: false })
      .range(from, to);

    const search = searchInput?.value?.trim();
    const location = locationFilter?.value;

    if (search) query = query.ilike("machineid", `%${search}%`);
    if (location) query = query.eq("location_id", location);

    const { data, error } = await query;

    if (error) {
      console.error("Audit load error:", error);
      return showToast("Failed to load audits", "error");
    }

    tableBody.innerHTML = "";
    (data || []).forEach(row => {
      const tr = document.createElement("tr");
      tr.onclick = () => selectAudit(row);
      tr.innerHTML = `
        <td>${row.auditid || "—"}</td>
        <td>${row.machineid || "—"}</td>
        <td>${row.inspector || "—"}</td>
        <td>${formatDate(row.createdat)}</td>
        <td>${(row.notes || "").slice(0, 80)}</td>
      `;
      tableBody.appendChild(tr);
    });

    currentPageSpan.textContent = String(currentPage);
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = (data || []).length < pageSize;
  }

  // -------------------------------------------------------------
  // FORM HANDLERS
  // -------------------------------------------------------------
  function selectAudit(audit) {
    selectedAuditId = audit.auditid;
    auditIdInput.value = audit.auditid || "";
    machineIdInput.value = audit.machineid || "";
    inspectorInput.value = audit.inspector || "";
    notesInput.value = audit.notes || "";
    locationSelect.value = audit.location_id || "";
  }

  function resetForm() {
    selectedAuditId = null;
    auditIdInput.value = "";
    machineIdInput.value = "";
    inspectorInput.value = "";
    notesInput.value = "";
    locationSelect.value = "";
  }

  // -------------------------------------------------------------
  // SAVE / DELETE
  // -------------------------------------------------------------
  async function saveAudit() {
    const machineid = machineIdInput.value.trim();
    const inspector = inspectorInput.value.trim();

    if (!machineid || !inspector) {
      return showToast("Machine ID and Inspector are required", "error");
    }

    const payload = {
      auditid: auditIdInput.value.trim() || undefined,
      machineid,
      inspector,
      notes: notesInput.value.trim(),
      location_id: locationSelect.value || null,
      updatedat: Date.now(),
    };

    if (selectedAuditId) {
      const { error } = await supabase
        .from("audits")
        .update(payload)
        .eq("auditid", selectedAuditId);

      if (error) {
        console.error("Audit update error:", error);
        return showToast("Update failed", "error");
      }
      showToast("Audit updated", "success");
    } else {
      payload.createdat = Date.now();
      const { error } = await supabase.from("audits").insert(payload);
      if (error) {
        console.error("Audit insert error:", error);
        return showToast("Insert failed", "error");
      }
      showToast("Audit added", "success");
    }

    await loadAudits(true);
    resetForm();
  }

  async function deleteAudit() {
    if (!selectedAuditId) return showToast("No audit selected", "error");

    const { error } = await supabase
      .from("audits")
      .delete()
      .eq("auditid", selectedAuditId);

    if (error) {
      console.error("Audit delete error:", error);
      return showToast("Delete failed", "error");
    }

    showToast("Audit deleted", "success");
    await loadAudits(true);
    resetForm();
  }

  // -------------------------------------------------------------
  // EVENTS
  // -------------------------------------------------------------
  searchInput?.addEventListener("input", () => loadAudits(true));
  locationFilter?.addEventListener("change", () => loadAudits(true));
  refreshBtn?.addEventListener("click", () => loadAudits(true));

  prevPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadAudits();
    }
  });

  nextPageBtn?.addEventListener("click", () => {
    currentPage++;
    loadAudits();
  });

  saveBtn?.addEventListener("click", saveAudit);
  deleteBtn?.addEventListener("click", deleteAudit);
  resetBtn?.addEventListener("click", resetForm);

  // -------------------------------------------------------------
  // INITIAL LOAD
  // -------------------------------------------------------------
  (async () => {
    await loadLocations();
    await loadAudits(true);
  })();

}); // end wrapper
