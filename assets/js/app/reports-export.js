/* Catalogue de tests — module « reports-export.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* =====================================================================
   EXPORT / IMPORT — fonctions réutilisables
   ===================================================================== */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qa-catalog-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export téléchargé');
}

function importJSONFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.environments || !data.testCases) throw new Error('Format invalide');
      const counts = {
        env: (data.environments || []).length,
        tc: (data.testCases || []).length,
        suites: (data.testSuites || []).length,
        plans: (data.testPlans || []).length,
      };
      confirmDialog(
        `Remplacer toutes les données par celles du fichier ? (${counts.env} env, ${counts.tc} cas, ${counts.suites} suites, ${counts.plans} plans)`,
        () => {
          state = Object.assign({ project: {}, environments: [], testCases: [], testSuites: [], testPlans: [] }, data);
          save();
          switchTab('dashboard');
          toast('Import réussi');
        }
      );
    } catch (err) { toast('Fichier invalide'); }
  };
  reader.readAsText(file);
}

function renderExport(view) {
  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Export &amp; Import</h1>
        <div class="subtitle">Sauvegardez vos données ou générez un document de spécification de tests.</div>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <h3 style="font-size:15px;margin-bottom:6px;">Sauvegarde JSON</h3>
        <p style="font-size:12.5px;color:var(--text-soft);margin:0 0 14px;">Exporte tout le catalogue (environnements, cas, suites, plans, captures).</p>
        <button class="btn btn-primary" id="exp-json">${ICON.export}<span>Exporter en JSON</span></button>
      </div>
      <div class="card">
        <h3 style="font-size:15px;margin-bottom:6px;">Import JSON</h3>
        <p style="font-size:12.5px;color:var(--text-soft);margin:0 0 14px;">Restaure depuis une sauvegarde. Remplace les données actuelles.</p>
        <input type="file" id="imp-file" accept=".json" style="display:none;">
        <button class="btn" id="imp-json"><span style="transform:rotate(180deg);display:inline-flex;">${ICON.export}</span><span>Importer du JSON</span></button>
      </div>
      <div class="card">
        <h3 style="font-size:15px;margin-bottom:6px;">Spec imprimable</h3>
        <p style="font-size:12.5px;color:var(--text-soft);margin:0 0 14px;">Document HTML imprimable pour un plan de tests (ouvre en nouvel onglet).</p>
        <button class="btn" id="exp-spec" ${state.testPlans.length === 0 ? 'disabled' : ''}>${ICON.print}<span>Choisir un plan</span></button>
      </div>
      <div class="card" style="border-color:var(--danger-soft);">
        <h3 style="font-size:15px;margin-bottom:6px;color:var(--danger);">Réinitialiser</h3>
        <p style="font-size:12.5px;color:var(--text-soft);margin:0 0 14px;">Efface toutes les données locales. Action irréversible.</p>
        <button class="btn btn-danger" id="reset-all">${ICON.trash}<span>Tout effacer</span></button>
      </div>
    </div>
  `;

  document.getElementById('exp-json').onclick = exportJSON;

  document.getElementById('imp-json').onclick = () => document.getElementById('imp-file').click();
  document.getElementById('imp-file').onchange = (e) => {
    importJSONFile(e.target.files[0]);
    e.target.value = '';
  };

  document.getElementById('exp-spec').onclick = () => exportSpecChooser();

  document.getElementById('reset-all').onclick = () => {
    confirmDialog('Effacer toutes les données (IndexedDB + fichier connecté) ? Action irréversible.', async () => {
      await dbDelete('state');
      await dbDelete('fileHandle');
      fileHandle = null;
      state = { project: { name: '', startDate: '', endDate: '' }, environments: [], testCases: [], testSuites: [], testPlans: [] };
      switchTab('dashboard');
      updateStorageIndicator();
      updateFileBanner();
      toast('Données effacées');
    });
  };
}

function exportSpecChooser() {
  if (state.testPlans.length === 0) { toast('Créez d\'abord un plan'); return; }
  openModal('Choisir un plan', `
    <div class="picker">
      ${state.testPlans.map(p => `
        <div class="picker-item" data-spec-plan="${p.id}" style="cursor:pointer;">
          <span>${escapeHtml(p.title)}</span>
        </div>
      `).join('')}
    </div>
  `, `<button class="btn" data-close-modal>Annuler</button>`, () => {
    document.querySelectorAll('[data-spec-plan]').forEach(el => el.onclick = () => { closeModal(); exportSpec(el.dataset.specPlan); });
  });
}

function exportSpec(planId) {
  const plan = migratePlan(state.testPlans.find(p => p.id === planId));
  if (!plan) return;

  // Walk items in order; batch consecutive direct cases into "Cas individuels" sections
  const sections = [];
  let directBatch = null;
  (plan.items || []).forEach(item => {
    if (item.type === 'suite') {
      if (directBatch) { sections.push(directBatch); directBatch = null; }
      const s = state.testSuites.find(x => x.id === item.id);
      if (!s) return;
      const cases = (s.testCaseIds || []).map(cid => state.testCases.find(c => c.id === cid)).filter(Boolean);
      sections.push({ title: suiteDisplayTitle(s), kind: 'suite', items: cases });
    } else {
      const c = state.testCases.find(x => x.id === item.id);
      if (!c) return;
      if (!directBatch) directBatch = { title: 'Cas individuels', kind: 'direct', items: [] };
      directBatch.items.push(c);
    }
  });
  if (directBatch) sections.push(directBatch);

  const meta = planMetadata(plan);
  const allCases = meta.cases; // deduped, for summary
  const totalTime = meta.time;
  const suiteCount = meta.suiteCount;
  const directCount = meta.directCount;
  // List projects that include this plan (read-only context for the spec header)
  const includingProjects = (state.projects || []).filter(p => (p.planIds || []).includes(plan.id));
  const projectsLabel = includingProjects.length === 0
    ? 'Spécification de tests'
    : `Spécification de tests · ${includingProjects.map(p => p.name).join(' · ')}`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>${escapeHtml(plan.title)} — Spécification</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#1F2937; max-width:900px; margin:40px auto; padding:0 24px; line-height:1.55; }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-0.02em; }
  h2 { font-size:18px; margin:36px 0 12px; padding-bottom:8px; border-bottom:1px solid #E5E7EB; }
  h3 { font-size:15px; margin:24px 0 8px; }
  .subtitle { color:#6B7280; margin:0 0 24px; }
  .meta { display:flex; gap:16px; flex-wrap:wrap; font-size:12.5px; color:#6B7280; padding:12px; background:#F9FAFB; border-radius:8px; margin-bottom:24px; }
  .meta strong { color:#1F2937; }
  .case { padding:16px 0; border-bottom:1px solid #E5E7EB; page-break-inside:avoid; }
  .case-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:8px; }
  .case-title { font-size:14.5px; font-weight:600; }
  .badges { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 10px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; background:#F3F4F6; color:#4B5563; border:1px solid #E5E7EB; }
  .badge-success { background:#DCEAE3; color:#2F6754; border-color:#BFD9CB; }
  .badge-accent { background:#F8E6D6; color:#8a4a1f; border-color:#EFD3B8; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin:6px 0; }
  th, td { text-align:left; padding:6px 8px; border:1px solid #E5E7EB; vertical-align:top; }
  th { background:#F9FAFB; font-weight:600; }
  .step-num { width:30px; text-align:center; color:#6B7280; }
  img.shot { max-width:340px; max-height:200px; border:1px solid #E5E7EB; border-radius:4px; margin:6px 6px 0 0; }
  .var-pill { display:inline-flex; align-items:center; padding:0 6px; margin:0 1px; border-radius:4px; background:#DDE6F0; color:#4A6B8A; font-size:11.5px; font-weight:500; border:1px solid #C0D2E5; line-height:1.5; white-space:nowrap; }
  .var-pill::before { content:'⟨'; opacity:0.5; margin-right:2px; }
  .var-pill::after { content:'⟩'; opacity:0.5; margin-left:2px; }
  .var-pill.missing { background:#F4D9D4; color:#8a3a2c; border-color:#E8C5BD; }
  @media print { body { margin:0; } h2 { page-break-before:auto; } .case { page-break-inside:avoid; } .var-pill { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>

<h1>${escapeHtml(planDisplayTitle(plan))}</h1>
<div class="subtitle">${escapeHtml(projectsLabel)} · ${today()}</div>

<div class="meta">
  <span><strong>${allCases.length}</strong> cas uniques</span>
  <span><strong>${suiteCount}</strong> suites · <strong>${directCount}</strong> cas individuels</span>
  <span><strong>${allCases.filter(c => c.ready).length}</strong> prêts</span>
  <span><strong>${allCases.filter(c => c.automated).length}</strong> automatisés</span>
  ${totalTime ? `<span>Effort estimé: <strong>${formatMin(totalTime)}</strong></span>` : ''}
</div>

${state.environments.length ? `
<h2>Environnements référencés</h2>
<table>
  <tr><th>Environnement</th><th>Adresse</th></tr>
  ${state.environments.filter(e => allCases.some(c => c.environmentIds.includes(e.id))).map(e => `
    <tr><td>${escapeHtml(e.title)}</td><td style="font-family:monospace;font-size:12px;">${escapeHtml(e.address || '—')}</td></tr>
  `).join('')}
</table>` : ''}

${sections.map(sec => `
  <h2>${escapeHtml(sec.title)}</h2>
  ${sec.items.map((c, idx) => {
    const envNames = c.environmentIds.map(id => (state.environments.find(e => e.id === id) || {}).title).filter(Boolean).join(', ');
    const typeLabels = (c.types || []).map(id => (TEST_TYPES.find(t => t.id === id) || {}).label).filter(Boolean).join(', ');
    return `
      <div class="case">
        <div class="case-head">
          <div class="case-title">${idx + 1}. ${escapeHtml(c.title)}</div>
          <div style="font-size:12px;color:#6B7280;">${c.estimatedTime ? formatMin(c.estimatedTime) : ''}</div>
        </div>
        <div class="badges">
          ${c.ready ? '<span class="badge badge-success">Prêt</span>' : '<span class="badge">À préparer</span>'}
          ${c.automated ? '<span class="badge badge-accent">Automatisé</span>' : '<span class="badge">Manuel</span>'}
          ${c.isInterface ? '<span class="badge">Interface</span>' : ''}
          ${c.environmentIds.length >= 2 ? '<span class="badge">Transverse</span>' : ''}
          ${typeLabels ? `<span class="badge">${escapeHtml(typeLabels)}</span>` : ''}
        </div>
        ${envNames ? `<div style="font-size:12.5px;color:#6B7280;margin-bottom:8px;"><strong>Environnements:</strong> ${escapeHtml(envNames)}</div>` : ''}
        ${(c.jiraTickets || []).filter(t => t.key).length > 0 ? `
          <div style="margin:8px 0 12px;padding:8px 12px;background:#F0F4FA;border:1px solid #DDE5F0;border-radius:6px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="color:#6B7280;font-size:11.5px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;margin-right:4px;">Tickets Jira :</span>
            ${(c.jiraTickets || []).filter(t => t.key).map(t => {
              const label = escapeHtml(t.key) + (t.summary ? ' — ' + escapeHtml(t.summary) : '');
              const url = jiraUrlFor(t.key);
              return url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:2px 8px;border-radius:4px;background:#E8F0FB;color:#1F4173;border:1px solid #C8D9EE;font-family:monospace;font-size:11.5px;text-decoration:none;">${label}</a>`
                : `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#E8F0FB;color:#1F4173;border:1px solid #C8D9EE;font-family:monospace;font-size:11.5px;">${label}</span>`;
            }).join('')}
          </div>
        ` : ''}
        ${(() => {
          const expanded = expandSteps(c.steps).filter(s => s.action || s.expected);
          if (expanded.length === 0) return '';
          return `<table>
            <tr><th class="step-num">#</th><th>Action</th><th>Résultat attendu</th><th style="width:90px;">Capture</th></tr>
            ${expanded.map((s, i) => `
              <tr>
                <td class="step-num">${i + 1}</td>
                <td>${s.fromBlock ? `<span class="badge badge-accent" style="font-size:10.5px;">via Bloc « ${escapeHtml(s.fromBlock.name || '?')} »</span><br>` : ''}${renderStepText(s.action || '')}</td>
                <td>${renderStepText(s.expected || '')}</td>
                <td style="text-align:center;">${s.requiresScreenshot ? '<span class="badge badge-accent">Requise</span>' : ''}</td>
              </tr>
            `).join('')}
          </table>`;
        })()}
        ${(c.screenshots || []).length ? `
          <div style="margin-top:8px;">
            ${c.screenshots.map(s => `<img class="shot" src="${s.data}" alt="">`).join('')}
          </div>` : ''}
      </div>
    `;
  }).join('')}
`).join('')}

<div style="margin-top:40px;font-size:11px;color:#9CA3AF;text-align:center;">Généré le ${new Date().toLocaleString('fr-CH')}</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Spec ouverte dans un nouvel onglet');
}

/* =====================================================================
   CSV EXPORT — plans de tests (pour import Jira ou tableur)
   - séparateur ; · UTF-8 BOM · RFC 4180 (champs avec ; " ou \n → entre guillemets)
   - une ligne par cas, étapes regroupées dans une seule cellule multi-lignes
   ===================================================================== */
function exportPlanCsv(planId) {
  const plan = migratePlan(state.testPlans.find(p => p.id === planId));
  if (!plan) { toast('Plan introuvable'); return; }

  const SEP = ';';
  const csvEscape = (v) => {
    const s = v == null ? '' : String(v);
    if (s.includes(SEP) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const yesNo = (b) => b ? 'oui' : 'non';
  const joinPipe = (arr) => arr.filter(Boolean).join(' | ');
  const envNames = (ids) => joinPipe((ids || []).map(id => (state.environments.find(e => e.id === id) || {}).title));
  const typeLabels = (ids) => joinPipe((ids || []).map(id => (TEST_TYPES.find(t => t.id === id) || {}).label || id));
  const divisionNames = (ids) => joinPipe((ids || []).map(id => ((state.businessDivisions || []).find(d => d.id === id) || {}).name));
  const levelName = (id) => ((state.testerLevels || []).find(l => l.id === id) || {}).name || '';
  const crudLabel = (id) => {
    if (!id) return '';
    const op = CRUD_OPS.find(o => o.id === id);
    return op ? `${op.short} — ${op.label}` : id;
  };
  const stepsText = (tc) => {
    const steps = expandSteps(tc.steps || []).filter(s => (s.action || '').trim() || (s.expected || '').trim());
    return steps.map((s, i) => {
      const action = (s.action || '').trim();
      const expected = (s.expected || '').trim();
      let line = `${i + 1}. ${action || '(action vide)'}`;
      if (expected) line += `\n   → ${expected}`;
      return line;
    }).join('\n');
  };
  const jiraKeys = (tc) => joinPipe((tc.jiraTickets || []).map(t => t.key).filter(Boolean));

  const headers = [
    'Plan', 'Ordre', "Type d'élément", 'Suite', 'Titre',
    'Étapes', 'Dossier', 'Environnements', 'Types', 'CRUD',
    'Prêt', 'Automatisé', 'À automatiser', 'Interface',
    'Temps estimé (min)', 'Niveau requis', 'Divisions métier', 'Tickets Jira'
  ];
  const rows = [headers.map(csvEscape).join(SEP)];

  const pushCase = (c, order, kind, suiteName) => {
    rows.push([
      plan.title,
      String(order),
      kind,
      suiteName || '',
      c.title || '',
      stepsText(c),
      folderOf(c).name,
      envNames(c.environmentIds),
      typeLabels(c.types),
      crudLabel(c.crud),
      yesNo(c.ready),
      yesNo(c.automated),
      yesNo(c.toAutomate),
      yesNo(c.isInterface),
      c.estimatedTime || '',
      levelName(c.minLevelId),
      divisionNames(c.divisionIds),
      jiraKeys(c),
    ].map(csvEscape).join(SEP));
  };

  let order = 0;
  (plan.items || []).forEach(item => {
    if (item.type === 'suite') {
      const s = state.testSuites.find(x => x.id === item.id);
      if (!s) return;
      const suiteName = suiteDisplayTitle(s);
      (s.testCaseIds || [])
        .map(cid => state.testCases.find(c => c.id === cid))
        .filter(Boolean)
        .forEach(c => { order++; pushCase(c, order, 'Suite', suiteName); });
    } else if (item.type === 'case') {
      const c = state.testCases.find(x => x.id === item.id);
      if (!c) return;
      order++;
      pushCase(c, order, 'Cas individuel', '');
    }
  });

  if (rows.length === 1) { toast('Plan vide — rien à exporter'); return; }

  const csv = '﻿' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const slug = (plan.title || 'plan').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `plan-${slug || 'export'}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV téléchargé');
}

