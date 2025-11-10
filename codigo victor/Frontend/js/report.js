export async function showReportesView($view, $title, esc) {
  $title.textContent = "Generador de Reportes";
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header">
        <h2 style="margin:0;">Selecciona un Objetivo</h2>
      </header>
      <div class="card__body">
         <p style="margin-bottom:1rem; color:#666;">Elige un objetivo estratégico para generar su reporte consolidado con datos en tiempo real.</p>
         <div id="reportSelectorContainer">
           <div class="loading-spinner">Cargando objetivos...</div>
         </div>
      </div>
    </section>
  `;
  if (!document.getElementById('report-styles')) {
    const style = document.createElement("style");
    style.id = 'report-styles';
    style.textContent = `
      
      .report-header { display:flex; gap:2rem; align-items:center; flex-wrap:wrap; margin-bottom:1.5rem; }
      .ring-large { position:relative; width:100px; height:100px; flex-shrink:0; }
      .ring-text { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-weight:700; font-size:1rem; color:var(--primary); }
      .report-info h3 { margin:0; font-size:1.4rem; font-weight:700; color:var(--text-color); }
      .report-info p { margin:0 0 .5rem 0; color:var(--muted-color); }
      .info-grid { display:flex; gap:1rem; flex-wrap:wrap; margin-top:1rem; }
      .info-box { background:var(--bg-color, #f9fafb); border-radius:10px; padding:.8rem 1.2rem; text-align:center; min-width:110px; border:1px solid #eee; }
      .info-box strong { display:block; font-size:.8rem; color:var(--muted-color); text-transform:uppercase; letter-spacing:0.5px; }
      .info-box span { font-size:1.3rem; font-weight:700; color:var(--primary); display:block; margin-top:5px; }
      .report-section { margin-top:2.5rem; }
      .report-section h4 { border-bottom:2px solid var(--primary); padding-bottom:.5rem; margin-bottom:1rem; color:var(--primary); font-size:1.1rem; }
      .progress-row { display:flex; align-items:center; gap:1rem; margin-top:.8rem; font-size:0.95rem; }
      .progress-bar { flex:1; background:#e5e7eb; border-radius:6px; overflow:hidden; height:12px; }
      .progress-bar .fill { background:var(--primary); height:100%; border-radius:6px; transition:width 1s ease-in-out; }
      .percent { min-width:60px; text-align:right; font-weight:700; color:var(--primary); }
      .plan-table { width:100%; border-collapse:collapse; margin-top:1rem; }
      .plan-table th, .plan-table td { padding:10px 12px; border-bottom:1px solid #eee; font-size:.9rem; vertical-align:middle; }
      .plan-table th { background:var(--bg-color, #f3f4f6); text-align:left; font-weight:700; color:var(--text-color); }
      .money { text-align: right; font-variant-numeric: tabular-nums; }
      .btn-gen { width:100%; text-align:left; padding:10px 15px; background:#fff; border:1px solid #eee; border-radius:8px; transition:all .2s; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
      .btn-gen:hover { border-color:var(--primary); background:var(--bg-color); color:var(--primary); }
      .dim-group { margin-bottom:1.5rem; }
      .dim-title { font-weight:700; color:var(--muted-color); margin-bottom:0.5rem; text-transform:uppercase; font-size:0.85rem; }
      evidence-grid { display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; }
      .evidence-thumb { height:240px; width:320px; object-fit:cover; border-radius:6px; border:1px solid #eee; display:block; }
      .evidence-file { padding:8px;border:1px solid #eee;border-radius:6px;max-width:200px;background:#fff; }
      .evidence-item { display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
      .evidence-desc { flex:1; color:var(--text-color); line-height:1.4; }
      .evidence-meta { font-size:0.85rem; color:var(--muted-color); margin-bottom:6px; }
    `;
    document.head.appendChild(style);
  }
  try {
      const fetcher = window.apiFetch || apiFetch; 
      const objs = await fetcher('/objectives?limit=500').then(r => r.json());
      renderObjectiveSelector(objs);
  } catch (e) {
      document.getElementById('reportSelectorContainer').innerHTML = `<p style="color:var(--danger)">Error cargando objetivos: ${e.message}. Asegúrate de estar logueado.</p>`;
  }

  function renderObjectiveSelector(objs) {
      const container = document.getElementById('reportSelectorContainer');
      if (!objs || objs.length === 0) {
          container.innerHTML = "<p>No se encontraron objetivos estratégicos en el sistema.</p>";
          return;
      }

      const byDim = {};
      objs.forEach(o => {
          if (!byDim[o.dimension]) byDim[o.dimension] = [];
          byDim[o.dimension].push(o);
      });

      let html = '';
      for (const [dim, list] of Object.entries(byDim)) {
          html += `<div class="dim-group"><div class="dim-title">${dim.replace(/_/g, ' ')}</div><div style="display:flex;flex-direction:column;gap:8px;">`;
          list.forEach(o => {
               html += `
               <button class="btn-gen" data-generate-id="${o.id}">
                  <span><strong>${esc(o.name)}</strong> <small>(${o.start_year}-${o.end_year})</small></span>
                  <span style="font-size:1.2rem;">→</span>
               </button>`;
          });
          html += '</div></div>';
      }
      container.innerHTML = html;

      container.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-generate-id]');
          if (btn) {
              generateReport(btn.dataset.generateId);
          }
      });
  }

  async function generateReport(objId) {
      $view.innerHTML = `
        <section class="card card--full">
          <div class="card__body" style="text-align:center; padding:3rem;">
            <div class="loading-spinner" style="margin:0 auto 1rem;"></div>
            <p>Recopilando datos y generando reporte...</p>
          </div>
        </section>`;

      try {
          const fetcher = window.apiFetch || apiFetch;
          const fmtMoney = window.formatoMoneda || formatoMoneda;

          const [obj, goals, allPlans] = await Promise.all([
              fetcher(`/objectives/${objId}`).then(r => r.json()),
              fetcher(`/objectives/${objId}/goals?limit=500`).then(r => r.json()),
              fetcher(`/plans?limit=500`).then(r => r.json())
          ]);

          let totalIndicadores = 0;
          let sumGoalProgress = 0;

          for (const goal of goals) {
              goal.indicators = await fetcher(`/goals/${goal.id}/indicators?limit=500`).then(r => r.json());
              totalIndicadores += goal.indicators.length;

              let sumIndProgress = 0;
              goal.indicators.forEach(ind => {
                   let p = 0;
                   if (ind.progress_total > 0 && ind.progress_obtained >= 0) {
                       p = (ind.progress_obtained / ind.progress_total) * 100;
                   }
                   ind.progress_pct = Math.min(100, Math.max(0, p));
                   sumIndProgress += ind.progress_pct;
              });
              goal.progress = goal.indicators.length > 0 ? (sumIndProgress / goal.indicators.length) : 0;
              sumGoalProgress += goal.progress;
          }

          const objProgress = goals.length > 0 ? (sumGoalProgress / goals.length) : 0;

          const relevantPlans = allPlans.filter(p => p.objetivo_estrategico === obj.name && p.dimension === obj.dimension);

          let totalRecursos = 0;
          for (const plan of relevantPlans) {
               const resList = await fetcher(`/plans/${plan.id}/resources`).then(r => r.json());
               plan.resources = resList[0] || {};
               totalRecursos += (plan.resources.monto_total || 0);
               try {
           const evs = await fetcher(`/plans/${plan.id}/evidences?limit=500`).then(r => r.json());
           // Normalizar a arreglo
           plan.evidences = Array.isArray(evs) ? evs : (evs && evs.data ? evs.data : []);
         } catch (errEv) {
           plan.evidences = [];
         }
      }

          renderFinalReport(obj, goals, relevantPlans, objProgress, totalIndicadores, totalRecursos, fmtMoney);

      } catch (e) {
          console.error(e);
          $view.innerHTML = `<section class="card card--full"><div class="card__body"><p style="color:var(--danger)">Error generando reporte: ${e.message}</p><button class="btn btn--ghost" onclick="location.reload()">Volver</button></div></section>`;
      }
  }

  function renderFinalReport(obj, goals, plans, objProgress, totalIndicadores, totalRecursos, fmtMoney) {
      $title.textContent = "Reporte Consolidado";
      
      $view.innerHTML = `
        <section class="card card--full reportes-container">
          <header class="card__header" style="display:flex;justify-content:space-between;align-items:center; flex-wrap:wrap; gap:10px;">
            <button id="btnVolverRep" class="btn btn--ghost">← Volver al selector</button>
            <div>
                <button id="btnDescargarPDF" class="btn">Descargar PDF</button>
            </div>
          </header>

          <div class="card__body" id="reportContent" style="padding: 2rem;">
            <div id="pdf-logo-header" style="position: absolute; top: 1.5rem; right: 2rem; display: none;">
              <img src="Imagenes/LOGOS/logo_reporte.png" alt="Logo Colegio" style="width: 200px; height: auto; opacity: 0.8;" />
            </div>
            <div class="report-header">
              <div class="ring-large">
                <canvas id="ringCanvas" width="100" height="100"></canvas>
                <div class="ring-text">${objProgress.toFixed(1)}%</div>
              </div>

              <div class="report-info" style="flex:1">
                <small style="text-transform:uppercase; color:var(--primary); font-weight:700;">${obj.dimension.replace(/_/g, ' ')}</small>
                <h3>${esc(obj.name)}</h3>
                <p>Periodo: ${obj.start_year} – ${obj.end_year}</p>
                <div class="info-grid">
                  <div class="info-box"><strong>Metas</strong><span>${goals.length}</span></div>
                  <div class="info-box"><strong>Indicadores</strong><span>${totalIndicadores}</span></div>
                  <div class="info-box"><strong>Acciones (Planes)</strong><span>${plans.length}</span></div>
                  <div class="info-box"><strong>Recursos Totales</strong><span>${fmtMoney(totalRecursos)}</span></div>
                </div>
              </div>
            </div>

            <div class="report-section">
              <h4>Avance por Meta Estratégica</h4>
              ${goals.length === 0 ? '<p>No hay metas registradas para este objetivo.</p>' : ''}
              <div id="goalsProgressContainer">
                  ${goals.map(g => `
                    <div class="meta-container" style="margin-bottom: 1.25rem; padding-bottom: 1.25rem; border-bottom: 1px solid #f0f0f0;">
                      
                      <div class="progress-row">
                          <span style="flex:0 0 40%; padding-right:10px; font-weight:700; font-size:1.05rem; color:#111;">${esc(g.title)}</span>
                          <div class="progress-bar">
                              <div class="fill" style="width:${g.progress.toFixed(1)}%;"></div>
                          </div>
                          <span class="percent">${g.progress.toFixed(1)}%</span>
                      </div>
                      
                      <div class="indicator-list" style="padding-left: 2rem; margin-top: 0.75rem; border-left: 2px solid #eee; margin-left: 10px;">
                        ${(g.indicators && g.indicators.length > 0) ? g.indicators.map(ind => `
                          <div class="progress-row" style="font-size: 0.9rem; margin-top: 0.5rem;">
                            <span style="flex:0 0 40%; padding-right:10px; color:#333;">${esc(ind.title)}</span>
                            <div class="progress-bar" style="height:8px;">
                                <div class="fill" style="width:${ind.progress_pct.toFixed(1)}%; background-color:#60a5fa;"></div>
                            </div>
                            <span class="percent" style="color:#3b82f6;">${ind.progress_pct.toFixed(1)}%</span>
                          </div>
                        `).join('') : '<div style="font-size:0.9rem; color:#777; padding-left:1rem;">Esta meta no tiene indicadores.</div>'}
                      </div>
                      
                    </div>
                  `).join('')}
              </div>
            </div>

            <div class="report-section">
              <h4>Detalle de Metas</h4>
              <table class="plan-table">
                <thead>
                  <tr><th width="80">Año</th><th>Meta Estratégica</th><th>Estrategia del Periodo</th></tr>
                </thead>
                <tbody>
                  ${goals.length === 0 ? '<tr><td colspan="3">Sin información.</td></tr>' : 
                    goals.map(g => `
                      <tr>
                        <td>${g.year}</td>
                        <td><strong>${esc(g.title)}</strong></td>
                        <td>${esc(g.description || '—')}</td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>

            <div class="report-section">
              <h4>Recursos de las Acciones (Planes)</h4>
              <div style="overflow-x:auto;">
                  <table class="plan-table" style="font-size:0.85rem;">
                    <thead>
                      <tr>
                        <th>Acción</th>
                        <th>SEP</th>
                        <th>PIE</th>
                        <th>Mantención</th>
                        <th>Pro retención</th>
                        <th>Otros*</th>
                        <th>Total Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${plans.length === 0 ? '<tr><td colspan="7">No hay acciones (planes) vinculadas a este objetivo.</td></tr>' : 
                        plans.map(p => {
                             const r = p.resources || {};
                             const otros = (r.monto_subvencion_general||0) + (r.monto_eib||0) + (r.monto_internado||0) + (r.monto_reforzamiento||0) + (r.monto_faep||0) + (r.monto_aporte_municipal||0);
                             return `
                              <tr>
                                <td>${esc(p.accion)}</td>
                                <td class="money">${fmtMoney(r.monto_sep || 0)}</td>
                                <td class="money">${fmtMoney(r.monto_pie || 0)}</td>
                                <td class="money">${fmtMoney(r.monto_mantenimiento || 0)}</td>
                                <td class="money">${fmtMoney(r.monto_pro_retencion || 0)}</td>
                                <td class="money">${fmtMoney(otros)}</td>
                                <td class="money" style="font-weight:bold; color:var(--primary);">${fmtMoney(r.monto_total || 0)}</td>
                              </tr>
                             `;
                        }).join('')
                      }
                    </tbody>
                    ${plans.length > 0 ? `
                        <tfoot>
                            <tr style="background:#f9fafb; font-weight:bold;">
                                <td colspan="6" style="text-align:right;">TOTAL OBJETIVO:</td>
                                <td class="money">${fmtMoney(totalRecursos)}</td>
                            </tr>
                        </tfoot>
                    ` : ''}
                  </table>
              </div>
              ${plans.length > 0 ? '<small style="color:#666;">* Otros incluye: Subv. General, EIB, Internado, Reforzamiento, FAEP y Aporte Municipal.</small>' : ''}
            </div>
                        <div class="report-section">
              <h4>Evidencias relacionadas</h4>
              ${ plans.some(p => p.evidences && p.evidences.length > 0) ? plans.map(p => {
                    if (!p.evidences || p.evidences.length === 0) return '';
                    return `
                      <div style="margin-bottom:1rem;">
                        <strong>${esc(p.accion)}</strong>
                        <div style="margin-top:10px;">
                          ${p.evidences.map(ev => {
                // Construir URL absoluta para archivos subidos usando la base API si está disponible
                const apiBase = (window.API || (typeof API !== 'undefined' ? API : '') ).replace(/\/$/, '');
                let url = '';
                if (ev.filename) {
                  if (/^https?:\/\//i.test(ev.filename)) {
                    url = ev.filename;
                  } else if (apiBase) {
                    url = apiBase + '/uploads/' + ev.filename;
                  } else {
                    url = '/uploads/' + ev.filename;
                  }
                } else {
                  url = ev.url || '#';
                }
                const isImage = (ev.mimetype && ev.mimetype.indexOf('image/') === 0) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
                return `
                    <div class="evidence-item">
                      <a href="${url}" target="_blank" style="display:block;flex:0 0 auto;">
                        ${isImage ? `<img src="${url}" crossorigin="anonymous" class="evidence-thumb" alt="${esc(ev.description||ev.filename||'Evidencia')}">` : `<div class="evidence-file">${esc(ev.filename||ev.name||'Archivo')}</div>`}
                      </a>
                      <div class="evidence-desc">
                        ${ev.uploaded_at ? `<div class="evidence-meta">${new Date(ev.uploaded_at).toLocaleString()}</div>` : ''}
                        <p>Descripción:</p>
                        <div>${esc(ev.description || ev.original_filename || ev.filename || '')}</div>
                      </div>
                    </div>
                  `;
                          }).join('')}
                        </div>
                      </div>
                    `;
              }).join('') : '<p>No hay evidencias relacionadas con las acciones.</p>' }
            </div>
          </div>
        </section>
      `;

      drawProgressRing(objProgress);

      document.getElementById('btnVolverRep').addEventListener('click', () => showReportesView($view, $title, esc));
      
      setupPdfButton(obj.name);
  }

  function drawProgressRing(pct) {
      const canvas = document.getElementById("ringCanvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const start = -Math.PI / 2;
      const end = start + (2 * Math.PI * pct / 100);
      const radius = 40; 
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 8;
      ctx.strokeStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.arc(50, 50, radius, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.lineWidth = 8;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb';
      ctx.strokeStyle = primaryColor;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(50, 50, radius, start, end);
      ctx.stroke();
  }
function showPdfOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'pdf-gen-overlay';
  overlay.style.cssText = `
    position: fixed; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%; 
    background: rgba(255, 255, 255, 0.9); 
    z-index: 10000; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    font-size: 1.2rem; 
    color: #333; 
    font-weight: 500;
  `;
  overlay.textContent = 'Generando PDF, por favor espera...';
  document.body.appendChild(overlay);
}

function hidePdfOverlay() {
  const overlay = document.getElementById('pdf-gen-overlay');
  if (overlay) {
    document.body.removeChild(overlay);
  }
}

  function setupPdfButton(filenameSafe) {
      const btn = document.getElementById("btnDescargarPDF");
      if (!window.html2pdf) {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
          script.onload = () => attachPdfListener(btn, filenameSafe);
          document.body.appendChild(script);
      } else {
          attachPdfListener(btn, filenameSafe);
      }
  }

  function attachPdfListener(btn, filenameSafe) {
      btn.addEventListener("click", () => {
          const element = document.getElementById("reportContent");
          const logo = document.getElementById("pdf-logo-header"); 

          const opt = {
              margin: [0.5, 0.5], 
              filename: `Reporte_${filenameSafe.substring(0, 20)}.pdf`,
              image: { type: "jpeg", quality: 0.98 },
              html2canvas: { 
                  scale: 2, 
                  useCORS: true,
                  letterRendering: true 
              },
              jsPDF: { unit: "in", format: "letter", orientation: "landscape" }, 
              pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
          };
          btn.disabled = true;
          showPdfOverlay(); 
          setTimeout(() => {
            if (logo) logo.style.display = 'block'; 

            window.html2pdf().set(opt).from(element).save().then(() => {
                btn.disabled = false;
                if (logo) logo.style.display = 'none'; 
                hidePdfOverlay(); 
            }).catch((err) => {

                console.error("Error al generar PDF:", err);
                btn.disabled = false;
                if (logo) logo.style.display = 'none';
                hidePdfOverlay();
                alert("Hubo un error al generar el PDF.");
            });
          }, 50); 
      });
  }
}

window.showReportesView = showReportesView;