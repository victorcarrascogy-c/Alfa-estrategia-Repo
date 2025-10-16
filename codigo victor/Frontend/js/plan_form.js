// Initializes and wires up the Strategic Plan creation form.
// Responsibilities:
// - Read authenticated token (if any) to call the API
// - Populate the "dimension" <select> from the backend
// - Force the school field to a fixed value
// - Auto-calculate the Resources "total" when any amount changes
// - On submit: create a Plan; if resources were filled, also create Resources for that Plan
export function initPlanForm() {
  const API = "http://127.0.0.1:8000";
  const SCHOOL = "Liceo La Asuncion de Talcahuano";

  // Returns Authorization header if a JWT is present in localStorage.
  const authHeaders = () => {
    const t = localStorage.getItem("token");
    return t ? { Authorization: "Bearer " + t } : {};
  };

  // Cache the main form and message area.
  const $form = document.getElementById("planForm");
  const $msg = document.getElementById("plansMsg");

  // Force a single school value in the UI (works for <select> or <input>).
  const schoolEl = document.getElementById("p_school");
  if (schoolEl) {
    if (schoolEl.tagName === "SELECT") {
      schoolEl.innerHTML = `<option value="${SCHOOL}">${SCHOOL}</option>`;
      schoolEl.disabled = false;
    } else {
      schoolEl.value = SCHOOL;
      schoolEl.readOnly = true;
    }
  }
  if (!$form) return; // If the form is not on the page, we stop.

  // === DIMENSIONS DROPDOWN ===================================================
  // Loads "dimensions" from the backend and fills the <select id="p_dimension">.
  (async () => {
    const sel = document.getElementById("p_dimension");
    if (!sel) return;
    sel.innerHTML = '<option value="">Cargando…</option>';
    try {
      const r = await fetch(`${API}/plans/dimensions`, { headers: { ...authHeaders() } });
      const arr = await r.json();
      sel.innerHTML = '<option value="">Seleccione…</option>' +
        arr.map(d => `<option value="${d}">${d.replaceAll("_", " ")}</option>`).join("");
    } catch {
      sel.innerHTML = '<option value="">Error al cargar</option>';
    }
  })();

  // === RESOURCES HELPERS =====================================================
  // The form has multiple numeric fields for resources; we compute a running total.
  const $rTotal = document.getElementById('r_total');

  // Safely parse a whole-number value from an input by ID (non-digits ignored).
  const num = (id) => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const n = parseInt((el.value || '0').replace(/\D+/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  // Get trimmed text from an input by ID.
  const txt = (id) => (document.getElementById(id)?.value || '').trim();

  // Attach input listeners to all amount fields so the total updates automatically.
  function setUpAutoTotal() {
    const ids = [
      'r_subv_gen', 'r_sep', 'r_pie', 'r_eib', 'r_mant', 'r_proret',
      'r_internado', 'r_reforz', 'r_faep', 'r_aporte_mun'
    ];
    if (!$rTotal) return;
    const calc = () => {
      const t = ids.reduce((s, id) => s + num(id), 0);
      $rTotal.value = t;
    };
    ids.forEach(id => document.getElementById(id)?.addEventListener('input', calc));
    calc(); // initial compute
  }
  if ($rTotal) setUpAutoTotal();

  // Build the optional "resources" payload from the form if at least one field is filled.
  function collectResourcePayload() {
    if (!$rTotal) return null; // No resources section in the DOM → skip.

    const payload = {
      recursos_necesarios: txt('r_need'),
      ate: txt('r_ate'),
      tic: txt('r_tic'),
      planes: txt('r_planes'),
      medios_verificacion: txt('r_medios'),
      monto_subvencion_general: num('r_subv_gen'),
      monto_sep: num('r_sep'),
      monto_pie: num('r_pie'),
      monto_eib: num('r_eib'),
      monto_mantenimiento: num('r_mant'),
      monto_pro_retencion: num('r_proret'),
      monto_internado: num('r_internado'),
      monto_reforzamiento: num('r_reforz'),
      monto_faep: num('r_faep'),
      monto_aporte_municipal: num('r_aporte_mun'),
      monto_total: num('r_total'),
    };

    // Detect whether any field was actually provided (to avoid creating empty resources).
    const anyText =
      payload.recursos_necesarios || payload.ate || payload.tic ||
      payload.planes || payload.medios_verificacion;
    const anyMonto =
      payload.monto_subvencion_general || payload.monto_sep || payload.monto_pie ||
      payload.monto_eib || payload.monto_mantenimiento || payload.monto_pro_retencion ||
      payload.monto_internado || payload.monto_reforzamiento || payload.monto_faep ||
      payload.monto_aporte_municipal;

    return (anyText || anyMonto) ? payload : null;
  }

  // === SUBMIT HANDLER ========================================================
  // On submit:
  // 1) Validate required fields
  // 2) Create the Plan
  // 3) If resources were provided, create the Plan's resources
  // 4) Show outcome and reset the form
  $form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($msg) { $msg.textContent = ""; $msg.className = "msg"; }

    // Build the plan payload (these field names match backend expectations).
    const payload = {
      dimension: document.getElementById("p_dimension")?.value || "",
      colegio: SCHOOL,
      objetivo_estrategico: document.getElementById("p_obj")?.value.trim() || "",
      estrategia: document.getElementById("p_strategy")?.value.trim() || "",
      subdimension: document.getElementById("p_sub")?.value.trim() || "",
      accion: document.getElementById("p_action")?.value.trim() || "",
      descripcion: document.getElementById("p_desc")?.value.trim() || "",
      fecha_inicio: document.getElementById("p_start")?.value || "",
      fecha_termino: document.getElementById("p_end")?.value || "",
      programa_asociado: document.getElementById("p_program")?.value.trim() || "",
      responsable: document.getElementById("p_resp")?.value.trim() || "",
    };

    // Basic required-field validation before hitting the API.
    const faltan = [];
    if (!payload.dimension) faltan.push("Dimensión");
    if (!payload.colegio) faltan.push("Colegio");
    if (!payload.objetivo_estrategico) faltan.push("Objetivo Estratégico");
    if (!payload.fecha_inicio) faltan.push("Fecha Inicio");
    if (!payload.fecha_termino) faltan.push("Fecha Término");

    if (faltan.length) {
      if ($msg) {
        $msg.textContent = "Faltan: " + faltan.join(", ");
        $msg.className = "msg msg--error";
      }
      return;
    }

    try {
      // (1) Create the plan.
      const res = await fetch(`${API}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload)
      });
      if (res.status === 403) {
        if ($msg) { $msg.textContent = "No tienes permisos para guardar."; $msg.className = "msg msg--error"; }
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if ($msg) {
          $msg.textContent = err.detail || "Error al guardar el plan";
          $msg.className = "msg msg--error";
        }
        return;
      }

      const created = await res.json();
      const planId = created.id;

      // (2) If any resource data exists, attach it to the created plan.
      const resPayload = collectResourcePayload();
      if (resPayload) {
        await fetch(`${API}/plans/${planId}/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(resPayload)
        }).catch(() => {
          // If resources fail to save, we do not block the Plan creation; just log it.
          console.warn("No se pudieron guardar los recursos");
        });
      }

      // (3) Inform the user, reset the form, and recompute total.
      if ($msg) { $msg.textContent = "Guardado correctamente"; $msg.className = "msg msg--ok"; }
      $form.reset();
      if ($rTotal) setUpAutoTotal();

    } catch (err) {
      // Network or unexpected error.
      if ($msg) { $msg.textContent = "Error de red"; $msg.className = "msg msg--error"; }
      console.error(err);
    }
  });
}

// Expose initializer on window for pages that load scripts dynamically.
window.initPlanForm = initPlanForm;