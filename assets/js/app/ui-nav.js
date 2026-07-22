/* Catalogue de tests — module « ui-nav.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ===== Navigation ===== */
const TABS = [
  { id: 'dashboard',    label: 'Tableau de bord', resource: 'dashboard',    group: null,       icon: ICON.dashboard, render: renderDashboard    },
  { id: 'testcases',    label: 'Cas de tests',    resource: 'testcases',    group: 'Tests',    icon: ICON.case,      render: renderTestCases    },
  { id: 'blocks',       label: "Blocs d'étapes", resource: 'stepblocks',  group: 'Tests',    icon: ICON.layers,    render: renderStepBlocks   },
  { id: 'testsuites',   label: 'Suites',          resource: 'testsuites',   group: 'Tests',    icon: ICON.suite,     render: renderTestSuites   },
  { id: 'testplans',    label: 'Plans',           resource: 'testplans',    group: 'Tests',    icon: ICON.plan,      render: renderTestPlans    },
  { id: 'anomalies',    label: 'Anomalies',       resource: 'anomalies',    group: null,       icon: ICON.bug,       render: renderAnomalies    },
  { id: 'projects',     label: 'Projets',         resource: 'projects',     group: 'Données', icon: ICON.calendar,  render: renderProjects     },
  { id: 'data',         label: 'Tables de données', resource: 'dataTables', group: 'Données', icon: ICON.table, render: renderDataTables   },
  { id: 'environments', label: 'Environnements',  resource: 'environments', group: 'Données', icon: ICON.env,    render: renderEnvironments },
  { id: 'testers',      label: 'Testeurs',        resource: 'testers',      group: 'Équipe', icon: ICON.users,    render: renderTesters      },
  { id: 'reportbuilder',label: 'Rapport libre',   resource: 'reportBuilder',group: 'Rapports',icon: ICON.checklist, render: renderReportBuilder },
  { id: 'export',       label: 'Export / Import', resource: 'export',       group: 'Système',icon: ICON.export,    render: renderExport       },
];

function visibleTabs() {
  return TABS.filter(t => !window.QAPerm || QAPerm.canRead(t.resource));
}

function buildNav() {
  const nav = document.getElementById('nav');
  const tabs = visibleTabs();
  const html = [];
  let lastGroup = undefined;
  tabs.forEach(t => {
    if (t.group !== lastGroup) {
      if (t.group) html.push(`<div class="nav-section">${escapeHtml(t.group)}</div>`);
      lastGroup = t.group;
    }
    const nested = t.group ? ' nested' : '';
    html.push(`<button class="nav-btn${nested} ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.icon}<span>${escapeHtml(t.label)}</span></button>`);
  });
  nav.innerHTML = html.join('');
  nav.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
}

function switchTab(id) {
  // Si l'utilisateur n'a pas le droit de lire cet onglet, retombe sur le dashboard.
  const tab = TABS.find(t => t.id === id);
  if (!tab || (window.QAPerm && !QAPerm.canRead(tab.resource))) {
    id = 'dashboard';
  }
  currentTab = id;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById('view-' + id);
  view.classList.add('active');
  TABS.find(t => t.id === id).render(view);
  if (window.QAPerm) QAPerm.applyPermissionGates(view);
}

/* ===== Modal helpers ===== */
function openModal(title, bodyHtml, footerHtml, onMount) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-backdrop').classList.add('open');
  if (onMount) onMount(document.getElementById('modal-body'));
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  tooltip.hide();
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.dataset.closeModal !== undefined || e.target.closest('[data-close-modal]')) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeImageViewer(); } });

function confirmDialog(message, onConfirm) {
  openModal('Confirmer',
    `<p style="margin:0;font-size:14px;color:var(--text-soft);">${escapeHtml(message)}</p>`,
    `<button class="btn" data-close-modal>Annuler</button>
     <button class="btn btn-danger" id="confirm-yes">Confirmer</button>`
  );
  document.getElementById('confirm-yes').onclick = () => { closeModal(); onConfirm(); };
}

function openImageViewer(src) {
  document.getElementById('image-viewer-img').src = src;
  document.getElementById('image-viewer').classList.add('open');
}
function closeImageViewer() { document.getElementById('image-viewer').classList.remove('open'); }
document.getElementById('image-viewer').addEventListener('click', closeImageViewer);