function exportPlanCsvChooser() {
  if (state.testPlans.length === 0) { toast('Créez d\'abord un plan'); return; }
  openModal('Exporter un plan en CSV', `
    <p style="margin:0 0 12px;font-size:13px;color:var(--text-soft);">
      Une ligne par cas de test, avec les étapes regroupées dans une seule colonne (multi-lignes). Séparateur <code>;</code>, UTF-8 — prêt pour import Jira ou Excel.
    </p>
    <div class="picker">
      ${state.testPlans.map(p => `
        <div class="picker-item" data-csv-plan="${p.id}" style="cursor:pointer;">
          <span>${escapeHtml(p.title)}</span>
        </div>
      `).join('')}
    </div>
  `, `<button class="btn" data-close-modal>Annuler</button>`, () => {
    document.querySelectorAll('[data-csv-plan]').forEach(el => el.onclick = () => { closeModal(); exportPlanCsv(el.dataset.csvPlan); });
  });
}

/* =====================================================================
   CHECKLIST — HTML auto-portant pour testeur manuel
   ===================================================================== */
function openChecklistModal(kind, sourceId) {
  const item = kind === 'suite'
    ? state.testSuites.find(s => s.id === sourceId)
    : (kind === 'plan' ? migratePlan(state.testPlans.find(p => p.id === sourceId)) : null);
  if (!item) return;

  const cases = kind === 'suite'
    ? suiteMetadata(item).cases
    : collectPlanCases(item, true);

  if (cases.length === 0) {
    toast(kind === 'suite' ? 'Cette suite est vide' : 'Ce plan est vide');
    return;
  }

  const title = kind === 'suite' ? suiteDisplayTitle(item) : planDisplayTitle(item);
  const totalSteps = cases.reduce((a, c) => a + expandSteps(c.steps).filter(s => (s.action || '').trim() || (s.expected || '').trim()).length, 0);
  const screenshotsRequired = cases.reduce((a, c) => a + expandSteps(c.steps).filter(s => s.requiresScreenshot).length, 0);

  // Projects that include this plan (only relevant when kind === 'plan')
  const candidateProjects = kind === 'plan'
    ? (state.projects || []).filter(p => (p.planIds || []).includes(item.id))
    : [];

  // Build tester picker with defined testers + free-text fallback
  const testers = state.testers || [];
  const sourceDivisionIds = item.divisionIds || [];
  const intersects = (testerDivIds) => {
    if (sourceDivisionIds.length === 0 || !testerDivIds || testerDivIds.length === 0) return false;
    return testerDivIds.some(d => sourceDivisionIds.includes(d));
  };
  // Sort: matching division first, then by name
  const sortedTesters = [...testers].sort((a, b) => {
    const aMatch = intersects(a.divisionIds) ? 0 : 1;
    const bMatch = intersects(b.divisionIds) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return (a.name || '').localeCompare(b.name || '');
  });
  const labelForTester = (t) => {
    const lvl = t.levelId ? (state.testerLevels || []).find(l => l.id === t.levelId) : null;
    const divs = (t.divisionIds || []).map(did => (state.businessDivisions || []).find(d => d.id === did)).filter(Boolean);
    const tag = intersects(t.divisionIds) ? ' ★' : '';
    let parts = [t.name];
    if (lvl) parts.push(lvl.name);
    if (divs.length > 0) parts.push(divs.map(d => d.name).join(' / '));
    return parts.join(' — ') + tag;
  };

  openModal('Générer une checklist testeur', `
    <div style="font-size:13px;color:var(--text-soft);margin-bottom:16px;padding:10px 12px;background:var(--surface-soft);border-radius:var(--radius-sm);">
      Source : <strong style="color:var(--text);">${escapeHtml(title)}</strong><br>
      <span style="font-size:12px;">${cases.length} cas · ${totalSteps} étapes${screenshotsRequired ? ' · ' + screenshotsRequired + ' captures demandées' : ''}</span>
    </div>
    ${candidateProjects.length > 0 ? `
      <div class="form-group">
        <label class="field-label">Projet (contexte de la campagne)</label>
        <select id="ck-project">
          <option value="">— Sans contexte projet —</option>
          ${candidateProjects.map(p => {
            const datesLabel = p.startDate && p.endDate ? ` (${p.startDate} → ${p.endDate})` : '';
            return `<option value="${p.id}" ${candidateProjects.length === 1 ? 'selected' : ''}>${escapeHtml(p.name + datesLabel)}</option>`;
          }).join('')}
        </select>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">Le nom du projet apparaîtra dans l'en-tête de la checklist.</div>
      </div>
    ` : ''}
    <div class="form-row">
      <div class="form-group">
        <label class="field-label">Testeur <span class="required">*</span></label>
        ${testers.length > 0 ? `
          <select id="ck-tester-select">
            <option value="">— Choisir dans la liste —</option>
            ${sortedTesters.map(t => `<option value="${t.id}">${escapeHtml(labelForTester(t))}</option>`).join('')}
            <option value="__other">Autre — saisie libre…</option>
          </select>
          <input type="text" id="ck-tester-input" placeholder="Nom du testeur" style="display:none;margin-top:6px;">
          ${sourceDivisionIds.length > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">★ = testeur dont une spécialité matche les divisions de cette campagne</div>` : ''}
        ` : `
          <input type="text" id="ck-tester-input" placeholder="Ex. Jean Dupont">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Astuce : créez vos testeurs dans l'onglet Testeurs pour les sélectionner directement.</div>
        `}
      </div>
      <div class="form-group">
        <label class="field-label">Date d'assignation</label>
        <input type="date" id="ck-date" value="${today()}">
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.5;">
      Le fichier HTML téléchargé est entièrement autonome. Le testeur l'ouvre dans son navigateur, coche les étapes au fur et à mesure, ajoute remarques et captures, puis génère un rapport PDF en bout de chaîne. Sa progression est sauvegardée localement entre les sessions.
    </div>
  `, `
    <button class="btn" data-close-modal>Annuler</button>
    <button class="btn btn-primary" id="ck-generate">Générer et télécharger</button>
  `, () => {
    const select = document.getElementById('ck-tester-select');
    const input = document.getElementById('ck-tester-input');
    if (select) {
      select.onchange = () => {
        if (select.value === '__other') {
          input.style.display = '';
          input.focus();
        } else {
          input.style.display = 'none';
          input.value = '';
        }
      };
      select.focus();
    } else {
      input.focus();
    }
    document.getElementById('ck-generate').onclick = () => {
      let tester = '';
      if (select && select.value && select.value !== '__other') {
        const t = testers.find(x => x.id === select.value);
        tester = t ? t.name : '';
      } else {
        tester = (input.value || '').trim();
      }
      if (!tester) {
        toast(select && !select.value ? 'Sélectionnez un testeur' : 'Le nom du testeur est requis');
        if (select && !select.value) select.focus();
        else input.focus();
        return;
      }
      const date = document.getElementById('ck-date').value || today();
      const projectSelect = document.getElementById('ck-project');
      const projectId = projectSelect ? projectSelect.value : '';
      generateChecklist(item, kind, tester, date, projectId);
      closeModal();
    };
  });
}

function generateChecklist(item, kind, tester, date, projectId) {
  let cases, title, projectName = '';
  if (kind === 'suite') {
    title = suiteDisplayTitle(item);
    cases = suiteMetadata(item).cases;
  } else {
    title = planDisplayTitle(item);
    cases = collectPlanCases(item, true);
  }
  if (projectId) {
    const linkedProject = (state.projects || []).find(p => p.id === projectId);
    if (linkedProject) projectName = linkedProject.name;
  }

  // Compute per-case row selection (caseId → { tableId: number[] }).
  // For plans: use item.dataSelections (first plan-item containing the case wins).
  // For lone suites: default to "all valid rows" for each case.
  const caseSelections = {};
  if (kind === 'plan') {
    const map = planEffectiveSelections(item);
    map.forEach((selMap, caseId) => {
      const obj = {};
      selMap.forEach((indices, tableId) => { obj[tableId] = indices.slice(); });
      caseSelections[caseId] = obj;
    });
  } else {
    cases.forEach(c => {
      const eff = effectiveSelectionForCase(null, c);
      const obj = {};
      eff.forEach((indices, tableId) => { obj[tableId] = indices.slice(); });
      caseSelections[c.id] = obj;
    });
  }

  // Snapshot the data tables used by these cases — embedded in the checklist for the tester
  const usedTableIds = tablesUsedByCases(cases);
  const usedTables = (state.dataTables || [])
    .filter(t => usedTableIds.has(t.id))
    .map(t => ({
      id: t.id,
      name: t.name,
      columns: (t.columns || []).map(c => ({ id: c.id, name: c.name })),
      rows: (t.rows || []).map(r => {
        // Keep only values for existing columns
        const out = {};
        (t.columns || []).forEach(c => { out[c.id] = r[c.id] || ''; });
        return out;
      })
    }));

  // Build a hierarchy structure (suites → cases) for the report summary.
  // For 'suite' kind: a single group containing all the cases.
  // For 'plan' kind: walk plan.items in order; suite items become groups, direct case items are placed in a synthetic "Cas directs" group.
  let structure;
  if (kind === 'suite') {
    structure = [{ kind: 'suite', name: suiteDisplayTitle(item), caseIds: cases.map(c => c.id) }];
  } else {
    structure = [];
    let directBucket = null;
    (item.items || []).forEach(it => {
      if (it.type === 'suite') {
        const s = state.testSuites.find(x => x.id === it.id);
        if (s) {
          const sCases = suiteMetadata(s).cases;
          structure.push({ kind: 'suite', name: suiteDisplayTitle(s), caseIds: sCases.map(c => c.id) });
        }
      } else if (it.type === 'case') {
        const c = state.testCases.find(x => x.id === it.id);
        if (c) {
          if (!directBucket) {
            directBucket = { kind: 'direct', name: 'Cas individuels', caseIds: [] };
            structure.push(directBucket);
          }
          directBucket.caseIds.push(c.id);
        }
      }
    });
  }

  const data = {
    sessionId: uid(),
    title,
    sourceType: kind,
    sourceId: item.id,
    tester,
    assignedDate: date,
    project: projectName,
    generatedAt: new Date().toISOString(),
    dataTables: usedTables,
    structure,
    cases: cases.map(c => ({
      id: c.id,
      title: c.title || '(sans titre)',
      environments: (c.environmentIds || []).map(eid => (state.environments.find(e => e.id === eid) || {}).title || '?'),
      types: (c.types || []).map(tid => (TEST_TYPES.find(t => t.id === tid) || {}).label || tid),
      isInterface: !!c.isInterface,
      estimatedTime: c.estimatedTime || null,
      jiraTickets: (c.jiraTickets || []).filter(t => t.key).map(t => ({ key: t.key, summary: t.summary || '', url: jiraUrlFor(t.key) })),
      dataRowsByTable: caseSelections[c.id] || {},
      steps: expandSteps(c.steps).filter(s => (s.action || '').trim() || (s.expected || '').trim()).map(s => ({
        action: s.action || '',
        expected: s.expected || '',
        requiresScreenshot: !!s.requiresScreenshot,
        fromBlock: s.fromBlock || null
      }))
    }))
  };

  const html = buildChecklistHTML(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'checklist';
  a.download = `checklist-${safe(title)}-${safe(tester)}-${date}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Checklist téléchargée');
}

function buildChecklistHTML(data) {
  // Returns a complete self-contained HTML document.
  // Inner JS uses string concatenation (no template literals) and
  // typographic apostrophes (’) to keep escaping minimal.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Checklist · ${escapeHtml(data.title)}</title>
<style>
  :root {
    --bg: #F7F4EE;
    --surface: #FFFFFF;
    --surface-soft: #FBF9F4;
    --text: #1F2937;
    --text-soft: #5B6472;
    --text-muted: #9AA0A8;
    --border: #E8E2D4;
    --border-strong: #D4CDBC;
    --primary: #4A6B8A;
    --primary-soft: #DDE6F0;
    --accent: #D9824B;
    --accent-soft: #F8E6D6;
    --success: #5E9A82;
    --success-soft: #DCEAE3;
    --radius-sm: 6px;
    --radius: 10px;
    --radius-lg: 16px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text); background: var(--bg);
    margin: 0; line-height: 1.55; font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }
  button { font: inherit; cursor: pointer; }
  textarea, input { font: inherit; color: inherit; }
  .ck-container { max-width: 920px; margin: 0 auto; padding: 24px 20px 110px; }
  .ck-header {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 24px; margin-bottom: 18px;
  }
  .ck-header h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.015em; }
  .ck-header .subtitle { color: var(--text-soft); font-size: 13px; margin-bottom: 18px; }
  .ck-meta {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 14px; padding: 14px 0; border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border); margin-bottom: 16px;
  }
  .ck-meta-item .label {
    font-size: 10.5px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.05em;
    font-weight: 600; margin-bottom: 3px;
  }
  .ck-meta-item .value { font-size: 14px; font-weight: 500; }
  .progress-row { display: flex; align-items: center; gap: 14px; }
  .progress-bar {
    flex: 1; height: 8px; background: var(--border);
    border-radius: 4px; overflow: hidden;
  }
  .progress-bar > div {
    height: 100%; background: var(--success); transition: width 200ms;
  }
  .progress-text {
    font-size: 13px; font-weight: 500; color: var(--text-soft);
    min-width: 130px; text-align: right;
  }
  .case-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 10px;
  }
  .case-head {
    display: flex; justify-content: space-between; align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .case-head-left {
    display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
  }
  .case-toggle {
    width: 18px; height: 18px; flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 150ms;
  }
  .case-card.collapsed .case-toggle { transform: rotate(-90deg); }
  .case-card.collapsed .case-body { display: none; }
  .case-title { font-size: 14.5px; margin: 0; letter-spacing: -0.01em; line-height: 1.35; }
  .case-status {
    font-size: 11px; padding: 2px 8px; background: var(--surface-soft);
    border-radius: 10px; color: var(--text-soft); font-weight: 500;
    flex-shrink: 0; white-space: nowrap;
  }
  .case-status.complete { background: var(--success-soft); color: #2F6754; }
  .case-status.failed   { background: #F4D9D4; color: #8a3a2c; }
  .case-body { margin-top: 10px; }
  .case-badges { display: flex; gap: 5px; flex-wrap: wrap; margin: 4px 0 10px; }
  .badge {
    font-size: 10.5px; padding: 1px 7px; background: var(--surface-soft);
    border: 1px solid var(--border); border-radius: 8px; color: var(--text-soft);
  }
  .badge-accent { background: var(--accent-soft); color: #8a4a1f; border-color: #EFD3B8; }
  .badge-primary { background: var(--primary-soft); color: var(--primary); border-color: #C0D2E5; }

  .jira-strip {
    display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
    padding: 6px 10px; margin: 0 0 10px;
    background: #F0F4FA;
    border: 1px solid #DDE5F0;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .jira-strip-label {
    color: var(--text-muted);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    margin-right: 4px;
  }
  .jira-pill {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 6px; border-radius: 4px;
    background: #E8F0FB; color: #1F4173;
    border: 1px solid #C8D9EE;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px; font-weight: 500;
    text-decoration: none;
  }
  .jira-pill:hover { background: #D9E5F4; border-color: #4A6B8A; }
  @media print {
    .jira-strip { background: #F0F4FA !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .jira-pill { background: #E8F0FB !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  .step-list { list-style: none; margin: 0; padding: 0; }
  .step-item { border-top: 1px solid var(--border); padding: 9px 0; }
  .step-item:first-child { border-top: none; padding-top: 2px; }
  .step-block-tag {
    display: inline-block; margin-left: 6px;
    font-size: 10px; font-weight: 500; color: var(--accent);
    background: var(--accent-soft); border: 1px solid #EFD3B8;
    padding: 0 6px; border-radius: 6px;
    vertical-align: middle;
  }
  .step-row {
    display: grid; grid-template-columns: 26px 1fr;
    gap: 9px; align-items: start;
  }
  .step-check {
    width: 19px; height: 19px; margin-top: 1px;
    border-radius: 5px; border: 2px solid var(--border-strong);
    background: var(--surface); display: grid; place-items: center;
    cursor: pointer; appearance: none; -webkit-appearance: none;
    transition: all 100ms; flex-shrink: 0;
  }
  .step-check:hover { border-color: var(--text-soft); }
  .step-check:checked { background: var(--success); border-color: var(--success); }
  .step-check:checked::after {
    content: ''; width: 4px; height: 8px;
    border: solid white; border-width: 0 2px 2px 0;
    transform: rotate(45deg) translate(-1px, -1px);
  }
  .step-num { font-size: 10px; color: var(--text-muted); font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.04em; }
  .step-content .row { margin-bottom: 2px; font-size: 12.5px; line-height: 1.5; }
  .step-content .row strong { color: var(--text-soft); font-weight: 500; }

  /* Variable pill with optional value */
  .var-pill { position: relative; }
  .var-pill .vp-name { }
  .var-pill .vp-value {
    margin-left: 4px;
    padding-left: 5px;
    border-left: 1px solid currentColor;
    opacity: 0.85;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }
  .var-pill[data-multi="1"]::after {
    content: ' ▾';
    font-size: 9px;
    opacity: 0.55;
    margin-left: 2px;
  }

  /* Step extras: as compact toggleable strips */
  .step-tools {
    display: flex; gap: 6px; margin-top: 5px; flex-wrap: wrap;
  }
  .step-tool-btn {
    font: inherit; font-size: 11px;
    padding: 2px 8px; border-radius: 5px;
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--text-soft);
    cursor: pointer; line-height: 1.6;
  }
  .step-tool-btn:hover { border-color: var(--text-soft); color: var(--text); }
  .step-tool-btn.has-content {
    background: var(--primary-soft); border-color: #C0D2E5; color: var(--primary);
  }
  .step-tool-btn.has-content::before { content: '● '; font-size: 8px; }
  .step-tool-btn.missing-shot {
    background: var(--accent-soft); border-color: #EFD3B8; color: #8a4a1f;
    font-weight: 600;
    animation: pulse-shot 1.6s ease-in-out infinite;
  }
  .step-tool-btn.missing-shot::before { content: '⚠ '; font-size: 11px; }
  @keyframes pulse-shot {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,130,75,0.0); }
    50%      { box-shadow: 0 0 0 4px rgba(217,130,75,0.15); }
  }
  .ck-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ck-btn:disabled:hover { background: var(--surface); }
  .step-extra {
    margin-top: 6px; padding: 8px 10px;
    background: var(--surface-soft); border-radius: var(--radius-sm);
    display: none;
  }
  .step-extra.open { display: block; }
  .step-extra textarea {
    width: 100%; padding: 5px 7px; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface);
    resize: vertical; min-height: 34px; font: inherit; font-size: 12.5px;
  }
  .step-extra textarea:focus {
    outline: none; border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-soft);
  }
  .step-extra input[type="file"] { font-size: 11.5px; max-width: 100%; }
  .step-extra input[type="file"]::file-selector-button {
    padding: 4px 9px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface);
    cursor: pointer; margin-right: 8px; font: inherit; color: var(--text);
  }

  /* Multiple screenshots */
  .shot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px; margin-top: 6px;
  }
  .shot-tile {
    position: relative;
    border-radius: var(--radius-sm); border: 1px solid var(--border);
    overflow: hidden; aspect-ratio: 4 / 3;
    background: var(--surface);
  }
  .shot-tile img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
  .shot-tile .shot-rm {
    position: absolute; top: 3px; right: 3px;
    width: 22px; height: 22px; border: none;
    background: rgba(31,41,55,0.7); color: white;
    border-radius: 50%; cursor: pointer;
    font-size: 14px; line-height: 1;
    display: grid; place-items: center;
  }
  .shot-tile .shot-rm:hover { background: rgba(31,41,55,0.9); }
  .shot-zoom-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: none; align-items: center; justify-content: center;
    padding: 30px; z-index: 200; cursor: zoom-out;
  }
  .shot-zoom-backdrop.open { display: flex; }
  .shot-zoom-backdrop img { max-width: 100%; max-height: 100%; border-radius: 4px; }

  /* Case outcome (pass / fail) */
  .case-outcome {
    display: flex; gap: 6px; margin-top: 10px; padding-top: 8px;
    border-top: 1px dashed var(--border);
    align-items: center;
  }
  .case-outcome .lbl {
    font-size: 11px; font-weight: 600;
    color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.04em;
    margin-right: 4px;
  }
  .outcome-btn {
    font: inherit; font-size: 11.5px; font-weight: 500;
    padding: 3px 10px; border-radius: 5px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: var(--text-soft);
    cursor: pointer;
  }
  .outcome-btn:hover { border-color: var(--text-soft); }
  .outcome-btn.pass.active {
    background: var(--success-soft); color: #2F6754; border-color: #BFD9CB;
  }
  .outcome-btn.fail.active {
    background: #F4D9D4; color: #8a3a2c; border-color: #E8C5BD;
  }
  .case-card.has-failed { border-color: #E8C5BD; }
  .case-card.has-failed .case-head { background: linear-gradient(0deg, #FBEFEC, transparent); }

  .case-remarks {
    margin-top: 10px; padding: 8px 10px;
    background: var(--surface-soft); border-radius: var(--radius-sm);
    display: none;
  }
  .case-remarks.open { display: block; }
  .case-remarks .lbl {
    display: block; font-size: 11px; font-weight: 600;
    color: var(--text-soft); margin-bottom: 5px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .case-remarks textarea {
    width: 100%; padding: 5px 7px; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: var(--surface);
    resize: vertical; min-height: 34px; font: inherit; font-size: 12.5px;
  }
  .case-remarks-toggle {
    margin-top: 8px;
  }
  .ck-footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 10px 18px; display: flex; justify-content: center; gap: 10px;
    box-shadow: 0 -2px 12px rgba(0,0,0,0.05); z-index: 10;
  }
  .ck-btn {
    padding: 8px 16px; border-radius: 7px;
    border: 1px solid var(--border-strong); background: var(--surface);
    color: var(--text); font-weight: 500; font-size: 13px;
    cursor: pointer; font-family: inherit;
  }
  .ck-btn:hover { background: var(--surface-soft); }
  .ck-btn-primary {
    background: var(--text); color: var(--surface); border-color: var(--text);
  }
  .ck-btn-primary:hover { background: #2d3845; }

  /* Bulk collapse/expand */
  .ck-toolbar {
    display: flex; gap: 8px; align-items: center;
    margin-bottom: 12px; padding: 8px 12px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .ck-toolbar button {
    font: inherit; font-size: 12px;
    padding: 3px 8px; border-radius: 4px;
    background: transparent; border: 1px solid var(--border-strong);
    cursor: pointer; color: var(--text-soft);
  }
  .ck-toolbar button:hover { color: var(--text); border-color: var(--text-soft); }
  .ck-toolbar .summary {
    flex: 1; color: var(--text-soft);
  }
  .ck-toolbar .summary strong { color: var(--text); }

  /* Report summary at top of report */
  .report-summary {
    display: none;
    margin-bottom: 16px; padding: 14px 16px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .report-summary h2 { font-size: 15px; margin: 0 0 8px; letter-spacing: -0.01em; }
  .report-summary .summary-counts {
    display: flex; gap: 18px; flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .summary-count {
    display: flex; flex-direction: column; gap: 2px;
  }
  .summary-count .num {
    font-size: 22px; font-weight: 600; line-height: 1;
  }
  .summary-count .lbl {
    font-size: 10.5px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
  }
  .summary-count.pass .num { color: var(--success); }
  .summary-count.fail .num { color: #8a3a2c; }
  .summary-count.todo .num { color: var(--text-muted); }
  .summary-tree {
    border-top: 1px solid var(--border); padding-top: 10px;
    font-size: 12.5px;
  }
  .summary-tree-section { margin-bottom: 8px; }
  .summary-tree-title {
    font-weight: 600; font-size: 12px;
    color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.04em;
    margin-bottom: 5px;
  }
  .summary-tree-row {
    display: flex; gap: 10px; padding: 3px 0;
    align-items: center;
  }
  .summary-tree-row .name { flex: 1; min-width: 0; }
  .summary-tree-row .stats { font-size: 11px; color: var(--text-soft); white-space: nowrap; }
  .summary-tree-row .pill-pass { color: var(--success); font-weight: 600; }
  .summary-tree-row .pill-fail { color: #8a3a2c; font-weight: 600; }
  .summary-tree-row .pill-todo { color: var(--text-muted); }

  .display-only { display: none; }
  .report-banner {
    background: var(--success-soft); color: #2F6754;
    padding: 10px 14px; border-radius: var(--radius);
    font-size: 13px; font-weight: 500; margin-bottom: 14px;
    border: 1px solid #BFD9CB;
  }
  .report-mode .step-check { pointer-events: none; }
  .report-mode .step-tools { display: none; }
  .report-mode .step-extra { display: block; }
  .report-mode .step-extra textarea,
  .report-mode .case-remarks textarea { display: none; }
  .report-mode .case-remarks { display: block; }
  .report-mode .case-remarks-toggle { display: none; }
  .report-mode .display-only { display: block; }
  .report-mode .step-extra input[type="file"] { display: none; }
  .report-mode .ck-footer .edit-only { display: none; }
  .report-mode .ck-toolbar { display: none; }
  .report-mode .case-card.collapsed { /* expand all in report */ }
  .report-mode .case-card.collapsed .case-body { display: block; }
  .report-mode .case-card.collapsed .case-toggle { transform: rotate(0deg); }
  .report-mode .report-summary { display: block; }
  .report-mode .case-outcome .outcome-btn:not(.active) { display: none; }
  /* Marqueur "test non realise" : cache en edition, visible dans le rapport
     uniquement quand AUCUN resultat (pass/fail) n'est actif sur le cas. */
  .outcome-none { display: none; }
  .report-mode .case-outcome:not(:has(.outcome-btn.active)) .outcome-none {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.03em;
    color: #8a3a2c; background: #FBEFEC; border: 1px solid #E8C5BD;
    padding: 4px 10px; border-radius: 999px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .report-mode .shot-tile .shot-rm { display: none; }
  /* Preuves de test : en mode rapport/PDF les captures doivent etre GRANDES et
     NON rognees (sinon elles ne prouvent rien). On passe en 1 colonne pleine
     largeur, image entiere (contain), hauteur naturelle. */
  .report-mode .shot-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .report-mode .shot-tile {
    aspect-ratio: auto;
    border: 1px solid var(--border);
    background: var(--surface-soft);
  }
  .report-mode .shot-tile img {
    width: 100%;
    height: auto;
    max-height: none;
    object-fit: contain;
    cursor: zoom-in;
  }
  .report-mode .step-extra .display-text,
  .report-mode .case-remarks .display-text {
    padding: 5px 7px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    min-height: 34px; font-size: 12.5px; white-space: pre-wrap;
    color: var(--text);
  }
  .report-mode .step-extra .display-text.empty,
  .report-mode .case-remarks .display-text.empty {
    color: var(--text-muted); font-style: italic;
  }
  /* In report mode, hide remark panels that have no content (avoids the
     useless "(aucune remarque)" placeholder appearing everywhere). */
  .report-mode .step-extra.is-empty,
  .report-mode .case-remarks.is-empty { display: none; }
  @media print {
    body { background: white; font-size: 11px; }
    .ck-container { padding: 0; max-width: none; }
    .ck-header, .case-card {
      page-break-inside: avoid; box-shadow: none;
      border-radius: 0; border-color: #ccc;
    }
    .ck-footer { display: none !important; }
    .step-check { border-color: #999 !important; }
    .step-check:checked { background: #5E9A82 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .step-extra, .case-remarks { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-banner { background: #DCEAE3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @page { size: A4; margin: 1.5cm; }
  /* Variable pills */
  .var-pill {
    display: inline-flex; align-items: center;
    padding: 0 8px; margin: 0 1px;
    border-radius: 4px;
    background: var(--primary-soft); color: var(--primary);
    font-size: 12px; font-weight: 500;
    border: 1px solid #C0D2E5;
    line-height: 1.5; vertical-align: baseline;
    white-space: nowrap;
  }
  .var-pill::before { content: '⟨'; opacity: 0.5; margin-right: 2px; }
  .var-pill::after  { content: '⟩'; opacity: 0.5; margin-left: 2px; }
  .var-pill.missing { background: #F4D9D4; color: #8a3a2c; border-color: #E8C5BD; }
  /* Data tables (provided values) */
  .data-section {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px; margin-bottom: 18px;
  }
  .data-section h2 {
    font-size: 15px; margin: 0 0 4px; letter-spacing: -0.01em;
    display: flex; align-items: center; gap: 8px;
  }
  .data-section .subtitle { font-size: 12.5px; color: var(--text-soft); margin: 0 0 14px; }
  .data-table-block { margin-bottom: 14px; }
  .data-table-block:last-child { margin-bottom: 0; }
  .data-table-name {
    font-size: 13px; font-weight: 600; color: var(--text);
    margin-bottom: 6px;
    display: flex; align-items: center; gap: 8px;
  }
  .data-table-name .row-count {
    font-size: 11px; color: var(--text-muted); font-weight: 500;
  }
  .data-table-grid {
    overflow-x: auto;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .data-table-grid table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .data-table-grid th, .data-table-grid td {
    padding: 6px 10px; text-align: left;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }
  .data-table-grid th:last-child, .data-table-grid td:last-child { border-right: none; }
  .data-table-grid tr:last-child td { border-bottom: none; }
  .data-table-grid th {
    background: var(--surface-soft); font-weight: 600;
    color: var(--text-soft); position: sticky; top: 0;
  }
  .case-data-section {
    background: var(--surface-soft); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 8px 10px;
    margin: 4px 0 10px;
  }
  .case-data-title {
    font-size: 10.5px; font-weight: 600; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  .case-data-block { margin-bottom: 8px; }
  .case-data-block:last-child { margin-bottom: 0; }
  .case-data-name {
    font-size: 12px; font-weight: 600; color: var(--text);
    margin-bottom: 4px;
    display: flex; align-items: center; gap: 6px;
  }
  .case-data-name .case-data-count {
    font-size: 10.5px; color: var(--text-muted); font-weight: 500;
  }
  .case-data-empty {
    font-size: 11.5px; color: var(--text-muted);
    font-style: italic; padding: 4px 0;
  }
  @media print {
    .var-pill { background: #DDE6F0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }    .data-section { background: white !important; }
    .data-table-grid th { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .case-data-section { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="ck-container" id="ck-root">
  <div class="display-only report-banner">
    Rapport généré le <span id="report-date"></span>
  </div>

  <header class="ck-header">
    <h1>${escapeHtml(data.title)}</h1>
    <div class="subtitle">${escapeHtml(data.project || 'Projet')} · Liste de tests à exécuter</div>
    <div class="ck-meta">
      <div class="ck-meta-item"><div class="label">Testeur</div><div class="value">${escapeHtml(data.tester)}</div></div>
      <div class="ck-meta-item"><div class="label">Assigné le</div><div class="value">${escapeHtml(data.assignedDate)}</div></div>
      <div class="ck-meta-item"><div class="label">Cas de tests</div><div class="value">${data.cases.length}</div></div>
      <div class="ck-meta-item"><div class="label">Étapes totales</div><div class="value">${data.cases.reduce((a, c) => a + c.steps.length, 0)}</div></div>
    </div>
    <div class="progress-row">
      <div class="progress-bar"><div id="progress-fill" style="width:0%"></div></div>
      <div class="progress-text" id="progress-text">0 / 0 (0%)</div>
    </div>
  </header>

  ${(data.dataTables || []).length > 0 ? `
    <section class="data-section">
      <h2>${ICON.table} Données fournies pour la campagne</h2>
      <p class="subtitle">Valeurs à utiliser quand une variable apparaît dans une étape. Choisissez une ligne adaptée selon le scénario.</p>
      ${data.dataTables.map(t => `
        <div class="data-table-block">
          <div class="data-table-name">
            <span>${escapeHtml(t.name)}</span>
            <span class="row-count">${t.rows.length} ligne${t.rows.length > 1 ? 's' : ''}</span>
          </div>
          ${t.columns.length === 0 ? '<div style="font-size:12.5px;color:var(--text-muted);font-style:italic;">Aucune colonne définie.</div>' : `
            <div class="data-table-grid">
              <table>
                <thead><tr>${t.columns.map(c => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>
                <tbody>
                  ${t.rows.length === 0
                    ? `<tr><td colspan="${t.columns.length}" style="font-style:italic;color:var(--text-muted);text-align:center;">Aucune valeur fournie. Le testeur peut utiliser des données de son choix.</td></tr>`
                    : t.rows.map(r => `<tr>${t.columns.map(c => `<td>${escapeHtml(r[c.id] || '')}</td>`).join('')}</tr>`).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `).join('')}
    </section>
  ` : ''}

  <section class="report-summary" id="report-summary"></section>
  <main id="cases-list"></main>
</div>

<div class="ck-footer">
  <button class="ck-btn edit-only" id="btn-clear">Réinitialiser</button>
  <button class="ck-btn ck-btn-primary edit-only" id="btn-report">Générer le rapport PDF</button>
  <button class="ck-btn display-only" id="btn-edit">Retour en édition</button>
  <button class="ck-btn ck-btn-primary display-only" id="btn-print">Imprimer / Sauver en PDF</button>
</div>

<script>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};
const KEY = "qa-checklist-" + DATA.sessionId;

let progress = (function () {
  try { return JSON.parse(localStorage.getItem(KEY)) || { cases: {}, reportGeneratedAt: null }; }
  catch (e) { return { cases: {}, reportGeneratedAt: null }; }
})();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); }
  catch (e) { console.warn("Persist failed", e); alert("Stockage saturé. Pensez à imprimer le rapport et fermer."); }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Build a quick-lookup map for column resolution */
const TABLE_LOOKUP = (function () {
  const map = {};
  (DATA.dataTables || []).forEach(function (t) {
    map[t.id] = { table: t, columns: {} };
    (t.columns || []).forEach(function (c) { map[t.id].columns[c.id] = c; });
  });
  return map;
})();

function renderTextWithPills(text, caseObj) {
  if (!text) return "";
  const escaped = esc(text);
  // Per-case row selection: pills only use values from those rows.
  const sel = (caseObj && caseObj.dataRowsByTable) || {};
  return escaped.replace(/\\{\\{([^}.]+)\\.([^}]+)\\}\\}/g, function (m, tid, cid) {
    const t = TABLE_LOOKUP[tid];
    if (!t) return '<span class="var-pill missing">?</span>';
    const c = t.columns[cid];
    if (!c) return '<span class="var-pill missing">?</span>';
    const rowIdxs = Array.isArray(sel[tid]) ? sel[tid] : (t.table.rows || []).map(function (_, i) { return i; });
    const values = rowIdxs.map(function (i) {
      const r = (t.table.rows || [])[i];
      return r ? (r[cid] || '') : '';
    }).filter(Boolean);
    if (values.length === 1) {
      return '<span class="var-pill" title="' + esc(t.table.name) + '"><span class="vp-name">' + esc(c.name) + '</span><span class="vp-value">' + esc(values[0]) + '</span></span>';
    }
    if (values.length > 1) {
      const tooltip = t.table.name + ' → ' + c.name + '\\n' + values.map(function (v, i) { return (i + 1) + '. ' + v; }).join('\\n');
      return '<span class="var-pill" data-multi="1" title="' + esc(tooltip) + '"><span class="vp-name">' + esc(c.name) + '</span></span>';
    }
    return '<span class="var-pill" title="' + esc(t.table.name + ' → ' + c.name) + '"><span class="vp-name">' + esc(c.name) + '</span></span>';
  }).replace(/\\n/g, '<br>');
}

function getCaseState(cid) {
  if (!progress.cases[cid]) progress.cases[cid] = { remarks: "", outcome: null, collapsed: false, steps: {} };
  const cs = progress.cases[cid];
  // Migrate older shape that lacks new fields
  if (cs.outcome === undefined) cs.outcome = null;
  if (cs.collapsed === undefined) cs.collapsed = false;
  if (!cs.steps) cs.steps = {};
  return cs;
}

function getStepState(cid, si) {
  const cs = getCaseState(cid);
  if (!cs.steps[si]) cs.steps[si] = { done: false, remarks: "", screenshots: [] };
  // Migrate old single screenshot field → screenshots array
  const ss = cs.steps[si];
  if (!Array.isArray(ss.screenshots)) {
    ss.screenshots = ss.screenshot ? [ss.screenshot] : [];
    delete ss.screenshot;
  }
  return ss;
}

function compressImage(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = function (ev) { img.src = ev.target.result; };
    reader.onerror = function () { reject(new Error("read")); };
    img.onload = function () {
      const maxW = 1200;
      const ratio = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = function () { reject(new Error("img")); };
    reader.readAsDataURL(file);
  });
}

function renderCases() {
  const list = document.getElementById("cases-list");
  let html = "";
  // Toolbar with bulk collapse/expand and live counts
  html += '<div class="ck-toolbar">';
  html += '<div class="summary" id="ck-summary">…</div>';
  html += '<button id="ck-expand-all">Tout déplier</button>';
  html += '<button id="ck-collapse-all">Tout replier</button>';
  html += '</div>';

  DATA.cases.forEach(function (c, ci) {
    const cs = getCaseState(c.id);
    let stepsHtml = "";
    c.steps.forEach(function (s, si) {
      const ss = getStepState(c.id, si);
      const remEmpty = !ss.remarks;
      const remOpen = ss.remarks ? ' open' : '';
      const shots = ss.screenshots || [];
      stepsHtml += '<li class="step-item"><div class="step-row">';
      stepsHtml += '<input type="checkbox" class="step-check" data-step="' + ci + ":" + si + '"' + (ss.done ? " checked" : "") + ">";
      stepsHtml += '<div class="step-content">';
      stepsHtml += '<div class="step-num">Étape ' + (si + 1);
      if (s.fromBlock) {
        const blockLbl = s.fromBlock.missing ? '(bloc supprimé)' : s.fromBlock.name;
        stepsHtml += ' <span class="step-block-tag" title="Étape issue d’un bloc réutilisable">via Bloc « ' + esc(blockLbl) + ' »</span>';
      }
      stepsHtml += "</div>";
      if (s.action) stepsHtml += '<div class="row"><strong>Action :</strong> ' + renderTextWithPills(s.action, c) + "</div>";
      if (s.expected) stepsHtml += '<div class="row"><strong>Résultat attendu :</strong> ' + renderTextWithPills(s.expected, c) + "</div>";

      // Compact tools row: remarks button + (if requested) screenshots button
      stepsHtml += '<div class="step-tools">';
      stepsHtml += '<button type="button" class="step-tool-btn' + (ss.remarks ? ' has-content' : '') + '" data-toggle-remarks="' + ci + ':' + si + '">Remarque' + (ss.remarks ? '' : '…') + '</button>';
      if (s.requiresScreenshot) {
        const shotsCls = shots.length > 0 ? ' has-content' : ' missing-shot';
        stepsHtml += '<button type="button" class="step-tool-btn' + shotsCls + '" data-toggle-shots="' + ci + ':' + si + '">Captures' + (shots.length > 0 ? ' (' + shots.length + ')' : ' requises') + '</button>';
      }
      stepsHtml += '</div>';

      // Remarks panel (hidden until toggled)
      stepsHtml += '<div class="step-extra' + remOpen + (remEmpty ? ' is-empty' : '') + '" data-extra-remarks="' + ci + ':' + si + '">';
      stepsHtml += '<textarea data-remarks="' + ci + ':' + si + '" rows="2" placeholder="Remarque pour cette étape">' + esc(ss.remarks) + "</textarea>";
      stepsHtml += '<div class="display-only display-text' + (remEmpty ? " empty" : "") + '">' + (remEmpty ? "(aucune remarque)" : esc(ss.remarks)) + "</div>";
      stepsHtml += "</div>";

      // Screenshots panel (hidden until toggled, multi-images)
      if (s.requiresScreenshot) {
        const shotsOpen = shots.length > 0 ? ' open' : '';
        stepsHtml += '<div class="step-extra' + shotsOpen + '" data-extra-shots="' + ci + ':' + si + '">';
        stepsHtml += '<input type="file" accept="image/*" multiple data-screenshot="' + ci + ":" + si + '">';
        stepsHtml += '<div class="shot-grid" data-shot-grid="' + ci + ':' + si + '">';
        shots.forEach(function (src, idx) {
          stepsHtml += '<div class="shot-tile"><img src="' + src + '" alt="" data-shot-zoom="' + ci + ':' + si + ':' + idx + '"><button type="button" class="shot-rm" data-shot-rm="' + ci + ':' + si + ':' + idx + '" title="Retirer">×</button></div>';
        });
        stepsHtml += '</div></div>';
      }

      stepsHtml += "</div></div></li>";
    });

    const cDone = c.steps.filter(function (_, si) { return getStepState(c.id, si).done; }).length;
    const isComplete = cDone === c.steps.length && c.steps.length > 0;
    const collapsedCls = cs.collapsed ? ' collapsed' : '';
    const failedCls = cs.outcome === 'fail' ? ' has-failed' : '';
    let statusCls = '';
    let statusTxt = cDone + ' / ' + c.steps.length;
    if (cs.outcome === 'fail') { statusCls = ' failed'; statusTxt = '✗ ' + statusTxt; }
    else if (cs.outcome === 'pass' || isComplete) { statusCls = ' complete'; statusTxt = '✓ ' + statusTxt; }

    html += '<article class="case-card' + collapsedCls + failedCls + '" data-card="' + c.id + '">';
    html += '<div class="case-head" data-toggle-card="' + c.id + '">';
    html += '<div class="case-head-left">';
    html += '<svg class="case-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<h2 class="case-title">' + (ci + 1) + ". " + esc(c.title) + "</h2>";
    html += '</div>';
    html += '<span class="case-status' + statusCls + '" data-case-status="' + c.id + '">' + statusTxt + "</span>";
    html += "</div>";

    html += '<div class="case-body">';
    if (c.environments.length || c.types.length || c.isInterface) {
      html += '<div class="case-badges">';
      c.environments.forEach(function (e) { html += '<span class="badge badge-primary">' + esc(e) + "</span>"; });
      if (c.isInterface) html += '<span class="badge badge-accent">Interface</span>';
      c.types.forEach(function (t) { html += '<span class="badge">' + esc(t) + "</span>"; });
      html += "</div>";
    }

    if (c.jiraTickets && c.jiraTickets.length > 0) {
      html += '<div class="jira-strip">';
      html += '<span class="jira-strip-label">Jira :</span>';
      c.jiraTickets.forEach(function (t) {
        var label = esc(t.key) + (t.summary ? ' — ' + esc(t.summary) : '');
        if (t.url) {
          html += '<a class="jira-pill" href="' + esc(t.url) + '" target="_blank" rel="noopener">' + label + '</a>';
        } else {
          html += '<span class="jira-pill">' + label + '</span>';
        }
      });
      html += "</div>";
    }

    // Per-case data row block: only the rows assigned to this case
    const drBy = c.dataRowsByTable || {};
    const drTids = Object.keys(drBy);
    if (drTids.length > 0) {
      let drHtml = '';
      drTids.forEach(function (tid) {
        const t = TABLE_LOOKUP[tid];
        if (!t) return;
        const idxs = drBy[tid] || [];
        drHtml += '<div class="case-data-block"><div class="case-data-name">' + esc(t.table.name);
        drHtml += ' <span class="case-data-count">' + idxs.length + ' ligne' + (idxs.length > 1 ? 's' : '') + '</span></div>';
        if (idxs.length === 0) {
          drHtml += '<div class="case-data-empty">Aucune ligne sélectionnée pour ce cas.</div>';
        } else if ((t.table.columns || []).length === 0) {
          drHtml += '<div class="case-data-empty">Aucune colonne.</div>';
        } else {
          drHtml += '<div class="data-table-grid"><table><thead><tr>';
          (t.table.columns || []).forEach(function (col) { drHtml += '<th>' + esc(col.name) + '</th>'; });
          drHtml += '</tr></thead><tbody>';
          idxs.forEach(function (i) {
            const r = (t.table.rows || [])[i] || {};
            drHtml += '<tr>';
            (t.table.columns || []).forEach(function (col) { drHtml += '<td>' + esc(r[col.id] || '') + '</td>'; });
            drHtml += '</tr>';
          });
          drHtml += '</tbody></table></div>';
        }
        drHtml += '</div>';
      });
      if (drHtml) {
        html += '<div class="case-data-section"><div class="case-data-title">Données pour ce cas</div>' + drHtml + '</div>';
      }
    }

    if (c.steps.length === 0) {
      html += '<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:4px 0;">Aucune étape définie.</div>';
    } else {
      html += '<ul class="step-list">' + stepsHtml + "</ul>";
    }

    // Outcome buttons + remarks toggle
    html += '<div class="case-outcome">';
    html += '<span class="lbl">Résultat :</span>';
    html += '<button type="button" class="outcome-btn pass' + (cs.outcome === 'pass' ? ' active' : '') + '" data-outcome="' + c.id + ':pass">✓ Réussi</button>';
    html += '<button type="button" class="outcome-btn fail' + (cs.outcome === 'fail' ? ' active' : '') + '" data-outcome="' + c.id + ':fail">✗ Échec</button>';
    html += '<span class="outcome-none">⚠ TEST NON RÉALISÉ</span>';
    html += '</div>';

    const cremEmpty = !cs.remarks;
    const cremOpen = cs.remarks ? ' open' : '';
    html += '<div class="case-remarks-toggle">';
    html += '<button type="button" class="step-tool-btn' + (cs.remarks ? ' has-content' : '') + '" data-toggle-case-remarks="' + c.id + '">Remarque sur le cas' + (cs.remarks ? '' : '…') + '</button>';
    html += '</div>';
    html += '<div class="case-remarks' + cremOpen + (cremEmpty ? ' is-empty' : '') + '" data-case-remarks-panel="' + c.id + '">';
    html += '<textarea data-case-remarks="' + c.id + '" rows="2" placeholder="Remarque générale">' + esc(cs.remarks) + "</textarea>";
    html += '<div class="display-only display-text' + (cremEmpty ? " empty" : "") + '">' + (cremEmpty ? "(aucune remarque)" : esc(cs.remarks)) + "</div>";
    html += "</div>";

    html += "</div>";
    html += "</article>";
  });
  list.innerHTML = html;
  bind();
  updateProgress();
  renderReportSummary();
  updateReportButtonState();
}

function bind() {
  document.querySelectorAll("[data-step]").forEach(function (cb) {
    cb.onchange = function () {
      const parts = cb.dataset.step.split(":");
      const ci = parseInt(parts[0], 10);
      const si = parseInt(parts[1], 10);
      const cid = DATA.cases[ci].id;
      getStepState(cid, si).done = cb.checked;
      persist();
      updateProgress();
      renderReportSummary();
    };
  });
  document.querySelectorAll("[data-remarks]").forEach(function (ta) {
    ta.oninput = function () {
      const parts = ta.dataset.remarks.split(":");
      const ci = parseInt(parts[0], 10);
      const si = parseInt(parts[1], 10);
      const cid = DATA.cases[ci].id;
      getStepState(cid, si).remarks = ta.value;
      persist();
      const display = ta.parentElement.querySelector(".display-text");
      if (display) {
        const empty = !ta.value;
        display.textContent = empty ? "(aucune remarque)" : ta.value;
        display.classList.toggle("empty", empty);
      }
      // Toggle is-empty on the panel so report mode hides it
      ta.parentElement.classList.toggle("is-empty", !ta.value);
      // Reflect on the toggle button state
      const btn = document.querySelector('[data-toggle-remarks="' + ci + ':' + si + '"]');
      if (btn) {
        btn.classList.toggle('has-content', !!ta.value);
        btn.textContent = ta.value ? 'Remarque' : 'Remarque…';
      }
    };
  });
  document.querySelectorAll("[data-case-remarks]").forEach(function (ta) {
    ta.oninput = function () {
      const cid = ta.dataset.caseRemarks;
      getCaseState(cid).remarks = ta.value;
      persist();
      const display = ta.parentElement.querySelector(".display-text");
      if (display) {
        const empty = !ta.value;
        display.textContent = empty ? "(aucune remarque)" : ta.value;
        display.classList.toggle("empty", empty);
      }
      ta.parentElement.classList.toggle("is-empty", !ta.value);
      const btn = document.querySelector('[data-toggle-case-remarks="' + cid + '"]');
      if (btn) {
        btn.classList.toggle('has-content', !!ta.value);
        btn.textContent = ta.value ? 'Remarque sur le cas' : 'Remarque sur le cas…';
      }
    };
  });
  // Multi-screenshot upload
  document.querySelectorAll("[data-screenshot]").forEach(function (input) {
    input.onchange = async function () {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;
      const parts = input.dataset.screenshot.split(":");
      const ci = parseInt(parts[0], 10);
      const si = parseInt(parts[1], 10);
      const cid = DATA.cases[ci].id;
      const ss = getStepState(cid, si);
      for (const f of files) {
        try {
          const dataUrl = await compressImage(f);
          ss.screenshots.push(dataUrl);
        } catch (e) {
          alert("Image illisible : " + (f.name || ""));
        }
      }
      persist();
      input.value = "";
      // Re-render just this step's grid
      refreshStepShots(ci, si);
    };
  });
  // Remove screenshot
  document.querySelectorAll("[data-shot-rm]").forEach(function (btn) {
    btn.onclick = function (ev) {
      ev.stopPropagation();
      const parts = btn.dataset.shotRm.split(":");
      const ci = parseInt(parts[0], 10);
      const si = parseInt(parts[1], 10);
      const idx = parseInt(parts[2], 10);
      const cid = DATA.cases[ci].id;
      const ss = getStepState(cid, si);
      ss.screenshots.splice(idx, 1);
      persist();
      refreshStepShots(ci, si);
    };
  });
  // Zoom screenshot
  document.querySelectorAll("[data-shot-zoom]").forEach(function (img) {
    img.onclick = function () {
      const parts = img.dataset.shotZoom.split(":");
      const ci = parseInt(parts[0], 10);
      const si = parseInt(parts[1], 10);
      const idx = parseInt(parts[2], 10);
      const cid = DATA.cases[ci].id;
      const src = getStepState(cid, si).screenshots[idx];
      showShotZoom(src);
    };
  });
  // Step extras toggles
  document.querySelectorAll("[data-toggle-remarks]").forEach(function (btn) {
    btn.onclick = function () {
      const sel = '[data-extra-remarks="' + btn.dataset.toggleRemarks + '"]';
      const panel = document.querySelector(sel);
      if (panel) {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
          const ta = panel.querySelector("textarea");
          if (ta) ta.focus();
        }
      }
    };
  });
  document.querySelectorAll("[data-toggle-shots]").forEach(function (btn) {
    btn.onclick = function () {
      const sel = '[data-extra-shots="' + btn.dataset.toggleShots + '"]';
      const panel = document.querySelector(sel);
      if (panel) panel.classList.toggle("open");
    };
  });
  document.querySelectorAll("[data-toggle-case-remarks]").forEach(function (btn) {
    btn.onclick = function () {
      const sel = '[data-case-remarks-panel="' + btn.dataset.toggleCaseRemarks + '"]';
      const panel = document.querySelector(sel);
      if (panel) {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
          const ta = panel.querySelector("textarea");
          if (ta) ta.focus();
        }
      }
    };
  });
  // Card collapse / expand
  document.querySelectorAll("[data-toggle-card]").forEach(function (head) {
    head.onclick = function (ev) {
      // Don't collapse if click was on an interactive child (Jira link, status badge content)
      if (ev.target.closest('a')) return;
      const cid = head.dataset.toggleCard;
      const card = document.querySelector('[data-card="' + cid + '"]');
      if (!card) return;
      card.classList.toggle("collapsed");
      getCaseState(cid).collapsed = card.classList.contains("collapsed");
      persist();
    };
  });
  const expandAll = document.getElementById("ck-expand-all");
  if (expandAll) expandAll.onclick = function () {
    DATA.cases.forEach(function (c) { getCaseState(c.id).collapsed = false; });
    persist();
    document.querySelectorAll(".case-card").forEach(function (el) { el.classList.remove("collapsed"); });
  };
  const collapseAll = document.getElementById("ck-collapse-all");
  if (collapseAll) collapseAll.onclick = function () {
    DATA.cases.forEach(function (c) { getCaseState(c.id).collapsed = true; });
    persist();
    document.querySelectorAll(".case-card").forEach(function (el) { el.classList.add("collapsed"); });
  };
  // Outcome buttons
  document.querySelectorAll("[data-outcome]").forEach(function (btn) {
    btn.onclick = function () {
      const parts = btn.dataset.outcome.split(":");
      const cid = parts[0];
      const outcome = parts[1];
      const cs = getCaseState(cid);
      cs.outcome = (cs.outcome === outcome) ? null : outcome;
      persist();
      // Update buttons + status pill + card class
      const card = document.querySelector('[data-card="' + cid + '"]');
      if (card) {
        card.classList.toggle('has-failed', cs.outcome === 'fail');
        card.querySelectorAll('[data-outcome]').forEach(function (b) {
          const o = b.dataset.outcome.split(":")[1];
          b.classList.toggle('active', cs.outcome === o);
        });
      }
      updateProgress();
      renderReportSummary();
    };
  });
}

