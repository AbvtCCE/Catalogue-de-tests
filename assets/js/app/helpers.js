/* Catalogue de tests — module « helpers.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ===== Utils ===== */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const formatMin = (m) => {
  if (!m && m !== 0) return '—';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + ' h ' + r : h + ' h';
};
const sumBy = (arr, fn) => arr.reduce((a, x) => a + (fn(x) || 0), 0);
const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
};

/* ===== Tooltip (delegated) =====
   Any element with [data-tip="..."] gets a styled tooltip on hover/focus.
*/
const tooltip = (() => {
  let el, currentTarget = null;
  function ensure() {
    if (!el) {
      el = document.createElement('div');
      el.className = 'tooltip';
      document.body.appendChild(el);
    }
    return el;
  }
  function show(target) {
    const text = target.dataset.tip;
    if (!text) return;
    const t = ensure();
    t.textContent = text;
    t.classList.add('show');
    // Measure after content set
    const r = target.getBoundingClientRect();
    const tw = t.offsetWidth;
    const th = t.offsetHeight;
    const margin = 8;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - 10;
    let arrow = 'bottom';
    if (top < margin) { top = r.bottom + 10; arrow = 'top'; }
    const clampedLeft = Math.max(margin, Math.min(window.innerWidth - tw - margin, left));
    const targetCenterX = r.left + r.width / 2;
    const arrowX = targetCenterX - clampedLeft;
    t.style.left = clampedLeft + 'px';
    t.style.top = top + 'px';
    t.style.setProperty('--arrow-x', arrowX + 'px');
    t.dataset.arrow = arrow;
  }
  function hide() {
    if (el) el.classList.remove('show');
    currentTarget = null;
  }
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest && e.target.closest('[data-tip]');
    if (target && target !== currentTarget) {
      currentTarget = target;
      show(target);
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (!currentTarget) return;
    const next = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-tip]') : null;
    if (next === currentTarget) return;
    hide();
  });
  document.addEventListener('focusin', (e) => {
    const target = e.target.closest && e.target.closest('[data-tip]');
    if (target) { currentTarget = target; show(target); }
  });
  document.addEventListener('focusout', () => hide());
  // Hide on scroll/resize to avoid stale positioning
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  return { hide };
})();
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/* ===== Folder logic =====
   - 1 environnement → dossier de cet environnement
   - 2+ environnements → dossier "Transverse"
   - flag isInterface → dossier "Interfaces" (prioritaire)
*/
function folderOf(tc) {
  if (tc.isInterface) return { id: '__interfaces', name: 'Interfaces', kind: 'interfaces' };
  if (tc.environmentIds.length >= 2) return { id: '__transverse', name: 'Transverse', kind: 'transverse' };
  if (tc.environmentIds.length === 1) {
    const env = state.environments.find(e => e.id === tc.environmentIds[0]);
    return { id: env ? env.id : '__none', name: env ? env.title : 'Sans environnement', kind: 'env' };
  }
  return { id: '__none', name: 'Sans environnement', kind: 'env' };
}

/* ===== Cooperative test linking =====
   A case can be linked to one or more other cases (bidirectionally) so that
   different groups can each maintain their own variant of « the same » test.
   When linked cases appear in the same plan, they are deduplicated and the
   surviving one is tagged as « Coopératif ». */
function linkGroupOf(caseId) {
  const group = new Set();
  const queue = [caseId];
  while (queue.length) {
    const id = queue.shift();
    if (group.has(id)) continue;
    group.add(id);
    const c = state.testCases.find(x => x.id === id);
    if (c && Array.isArray(c.linkedCaseIds)) {
      c.linkedCaseIds.forEach(lid => { if (!group.has(lid)) queue.push(lid); });
    }
  }
  return group;
}

/* For a plan, compute which cases were deduplicated as cooperative.
   Returns Map<keptCaseId, Set<otherLinkedIdsAlsoListed>>. */
function planCooperativeMap(plan) {
  const result = new Map();
  const keptOf = new Map(); // caseId -> caseId actually kept in the plan
  (plan.items || []).forEach(item => {
    casesOfPlanItem(item).forEach(c => {
      if (keptOf.has(c.id)) return;
      const group = linkGroupOf(c.id);
      let keptId = null;
      group.forEach(id => { if (keptOf.has(id)) keptId = keptOf.get(id); });
      if (keptId) {
        keptOf.set(c.id, keptId);
        if (!result.has(keptId)) result.set(keptId, new Set());
        result.get(keptId).add(c.id);
      } else {
        keptOf.set(c.id, c.id);
      }
    });
  });
  return result;
}

