// -------------------------------------------------------------
// IMPORTS
// -------------------------------------------------------------
import { supabase } from "./supabaseClient.js";
import { showToast } from "./toast.js";

console.log("AUDIT JS LOADED");

// MAIN WRAPPER
window.addEventListener("auditModuleLoaded", () => {
  console.log("Audit module fully loaded");

  // -------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------
  function formatDate(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString();
  }

  function $id(id) {
    return document.getElementById(id) || null;
  }

  function ensureDomElements() {
    let tableBody = $id("audit-table-body");
    if (!tableBody) {
      const table = $id("auditTable");
      if (table) {
        tableBody = table.querySelector("tbody");
        if (tableBody) tableBody.id = "audit-table-body";
      }
    }

    let locationSelect = $id("audit-location-select");
    if (!locationSelect) {
      locationSelect = document.createElement("select");
      locationSelect.id = "audit-location-select";
      locationSelect.style.display = "none";
      const right = document.querySelector(".module-right") || document.body;
      right.appendChild(locationSelect);
    }

    let locationFilter = $id("audit-location-filter");
    if (!locationFilter) {
      locationFilter = document.createElement("select");
      locationFilter.id = "audit-location-filter";
      locationFilter.style.display = "none";
      const left = document.querySelector(".module-left") || document.body;
      left.insertBefore(locationFilter, left.firstChild);
    }

    return {
      tableBody,
      locationSelect,
      locationFilter
    };
  }

  // -------------------------------------------------------------
  // DOM ELEMENTS
  // -------------------------------------------------------------
  const searchInput = $id("audit-search-input");
  const prevPageBtn = $id("audit-prev-page");
  const nextPageBtn = $id("audit-next-page");
  const currentPageSpan = $id("audit-current-page");
  const refreshBtn = $id("audit-refresh-btn");

  const saveBtn = $id("auditSaveBtn") || $id("audit-save-btn");
  const deleteBtn = $id("audit-delete-btn");
  const resetBtn = $id("audit-reset-btn");

  const auditIdInput = $id("audit-id-input");
  const machineIdInput = $id("auditMachineNo") || $id("audit-machineid-input") || $id("auditMachineNo");
  const inspectorInput = $id("audit-inspector-input");
  const notesInput = $id("audit-notes-input");

  const { tableBody: dynamicTableBody, locationSelect: dynamicLocationSelect, locationFilter: dynamicLocationFilter } = ensureDomElements();

  const tableBody = dynamicTableBody;
  const locationSelect = dynamicLocationSelect;
  const locationFilter = dynamicLocationFilter;

  // -------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------
  let currentPage = 1;
  const pageSize = 20;
  let selectedAuditId = null;

  // -------------------------------------------------------------
  // USER LOADER
  // -------------------------------------------------------------
  async function loadUser() {
    try {
      if (!supabase || !supabase.auth) {
        console.error("Supabase client or auth is not available:", supabase);
        return null;
      }
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
      console.log("Audit: current user id:", user.id);
      return user;
    } catch (err) {
      console.error("Unexpected error in loadUser:", err);
      return null;
    }
  }

  // -------------------------------------------------------------
  // LOADERS
  // -------------------------------------------------------------
  async function loadLocations() {
    try {
      if (!locationSelect || !locationFilter) {
        console.error("loadLocations: missing DOM elements", {
          selectElExists: !!locationSelect,
          filterElExists: !!locationFilter
        });
        return;
      }

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
        const opt1 = document.createElement("option");
        opt1.value = loc.id;
        opt1.textContent = loc.name;
        locationSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = loc.id;
        opt2.textContent = loc.name;
        locationFilter.appendChild(opt2);
      });
    } catch (err) {
      console.error("Unexpected error in loadLocations:", err);
    }
  }

  async function loadAudits(reset = false) {
    try {
      if (reset) currentPage = 1;
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("audit")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      const search = searchInput?.value?.trim();
      const location = locationFilter?.value;

      if (search) query = query.ilike("machine_no", `%${search}%`);
      if (location) query = query.eq("location_id", location);

      const { data, error } = await query;

      if (error) {
        console.error("Audit load error:", error);
        return showToast("Failed to load audits", "error");
      }

      if (!tableBody) {
        console.warn("No table body found to render audits.");
        return;
      }

      tableBody.innerHTML = "";

      (data || []).forEach(row => {
        const tr = document.createElement("tr");
        tr.onclick = () => selectAudit(row);
        tr.innerHTML = `
          <td>${row.machine_no || "—"}</td>
          <td>${row.cur_in ?? "—"}</td>
          <td>${row.cur_out ?? "—"}</td>
          <td>${row.jackpot ?? "—"}</td>
          <td>${row.total_in ?? "—"}</td>
          <td>${row.total_out ?? "—"}</td>
          <td>${(row.total_in != null && row.total_out != null) ? (row.total_in - row.total_out) : "—"}</td>
        `;
        tableBody.appendChild(tr);
      });

      if (currentPageSpan) currentPageSpan.textContent = String(currentPage);
      if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
      if (nextPageBtn) nextPageBtn.disabled = (data || []).length < pageSize;
    } catch (err) {
      console.error("Unexpected error in loadAudits:", err);
    }
  }

  // -------------------------------------------------------------
  // FORM HANDLERS
  // -------------------------------------------------------------
  function selectAudit(audit) {
    selectedAuditId = audit.id;
    if (auditIdInput) auditIdInput.value = audit.id || "";
    if (machineIdInput) machineIdInput.value = audit.machine_no || "";
    if (inspectorInput) inspectorInput.value = audit.inspector || "";
    if (notesInput) notesInput.value = audit.notes || "";
    if (locationSelect) locationSelect.value = audit.location_id || "";
  }

  function resetForm() {
    selectedAuditId = null;
    if (auditIdInput) auditIdInput.value = "";
    if (machineIdInput) machineIdInput.value = "";
    if (inspectorInput) inspectorInput.value = "";
    if (notesInput) notesInput.value = "";
    if (locationSelect) locationSelect.value = "";
  }

  // -------------------------------------------------------------
  // SAVE / DELETE
  // -------------------------------------------------------------
  async function saveAudit() {
  try {
    const machine_no = (machineIdInput?.value || "").trim();
    const inspector = (inspectorInput?.value || "").trim();

    if (!machine_no || !inspector) {
      return showToast("Machine No and Inspector are required", "error");
    }

    const payload = {
      // do not set id for inserts; leave undefined for DB to generate
      machine_no,
      inspector,
      notes: (notesInput?.value || "").trim(),
      location_id: locationSelect?.value || null,
      created_at: new Date().toISOString()
    };

    console.log("Audit save payload:", payload);

    let result;
    if (selectedAuditId) {
      const updatePayload = {
        machine_no,
        inspector,
        notes: (notesInput?.value || "").trim(),
        location_id: locationSelect?.value || null
      };
      result = await supabase
        .from("audit")
        .update(updatePayload)
        .eq("id", selectedAuditId);
    } else {
      result = await supabase
        .from("audit")
        .insert(payload)
        .select(); // return inserted row(s)
    }

    console.log("Supabase result:", result);

    if (result.error) {
      console.error("Supabase returned error:", result.error);
      showToast("Save failed: " + (result.error.message || "unknown"), "error");
      return;
    }

    // If using .select() above, result.data should contain the inserted row
    console.log("Inserted/updated rows:", result.data);
    showToast(selectedAuditId ? "Audit updated" : "Audit added", "success");

    await loadAudits(true);
    resetForm();
  } catch (err) {
    console.error("Unexpected error in saveAudit:", err);
    showToast("Save failed", "error");
  }
}

  async function deleteAudit() {
    try {
      if (!selectedAuditId) return showToast("No audit selected", "error");

      const { error } = await supabase
        .from("audit")
        .delete()
        .eq("id", selectedAuditId);

      if (error) {
        console.error("Audit delete error:", error);
        return showToast("Delete failed", "error");
      }

      showToast("Audit deleted", "success");
      await loadAudits(true);
      resetForm();
    } catch (err) {
      console.error("Unexpected error in deleteAudit:", err);
      showToast("Delete failed", "error");
    }
  }

  // -------------------------------------------------------------
  // EVENTS
  // -------------------------------------------------------------
  if (searchInput) searchInput.addEventListener("input", () => loadAudits(true));
  if (locationFilter) locationFilter.addEventListener("change", () => loadAudits(true));
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAudits(true));

  if (prevPageBtn) prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadAudits();
    }
  });

  if (nextPageBtn) nextPageBtn.addEventListener("click", () => {
    currentPage++;
    loadAudits();
  });

  if (saveBtn) saveBtn.addEventListener("click", saveAudit);
  if (deleteBtn) deleteBtn.addEventListener("click", deleteAudit);
  if (resetBtn) resetBtn.addEventListener("click", resetForm);

  // -------------------------------------------------------------
  // INITIAL LOAD
  // -------------------------------------------------------------
  (async () => {
    await loadLocations();
    await loadAudits(true);
    await loadUser();
  })();

}); // end wrapper