function refreshStepShots(ci, si) {
  const cid = DATA.cases[ci].id;
  const ss = getStepState(cid, si);
  const grid = document.querySelector('[data-shot-grid="' + ci + ':' + si + '"]');
  if (grid) {
    grid.innerHTML = ss.screenshots.map(function (src, idx) {
      return '<div class="shot-tile"><img src="' + src + '" alt="" data-shot-zoom="' + ci + ':' + si + ':' + idx + '"><button type="button" class="shot-rm" data-shot-rm="' + ci + ':' + si + ':' + idx + '" title="Retirer">×</button></div>';
    }).join('');
    // Re-bind the new tiles
    grid.querySelectorAll('[data-shot-rm]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        const p = btn.dataset.shotRm.split(":");
        const ci2 = parseInt(p[0], 10), si2 = parseInt(p[1], 10), idx2 = parseInt(p[2], 10);
        const cid2 = DATA.cases[ci2].id;
        getStepState(cid2, si2).screenshots.splice(idx2, 1);
        persist();
        refreshStepShots(ci2, si2);
      };
    });
    grid.querySelectorAll('[data-shot-zoom]').forEach(function (img) {
      img.onclick = function () {
        const p = img.dataset.shotZoom.split(":");
        const ci2 = parseInt(p[0], 10), si2 = parseInt(p[1], 10), idx2 = parseInt(p[2], 10);
        const cid2 = DATA.cases[ci2].id;
        showShotZoom(getStepState(cid2, si2).screenshots[idx2]);
      };
    });
  }
  // Update the toggle button label and class
  const btn = document.querySelector('[data-toggle-shots="' + ci + ':' + si + '"]');
  if (btn) {
    const has = ss.screenshots.length > 0;
    btn.classList.toggle('has-content', has);
    btn.classList.toggle('missing-shot', !has);
    btn.textContent = has ? 'Captures (' + ss.screenshots.length + ')' : 'Captures requises';
  }
  updateReportButtonState();
}