/* ===== Anomaly counts ===== */
function anomaliesForCase(caseId) {
  return (state.anomalies || []).filter(a => (a.testCaseIds || []).includes(caseId));
}
function anomaliesForCaseIds(caseIds) {
  const set = caseIds instanceof Set ? caseIds : new Set(caseIds);
  return (state.anomalies || []).filter(a => (a.testCaseIds || []).some(id => set.has(id)));
}
function anomalyCountForCase(caseId) { return anomaliesForCase(caseId).length; }
function anomalyCountForSuite(suiteId) {
  const s = state.testSuites.find(x => x.id === suiteId);
  if (!s) return 0;
  return anomaliesForCaseIds(s.testCaseIds || []).length;
}

/* ===== Suite metadata =====
   Suites don't carry their own env/types/folder — everything is derived
   from the test cases they contain. Order is preserved (testCaseIds order).
*/
function suiteMetadata(suite) {
  const cases = (suite.testCaseIds || [])
    .map(id => state.testCases.find(c => c.id === id))
    .filter(Boolean);
  const envIds = [...new Set(cases.flatMap(c => c.environmentIds || []))];
  const types = [...new Set(cases.flatMap(c => c.types || []))];
  const ready = cases.filter(c => c.ready).length;
  const automated = cases.filter(c => c.automated).length;
  const time = cases.reduce((acc, c) => acc + (Number(c.estimatedTime) || 0), 0);
  let folder;
  if (envIds.length === 0) {
    folder = { id: '__empty', name: 'Vide', kind: 'env' };
  } else if (envIds.length === 1) {
    const env = state.environments.find(e => e.id === envIds[0]);
    folder = { id: envIds[0], name: env ? env.title : 'Environnement supprimé', kind: 'env' };
  } else {
    folder = { id: '__transverse', name: 'Transverse', kind: 'transverse' };
  }
  return { cases, envIds, types, ready, automated, time, folder };
}

function suiteDisplayTitle(suite) {
  const meta = suiteMetadata(suite);
  // Suffix only when a single env is shared by all cases — for transverse
  // the folder grouping/badge already conveys it
  if (meta.envIds.length === 1) return `${suite.title} — ${meta.folder.name}`;
  return suite.title;
}

/* ===== Plan data model =====
   New model: plan.items = [{type:'suite'|'case', id}, ...] — preserves
   ordered execution flow that mixes suites and individual cases.
   Old model (plan.suiteIds, plan.testCaseIds) is auto-migrated on load.
*/
function migratePlan(p) {
  if (p.items) return p;
  const items = [
    ...(p.suiteIds || []).map(id => ({ type: 'suite', id })),
    ...(p.testCaseIds || []).map(id => ({ type: 'case', id })),
  ];
  return { id: p.id, title: p.title, items };
}

/* Walk plan items in order, returning the cases.
   dedupe=true: each case appears once (for counts/metadata)
   dedupe=false: preserves duplicates if the user intentionally listed a
   case both directly and via a suite (for execution checklist)
*/
function collectPlanCases(plan, dedupe = true) {
  const cases = [];
  const seen = new Set(); // tracks all caseIds in already-listed link groups
  const addCase = (c) => {
    cases.push(c);
    if (dedupe) linkGroupOf(c.id).forEach(id => seen.add(id));
  };
  (plan.items || []).forEach(item => {
    if (item.type === 'suite') {
      const s = state.testSuites.find(x => x.id === item.id);
      if (!s) return;
      (s.testCaseIds || []).forEach(cid => {
        if (dedupe && seen.has(cid)) return;
        const c = state.testCases.find(x => x.id === cid);
        if (c) addCase(c);
      });
    } else if (item.type === 'case') {
      if (dedupe && seen.has(item.id)) return;
      const c = state.testCases.find(x => x.id === item.id);
      if (c) addCase(c);
    }
  });
  return cases;
}

function planMetadata(plan) {
  const cases = collectPlanCases(plan, true);
  const envIds = [...new Set(cases.flatMap(c => c.environmentIds || []))];
  const types = [...new Set(cases.flatMap(c => c.types || []))];
  const ready = cases.filter(c => c.ready).length;
  const automated = cases.filter(c => c.automated).length;
  const time = cases.reduce((acc, c) => acc + (Number(c.estimatedTime) || 0), 0);
  const suiteCount = (plan.items || []).filter(i => i.type === 'suite').length;
  const directCount = (plan.items || []).filter(i => i.type === 'case').length;
  let folder;
  if (envIds.length === 0) {
    folder = { id: '__empty', name: 'Vide', kind: 'env' };
  } else if (envIds.length === 1) {
    const env = state.environments.find(e => e.id === envIds[0]);
    folder = { id: envIds[0], name: env ? env.title : 'Environnement supprimé', kind: 'env' };
  } else {
    folder = { id: '__transverse', name: 'Transverse', kind: 'transverse' };
  }
  return { cases, envIds, types, ready, automated, time, suiteCount, directCount, folder };
}

function planDisplayTitle(plan) {
  const meta = planMetadata(plan);
  if (meta.envIds.length === 1) return `${plan.title} — ${meta.folder.name}`;
  return plan.title;
}

