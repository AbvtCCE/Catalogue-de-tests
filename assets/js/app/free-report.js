/* Catalogue de tests — module « free-report.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ============================================================
   Rapport libre (QA Manager uniquement)
   Composition texte + photos, SANS passer par les cas de test,
   puis telechargement d'un HTML autonome imprimable en PDF.
   Choix retenu : "telechargement seul" => rien n'est persiste ni
   synchronise (aucun impact sur data.json / GitHub).
   ============================================================ */
let freeReport = null;

function frEnsure() {
  if (freeReport) return;
  const sess = (window.QASession && QASession.get()) || {};
  freeReport = {
    title: '',
    author: sess.username || '',
    dateStr: new Date().toISOString().slice(0, 10),
    intro: '',
    sections: [],
  };
}

function frViewEl() { return document.getElementById('view-reportbuilder'); }

function frAddSection() {
  frEnsure();
  freeReport.sections.push({ id: uid(), heading: '', text: '', images: [] });
  renderReportBuilder(frViewEl());
}

function frRemoveSection(id) {
  freeReport.sections = freeReport.sections.filter(s => s.id !== id);
  renderReportBuilder(frViewEl());
}

function frMoveSection(id, dir) {
  const arr = freeReport.sections;
  const i = arr.findIndex(s => s.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  renderReportBuilder(frViewEl());
}

async function frAddImages(sectionId, fileList) {
  const sec = freeReport.sections.find(s => s.id === sectionId);
  if (!sec) return;
  const files = Array.from(fileList || []);
  for (const f of files) {
    if (!f.type || f.type.indexOf('image/') !== 0) continue;
    try {
      // Downscale (max 1400px) pour rester lisible en preuve tout en limitant le poids.
      const dataUrl = await compressImage(f, 1400, 0.72);
      sec.images.push(dataUrl);
    } catch (e) { toast('Image illisible : ' + (f.name || '')); }
  }
  renderReportBuilder(frViewEl());
}

function frRemoveImage(sectionId, idx) {
  const sec = freeReport.sections.find(s => s.id === sectionId);
  if (!sec) return;
  sec.images.splice(idx, 1);
  renderReportBuilder(frViewEl());
}

function renderReportBuilder(view) {
  if (!view) return;
  frEnsure();
  const fr = freeReport;
  const eA = escapeHtml; // sûr aussi pour les attributs (échappe " et ')

  const sectionsHtml = fr.sections.map((s, i) => `
    <div class="card frb-section" data-sec="${s.id}">
      <div class="frb-sec-head">
        <span class="frb-sec-num">Section ${i + 1}</span>
        <div class="frb-sec-tools">
          <button class="btn-icon btn-ghost" data-fr-up="${s.id}" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon btn-ghost" data-fr-down="${s.id}" title="Descendre" ${i === fr.sections.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-icon btn-ghost" data-fr-del="${s.id}" title="Supprimer la section">${ICON.trash}</button>
        </div>
      </div>
      <div class="form-row">
        <label>Titre de section (optionnel)</label>
        <input type="text" data-fr-heading="${s.id}" value="${eA(s.heading)}" placeholder="Ex. Contexte, Résultats, Conclusion…">
      </div>
      <div class="form-row">
        <label>Texte</label>
        <textarea data-fr-text="${s.id}" rows="4" placeholder="Décrivez le test, l'observation, la preuve…">${escapeHtml(s.text)}</textarea>
      </div>
      <div class="form-row">
        <label>Photos</label>
        <input type="file" accept="image/*" multiple data-fr-files="${s.id}">
        <div class="frb-thumbs">
          ${s.images.map((src, idx) => `<div class="frb-thumb"><img src="${src}" alt="" data-fr-zoom="${s.id}:${idx}"><button type="button" class="frb-thumb-rm" data-fr-imgrm="${s.id}:${idx}" title="Retirer">×</button></div>`).join('')}
        </div>
      </div>
    </div>`).join('');

  view.innerHTML = `
    <style>
      .frb-meta { display:grid; grid-template-columns: 2fr 1fr 1fr; gap:12px; }
      @media (max-width:700px){ .frb-meta{ grid-template-columns:1fr; } }
      .frb-section { position:relative; }
      .frb-sec-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .frb-sec-num { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); }
      .frb-sec-tools { display:flex; gap:4px; }
      .frb-thumbs { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; margin-top:8px; }
      .frb-thumb { position:relative; aspect-ratio:4/3; border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; background:var(--surface-soft); }
      .frb-thumb img { width:100%; height:100%; object-fit:cover; cursor:zoom-in; }
      .frb-thumb-rm { position:absolute; top:3px; right:3px; width:22px; height:22px; border:none; border-radius:50%; background:rgba(31,41,55,.7); color:#fff; cursor:pointer; font-size:14px; line-height:1; display:grid; place-items:center; }
      .frb-actions { display:flex; align-items:center; gap:8px; margin-top:16px; flex-wrap:wrap; }
      .frb-empty { text-align:center; color:var(--text-muted); font-style:italic; }
    </style>
    <div class="page-header">
      <div>
        <h1>Rapport libre</h1>
        <div class="subtitle">Composez un rapport de tests (texte + photos) sans passer par les cas de test, puis téléchargez-le en HTML à imprimer en PDF. Rien n'est enregistré ni synchronisé.</div>
      </div>
    </div>

    <div class="card">
      <div class="frb-meta">
        <div class="form-row"><label>Titre du rapport</label><input type="text" id="fr-title" value="${eA(fr.title)}" placeholder="Ex. Rapport de tests — Release 2.4"></div>
        <div class="form-row"><label>Auteur</label><input type="text" id="fr-author" value="${eA(fr.author)}"></div>
        <div class="form-row"><label>Date</label><input type="date" id="fr-date" value="${eA(fr.dateStr)}"></div>
      </div>
      <div class="form-row" style="margin-top:12px;"><label>Introduction / contexte (optionnel)</label><textarea id="fr-intro" rows="3" placeholder="Portée, environnement, objectif du rapport…">${escapeHtml(fr.intro)}</textarea></div>
    </div>

    ${fr.sections.length ? sectionsHtml : '<div class="card frb-empty">Aucune section pour l’instant. Ajoutez une section (texte et/ou photos).</div>'}

    <div class="frb-actions">
      <button class="btn" id="fr-add">${ICON.plus}<span>Ajouter une section</span></button>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" id="fr-preview">${ICON.externalLink}<span>Aperçu</span></button>
      <button class="btn btn-primary" id="fr-generate">${ICON.print}<span>Télécharger le rapport (HTML)</span></button>
    </div>`;

  const byId = id => document.getElementById(id);
  byId('fr-title').oninput = e => { fr.title = e.target.value; };
  byId('fr-author').oninput = e => { fr.author = e.target.value; };
  byId('fr-date').oninput = e => { fr.dateStr = e.target.value; };
  byId('fr-intro').oninput = e => { fr.intro = e.target.value; };
  byId('fr-add').onclick = frAddSection;
  byId('fr-preview').onclick = () => frGenerate(true);
  byId('fr-generate').onclick = () => frGenerate(false);

  view.querySelectorAll('[data-fr-heading]').forEach(el => { el.oninput = () => { const s = fr.sections.find(x => x.id === el.dataset.frHeading); if (s) s.heading = el.value; }; });
  view.querySelectorAll('[data-fr-text]').forEach(el => { el.oninput = () => { const s = fr.sections.find(x => x.id === el.dataset.frText); if (s) s.text = el.value; }; });
  view.querySelectorAll('[data-fr-files]').forEach(el => { el.onchange = e => { frAddImages(el.dataset.frFiles, e.target.files); e.target.value = ''; }; });
  view.querySelectorAll('[data-fr-up]').forEach(el => { el.onclick = () => frMoveSection(el.dataset.frUp, -1); });
  view.querySelectorAll('[data-fr-down]').forEach(el => { el.onclick = () => frMoveSection(el.dataset.frDown, 1); });
  view.querySelectorAll('[data-fr-del]').forEach(el => { el.onclick = () => confirmDialog('Supprimer cette section ?', () => frRemoveSection(el.dataset.frDel)); });
  view.querySelectorAll('[data-fr-imgrm]').forEach(el => { el.onclick = () => { const p = el.dataset.frImgrm.split(':'); frRemoveImage(p[0], parseInt(p[1], 10)); }; });
  view.querySelectorAll('[data-fr-zoom]').forEach(el => { el.onclick = () => { const p = el.dataset.frZoom.split(':'); const s = fr.sections.find(x => x.id === p[0]); if (s) openImageViewer(s.images[parseInt(p[1], 10)]); }; });
}

function frGenerate(preview) {
  frEnsure();
  const fr = freeReport;
  const hasContent = fr.sections.some(s => (s.heading && s.heading.trim()) || (s.text && s.text.trim()) || (s.images && s.images.length));
  if (!fr.title.trim() && !hasContent) { toast('Ajoutez au moins un titre ou une section.'); return; }
  const html = buildFreeReportHTML(fr);
  if (preview) {
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else toast('Fenêtre bloquée par le navigateur (autorisez les pop-ups).');
    return;
  }
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = s => String(s || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'rapport';
  a.download = 'rapport-' + safe(fr.title) + '-' + (fr.dateStr || '') + '.html';
  a.click();
  URL.revokeObjectURL(url);
  toast('Rapport téléchargé — ouvrez-le puis Ctrl+P → « Enregistrer en PDF ».');
}

function buildFreeReportHTML(fr) {
  const esc = escapeHtml;
  let dateLabel = '';
  try { dateLabel = fr.dateStr ? new Date(fr.dateStr + 'T00:00:00').toLocaleDateString('fr-CH') : ''; }
  catch (e) { dateLabel = fr.dateStr || ''; }
  const sections = fr.sections.map(s => {
    let inner = '';
    if (s.heading && s.heading.trim()) inner += '<h2 class="sec-title">' + esc(s.heading) + '</h2>';
    if (s.text && s.text.trim()) inner += '<div class="sec-text">' + esc(s.text) + '</div>';
    if (s.images && s.images.length) {
      inner += '<div class="sec-shots">' + s.images.map(src => '<figure class="shot"><img src="' + src + '" alt=""></figure>').join('') + '</div>';
    }
    return inner ? '<section class="report-section">' + inner + '</section>' : '';
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport · ${esc(fr.title || 'Rapport de tests')}</title>
<style>
  :root { --ink:#1F2937; --soft:#5B6472; --line:#E5E7EB; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--ink); background:#f3f4f6; margin:0; padding:24px; line-height:1.55; }
  .toolbar { max-width: 820px; margin: 0 auto 16px; display:flex; justify-content:flex-end; }
  .toolbar button { font: inherit; font-size:13px; font-weight:600; padding:8px 14px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; cursor:pointer; }
  .doc { max-width: 820px; margin: 0 auto; background:#fff; padding: 40px 44px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .doc-head h1 { font-size: 24px; margin:0 0 10px; letter-spacing:-0.01em; }
  .doc-meta { display:flex; gap:18px; flex-wrap:wrap; font-size:13px; color:var(--soft); margin-bottom:14px; }
  .doc-intro { white-space: pre-wrap; font-size:14px; background:#f8fafc; border:1px solid var(--line); border-radius:6px; padding:12px 14px; }
  .report-section { margin-top: 26px; padding-top: 18px; border-top:1px solid var(--line); }
  .report-section:first-of-type { border-top:none; }
  .sec-title { font-size: 17px; margin:0 0 8px; }
  .sec-text { white-space: pre-wrap; font-size: 14px; margin-bottom: 12px; }
  .sec-shots { display:flex; flex-direction:column; gap:14px; }
  .shot { margin:0; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#fafafa; }
  .shot img { display:block; width:100%; height:auto; }
  .empty { color:#9AA0A8; font-style:italic; }
  @media print {
    body { background:#fff; padding:0; }
    .no-print { display:none !important; }
    .doc { box-shadow:none; border-radius:0; max-width:none; padding:0; }
    .report-section { page-break-inside: avoid; }
    .shot { page-break-inside: avoid; }
    .shot img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @page { size: A4; margin: 1.4cm; }
</style>
</head>
<body>
  <div class="toolbar no-print"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  <div class="doc">
    <header class="doc-head">
      <h1>${esc(fr.title || 'Rapport de tests')}</h1>
      <div class="doc-meta">
        ${fr.author ? '<span><strong>Auteur :</strong> ' + esc(fr.author) + '</span>' : ''}
        ${dateLabel ? '<span><strong>Date :</strong> ' + esc(dateLabel) + '</span>' : ''}
      </div>
      ${fr.intro && fr.intro.trim() ? '<div class="doc-intro">' + esc(fr.intro) + '</div>' : ''}
    </header>
    ${sections || '<p class="empty">(Rapport vide)</p>'}
  </div>
</body>
</html>`;
}