/* Walks all cases/steps and counts those that require a screenshot but have none.
   Disables the report button while any are missing, and shows a tooltip explaining why. */
function countMissingShots() {
  let missing = 0;
  DATA.cases.forEach(function (c) {
    c.steps.forEach(function (s, si) {
      if (!s.requiresScreenshot) return;
      const ss = getStepState(c.id, si);
      if (!ss.screenshots || ss.screenshots.length === 0) missing++;
    });
  });
  return missing;
}

function updateReportButtonState() {
  const btn = document.getElementById("btn-report");
  if (!btn) return;
  const missing = countMissingShots();
  const notDone = countNotExecuted();
  // Ne bloque JAMAIS la publication (le testeur doit pouvoir publier un rapport partiel).
  btn.disabled = false;
  if (missing > 0 || notDone > 0) {
    var bits = [];
    if (notDone > 0) bits.push(notDone + ' test' + (notDone > 1 ? 's' : '') + ' sans résultat');
    if (missing > 0) bits.push(missing + ' capture' + (missing > 1 ? 's' : '') + ' manquante' + (missing > 1 ? 's' : ''));
    btn.title = 'Incomplet : ' + bits.join(' · ') + ' — publication possible quand même';
  } else {
    btn.title = '';
  }
}

function showShotZoom(src) {
  let bd = document.getElementById("shot-zoom-bd");
  if (!bd) {
    bd = document.createElement("div");
    bd.id = "shot-zoom-bd";
    bd.className = "shot-zoom-backdrop";
    bd.innerHTML = '<img alt="">';
    bd.onclick = function () { bd.classList.remove("open"); };
    document.body.appendChild(bd);
  }
  bd.querySelector("img").src = src;
  bd.classList.add("open");
}

function renderReportSummary() {
  const root = document.getElementById("report-summary");
  if (!root) return;
  // Compute pass / fail / pending across all cases
  let pass = 0, fail = 0, pending = 0;
  DATA.cases.forEach(function (c) {
    const cs = getCaseState(c.id);
    if (cs.outcome === 'pass') pass++;
    else if (cs.outcome === 'fail') fail++;
    else pending++;
  });
  const total = DATA.cases.length;
  let html = '<h2>Résumé d’exécution</h2>';
  html += '<div class="summary-counts">';
  html += '<div class="summary-count pass"><span class="num">' + pass + '</span><span class="lbl">Réussis</span></div>';
  html += '<div class="summary-count fail"><span class="num">' + fail + '</span><span class="lbl">Échecs</span></div>';
  html += '<div class="summary-count todo"><span class="num">' + pending + '</span><span class="lbl">Non réalisés</span></div>';
  html += '<div class="summary-count"><span class="num">' + total + '</span><span class="lbl">Total</span></div>';
  html += '</div>';
  // Hierarchy: structure (suites/groupes) → cases
  if (DATA.structure && DATA.structure.length > 0) {
    html += '<div class="summary-tree">';
    DATA.structure.forEach(function (group) {
      html += '<div class="summary-tree-section">';
      html += '<div class="summary-tree-title">' + esc(group.name) + '</div>';
      let gPass = 0, gFail = 0, gPending = 0;
      group.caseIds.forEach(function (cid) {
        const c = DATA.cases.find(function (x) { return x.id === cid; });
        if (!c) return;
        const cs = getCaseState(cid);
        let pillCls = 'pill-todo', pillTxt = '⚠ Non réalisé';
        if (cs.outcome === 'pass') { pillCls = 'pill-pass'; pillTxt = '✓ Réussi'; gPass++; }
        else if (cs.outcome === 'fail') { pillCls = 'pill-fail'; pillTxt = '✗ Échec'; gFail++; }
        else gPending++;
        html += '<div class="summary-tree-row">';
        html += '<span class="name">' + esc(c.title) + '</span>';
        html += '<span class="stats ' + pillCls + '">' + pillTxt + '</span>';
        html += '</div>';
      });
      // Group totals row
      html += '<div class="summary-tree-row" style="border-top:1px dashed var(--border);margin-top:4px;padding-top:4px;font-weight:500;">';
      html += '<span class="name" style="font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Sous-total</span>';
      html += '<span class="stats">';
      if (gPass > 0) html += '<span class="pill-pass">' + gPass + ' ✓</span>  ';
      if (gFail > 0) html += '<span class="pill-fail">' + gFail + ' ✗</span>  ';
      if (gPending > 0) html += '<span class="pill-todo">' + gPending + ' …</span>';
      html += '</span></div>';
      html += '</div>';
    });
    html += '</div>';
  }
  // Update toolbar summary
  const tb = document.getElementById("ck-summary");
  if (tb) {
    tb.innerHTML = '<strong>' + pass + '</strong> réussis · <strong>' + fail + '</strong> échecs · <strong>' + pending + '</strong> non réalisés';
  }
  root.innerHTML = html;
}

function updateProgress() {
  let total = 0, done = 0;
  DATA.cases.forEach(function (c) {
    c.steps.forEach(function (_, si) {
      total++;
      if (getStepState(c.id, si).done) done++;
    });
    const cDone = c.steps.filter(function (_, si) { return getStepState(c.id, si).done; }).length;
    const isComplete = cDone === c.steps.length && c.steps.length > 0;
    const statusEl = document.querySelector('[data-case-status="' + c.id + '"]');
    if (statusEl) {
      statusEl.textContent = cDone + " / " + c.steps.length;
      statusEl.classList.toggle("complete", isComplete);
    }
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-text").textContent = done + " / " + total + " (" + pct + "%)";
}

function countNotExecuted() {
  return DATA.cases.filter(function (c) { return !getCaseState(c.id).outcome; }).length;
}

function generateReport() {
  // On ne BLOQUE plus la publication : on rappelle simplement ce qui reste, et le
  // testeur decide. Les cas sans resultat seront marques "TEST NON RÉALISÉ" dans le rapport.
  const missing = countMissingShots();
  const notDone = countNotExecuted();
  if (missing > 0 || notDone > 0) {
    var msg = "Certains points ne sont pas complétés :\\n";
    if (notDone > 0) msg += "\\n• " + notDone + " test" + (notDone > 1 ? "s" : "") + " sans résultat → marqué" + (notDone > 1 ? "s" : "") + " « TEST NON RÉALISÉ » dans le rapport";
    if (missing > 0) msg += "\\n• " + missing + " capture" + (missing > 1 ? "s" : "") + " obligatoire" + (missing > 1 ? "s" : "") + " manquante" + (missing > 1 ? "s" : "");
    msg += "\\n\\nGénérer le rapport quand même ?";
    if (!confirm(msg)) return;
  }
  if (!progress.reportGeneratedAt) progress.reportGeneratedAt = new Date().toISOString();
  persist();
  document.getElementById("ck-root").classList.add("report-mode");
  document.getElementById("report-date").textContent = new Date(progress.reportGeneratedAt).toLocaleString("fr-CH");
  window.scrollTo(0, 0);
  setTimeout(function () { window.print(); }, 350);
}

function exitReport() {
  document.getElementById("ck-root").classList.remove("report-mode");
}

function clearAll() {
  if (!confirm("Réinitialiser toutes les saisies ? Cette action est irréversible.")) return;
  progress = { cases: {}, reportGeneratedAt: null };
  persist();
  renderCases();
}

document.getElementById("btn-report").onclick = generateReport;
document.getElementById("btn-edit").onclick = exitReport;
document.getElementById("btn-print").onclick = function () { window.print(); };
document.getElementById("btn-clear").onclick = clearAll;

renderCases();

if (progress.reportGeneratedAt) {
  document.getElementById("ck-root").classList.add("report-mode");
  document.getElementById("report-date").textContent = new Date(progress.reportGeneratedAt).toLocaleString("fr-CH");
}
<\/script>
</body>
</html>`;
}

