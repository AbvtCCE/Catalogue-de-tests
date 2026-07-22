/* Catalogue de tests — module « persistence.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ===== File System Access (sync vers fichier disque) =====
   FileSystemFileHandle is structured-cloneable and can be persisted in
   IndexedDB. Permissions don't auto-restore: we re-query on each save
   and request silently — if the browser declines, we keep going on
   IndexedDB only.
*/
async function syncToFile() {
  if (!fileHandle) return false;
  try {
    let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await fileHandle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') return false;
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.warn('File sync error', e);
    return false;
  }
}

async function connectFile() {
  if (!HAS_FILE_API) { toast('Navigateur non compatible (Chrome/Edge requis)'); return; }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'qa-catalog.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    fileHandle = handle;
    await dbSet('fileHandle', handle);
    const ok = await syncToFile();
    toast(ok ? 'Fichier connecté · synchronisation auto' : 'Fichier connecté, mais écriture initiale échouée');
    updateFileBanner();
    updateStorageIndicator();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Erreur: ' + e.message);
  }
}

async function loadFromFile() {
  if (!HAS_FILE_API) { toast('Navigateur non compatible (Chrome/Edge requis)'); return; }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.environments || !data.testCases) throw new Error('Format invalide');
    confirmDialog(`Charger ${handle.name} et activer la sync sur ce fichier ? Les données actuelles seront remplacées.`, async () => {
      fileHandle = handle;
      await dbSet('fileHandle', handle);
      state = Object.assign({ project: { name: '', startDate: '', endDate: '' }, environments: [], testCases: [], testSuites: [], testPlans: [] }, data);
      await save();
      switchTab('dashboard');
      updateFileBanner();
      toast('Fichier chargé · synchronisé');
    });
  } catch (e) {
    if (e.name !== 'AbortError') toast('Erreur: ' + e.message);
  }
}

async function disconnectFile() {
  fileHandle = null;
  await dbDelete('fileHandle');
  updateFileBanner();
  updateStorageIndicator();
  toast('Synchronisation fichier désactivée');
}

async function reconnectFile() {
  if (!fileHandle) return;
  try {
    const perm = await fileHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      await syncToFile();
      toast('Reconnecté · synchronisé');
    } else {
      toast('Permission refusée');
    }
    updateFileBanner();
  } catch (e) {
    console.warn(e);
    toast('Reconnexion impossible');
  }
}

/* ===== Persistence ===== */
let _githubSha = null;        // sha du data.json distant (pour eviter conflits)
let _githubSyncTimer = null;  // debounce ecriture
let _githubSyncBusy = false;
let _dirty = false;           // changements locaux non confirmes sur GitHub (persiste en IndexedDB)
let _dirtyGen = 0;            // incremente a chaque save(); permet de ne pas effacer le drapeau si une edition arrive pendant un push

function setSyncIndicator(state, text) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.className = 'sync-indicator ' + state;
  el.textContent = text;
  el.style.display = state === 'hidden' ? 'none' : '';
}

async function pushToGitHub() {
  if (_githubSyncBusy) { scheduleGithubSync(); return; }
  if (!window.QAGitHub || !QAGitHub.getPat()) {
    setSyncIndicator('err', 'Non synchronisé · PAT requis (Administration)');
    return;
  }
  _githubSyncBusy = true;
  // Generation au moment ou l'on fige l'etat a pousser. Si une edition arrive pendant
  // l'aller-retour reseau, _dirtyGen change et on NE videra PAS le drapeau (sinon la
  // nouvelle edition, ecrite avec dirty=false, serait ecrasee par le distant au reload).
  const gen = _dirtyGen;
  setSyncIndicator('busy', 'Synchro GitHub…');
  try {
    // On garde users/role inchanges, on ne touche qu'a state.
    const remote = await QAGitHub.fetchData().catch(() => null);
    const doc = (remote && remote.data) || { users: [], state: {} };
    doc.state = state;
    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = (QASession.username && QASession.username()) || 'unknown';
    const sha = await QAGitHub.saveData(doc, (remote && remote.sha) || _githubSha, `Update state by ${doc.updatedBy}`);
    _githubSha = sha;
    if (_dirtyGen === gen) {
      _dirty = false;
      await dbSet('dirty', false);
      setSyncIndicator('ok', 'Synchronisé sur GitHub');
    } else {
      // Des modifications sont arrivees pendant le push: on garde le drapeau et on repousse.
      setSyncIndicator('busy', 'Nouvelles modifications · re-synchro…');
      scheduleGithubSync();
    }
  } catch (e) {
    console.warn('Push GitHub echoue', e);
    if (e.message === 'CONFLICT') {
      setSyncIndicator('err', 'Conflit · rechargez la page');
      toast('Conflit de sync : un autre utilisateur a ecrit. Rechargez.');
    } else {
      setSyncIndicator('err', 'Sync impossible · ' + e.message);
    }
  } finally {
    _githubSyncBusy = false;
  }
}

function scheduleGithubSync() {
  if (_githubSyncTimer) clearTimeout(_githubSyncTimer);
  _githubSyncTimer = setTimeout(pushToGitHub, 1500);
}

async function save() {
  try {
    // Marque l'etat comme non synchronise tant que GitHub n'a pas confirme l'ecriture.
    // Ce drapeau survit aux rechargements : au prochain load(), l'etat local prime et
    // n'est jamais ecrase par la version distante tant qu'il reste des changements en attente.
    _dirty = true;
    _dirtyGen++;
    // Ecriture ATOMIQUE state + dirty: un crash entre les deux ne peut pas laisser un
    // nouvel etat marque "synchronise" (ce qui le ferait ecraser par le distant au reload).
    await dbSetMany({ state, dirty: true });
    if (fileHandle) {
      syncToFile().then(ok => { if (!ok) console.warn('File sync skipped (no permission)'); });
    }
    updateStorageIndicator();
    // Sync GitHub (debounced)
    scheduleGithubSync();
  } catch (e) {
    console.error('Save failed', e);
    toast('Erreur de sauvegarde');
  }
}

async function load() {
  try {
    // Etat local + drapeau "changements non pousses" (persistes en IndexedDB).
    const stored = await dbGet('state');
    _dirty = (await dbGet('dirty')) === true;

    // Tente de recuperer l'etat partage depuis GitHub.
    let remote = null;
    try {
      setSyncIndicator('busy', 'Chargement GitHub…');
      remote = await QAGitHub.fetchData();
    } catch (e) {
      console.warn('Load GitHub echoue', e);
    }
    const hasPat = !!(window.QAGitHub && QAGitHub.getPat());
    const remoteFresh = !!(remote && remote.data && remote.data.state && remote.source !== 'cache');

    if (_dirty && stored) {
      // Des modifications locales n'ont pas encore ete confirmees sur GitHub.
      // REGLE DE SECURITE : l'etat local PRIME et n'est JAMAIS ecrase par le distant
      // tant que ces changements ne sont pas pousses — sinon on perdrait le travail.
      state = Object.assign(state, stored);
      if (remoteFresh) _githubSha = remote.sha; // vise la derniere version distante pour le prochain push
      if (hasPat) {
        setSyncIndicator('warn', 'Modifications locales · synchronisation…');
        scheduleGithubSync();                    // pousse les changements en attente
      } else {
        setSyncIndicator('err', 'Non synchronisé · PAT requis (Administration)');
      }
    } else if (remoteFresh) {
      // Aucun changement local en attente : la version GitHub fait foi.
      state = Object.assign(state, remote.data.state);
      _githubSha = remote.sha;
      await dbSet('state', state);
      _dirty = false;
      await dbSet('dirty', false);
      setSyncIndicator('ok', 'Chargé depuis GitHub');
    } else if (remote && remote.source === 'cache' && remote.data && remote.data.state) {
      // Hors ligne : on repart du cache distant conserve par le client GitHub.
      state = Object.assign(state, remote.data.state);
      setSyncIndicator('warn', 'Cache local (hors ligne)');
    } else if (stored) {
      // Pas de distant exploitable : on conserve l'etat local existant.
      state = Object.assign(state, stored);
      setSyncIndicator('warn', 'Hors ligne · données locales');
    } else {
      // Tout premier lancement, aucune donnee locale : migration eventuelle
      // depuis l'ancien stockage localStorage.
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy);
          await dbSet('state', parsed);
          state = Object.assign(state, parsed);
          localStorage.removeItem(STORAGE_KEY_LEGACY);
          console.log('Migration localStorage → IndexedDB OK');
        } catch (e) {
          console.warn('Legacy migration failed', e);
        }
      }
    }
    // Restore file handle (permission re-validated lazily on first save)
    const handle = await dbGet('fileHandle');
    if (handle) fileHandle = handle;
    // Migrate plans to items model (idempotent)
    state.testPlans = (state.testPlans || []).map(migratePlan);
    // Ensure anomalies array exists (older saves predate this feature)
    if (!Array.isArray(state.anomalies)) state.anomalies = [];
    // Migrate single state.project → state.projects array (idempotent)
    if (!Array.isArray(state.projects)) state.projects = [];
    if (state.project && (state.project.name || state.project.startDate || state.project.endDate)) {
      // Only migrate if no projects exist yet (avoid duplicates on re-runs)
      if (state.projects.length === 0) {
        state.projects.push({
          id: uid(),
          name: state.project.name || 'Projet (migré)',
          startDate: state.project.startDate || '',
          endDate: state.project.endDate || '',
          planIds: [],
        });
      }
    }
    delete state.project;
    // Ensure each project has a planIds array
    state.projects.forEach(p => { if (!Array.isArray(p.planIds)) p.planIds = []; });
    // Migrate plan.projectId → project.planIds (idempotent)
    state.testPlans.forEach(pl => {
      if (pl.projectId) {
        const proj = state.projects.find(p => p.id === pl.projectId);
        if (proj && !proj.planIds.includes(pl.id)) {
          proj.planIds.push(pl.id);
        }
        delete pl.projectId;
      }
    });
    // Ensure tester arrays exist (older saves predate this feature)
    if (!Array.isArray(state.testerLevels)) state.testerLevels = [];
    if (!Array.isArray(state.testers)) state.testers = [];
    // Ensure each level has an order (default to insertion order)
    state.testerLevels.forEach((lvl, i) => { if (typeof lvl.order !== 'number') lvl.order = i + 1; });
    // Ensure data tables exist
    if (!Array.isArray(state.dataTables)) state.dataTables = [];
    state.dataTables.forEach(t => {
      if (!Array.isArray(t.columns)) t.columns = [];
      if (!Array.isArray(t.rows)) t.rows = [];
    });
    // Ensure business divisions exist
    if (!Array.isArray(state.businessDivisions)) state.businessDivisions = [];
    // Sub-divisions: ensure parentId field (null = top-level)
    state.businessDivisions.forEach(d => {
      if (typeof d.parentId === 'undefined') d.parentId = null;
    });
    // Enforce 1-level depth: if a division's parent itself has a parent, promote to top-level
    state.businessDivisions.forEach(d => {
      if (d.parentId) {
        const parent = state.businessDivisions.find(x => x.id === d.parentId);
        if (!parent || parent.parentId) d.parentId = null;
      }
    });
    // Levels scoped to a division: ensure divisionId field (null = unassigned legacy)
    state.testerLevels.forEach(l => {
      if (typeof l.divisionId === 'undefined') l.divisionId = null;
    });
    // Migrate legacy single divisionId → divisionIds (array, 0-n)
    ['testCases', 'testSuites', 'testPlans', 'testers'].forEach(key => {
      if (Array.isArray(state[key])) {
        state[key].forEach(e => {
          if (!Array.isArray(e.divisionIds)) {
            e.divisionIds = e.divisionId ? [e.divisionId] : [];
          }
          delete e.divisionId;
        });
      }
    });
    // Ensure step blocks exist; default step.type to 'step' for existing data
    if (!Array.isArray(state.stepBlocks)) state.stepBlocks = [];
    state.stepBlocks.forEach(b => {
      if (!Array.isArray(b.steps)) b.steps = [];
      b.steps.forEach(s => { if (!s.type) s.type = 'step'; });
    });
    state.testCases.forEach(c => {
      (c.steps || []).forEach(s => { if (!s.type) s.type = 'step'; });
      if (!Array.isArray(c.jiraTickets)) c.jiraTickets = [];
    });
    // Backfill sortOrder so drag/move arrows have a stable basis
    state.testCases.forEach((c, i) => {
      if (typeof c.sortOrder !== 'number') c.sortOrder = i + 1;
    });
    // Settings (global config like Jira base URL)
    if (!state.settings || typeof state.settings !== 'object') state.settings = {};
    if (typeof state.settings.jiraBaseUrl !== 'string') state.settings.jiraBaseUrl = '';
    // Migrate: ensure toAutomate (decision flag) exists. If absent, mirror `automated`.
    state.testCases.forEach(c => {
      if (typeof c.toAutomate !== 'boolean') c.toAutomate = !!c.automated;
    });
  } catch (e) {
    console.warn('Load failed', e);
  }
}

async function updateStorageIndicator() {
  try {
    const fmt = (b) => {
      if (b == null) return '—';
      const mb = b / 1024 / 1024;
      if (mb >= 1024) return (mb / 1024).toFixed(1) + ' Go';
      if (mb >= 1) return mb.toFixed(1) + ' Mo';
      return Math.max(1, Math.round(b / 1024)) + ' Ko';
    };
    const fill = document.getElementById('storage-fill');
    const text = document.getElementById('storage-text');
    if (!fill || !text) return;
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota && est.usage != null) {
        const pct = Math.min(100, (est.usage / est.quota) * 100);
        fill.style.width = pct + '%';
        text.textContent = `${fmt(est.usage)} sur ${fmt(est.quota)}`;
        return;
      }
    }
    // Fallback: estimate from JSON size
    const size = JSON.stringify(state).length * 2;
    fill.style.width = '0%';
    text.textContent = fmt(size) + ' (estimé)';
  } catch (e) {
    console.warn('Storage estimate failed', e);
  }
}

async function updateFileBanner() {
  const el = document.getElementById('file-sync-section');
  if (!el) return;
  if (!HAS_FILE_API) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:6px 8px;background:var(--surface-soft);border-radius:var(--radius-sm);line-height:1.4;">Sync fichier indisponible<br><span style="font-size:10.5px;">(Chrome/Edge requis)</span></div>`;
    return;
  }
  if (fileHandle) {
    let perm = 'granted';
    try { perm = await fileHandle.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    const granted = perm === 'granted';
    el.innerHTML = `
      <div class="file-sync ${granted ? 'connected' : 'pending'}">
        <div class="file-sync-row">
          <span style="color:${granted ? 'var(--success)' : 'var(--warning)'};display:inline-flex;">${ICON.folder}</span>
          <div style="flex:1;min-width:0;">
            <div class="file-sync-name" title="${escapeHtml(fileHandle.name)}">${escapeHtml(fileHandle.name)}</div>
            <div class="file-sync-status" style="color:${granted ? 'var(--success)' : 'var(--warning)'};">${granted ? 'Synchronisé sur disque' : 'Permission requise — cliquer'}</div>
          </div>
          <button class="btn-icon btn-ghost" id="fs-disconnect" data-tip="Déconnecter le fichier" style="width:24px;height:24px;flex-shrink:0;">${ICON.close}</button>
        </div>
      </div>
    `;
    if (!granted) {
      el.querySelector('.file-sync').style.cursor = 'pointer';
      el.querySelector('.file-sync').onclick = (ev) => {
        if (ev.target.closest('#fs-disconnect')) return;
        reconnectFile();
      };
    }
    document.getElementById('fs-disconnect').onclick = (ev) => { ev.stopPropagation(); disconnectFile(); };
  } else {
    el.innerHTML = `
      <button class="btn btn-sm" id="fs-connect" data-tip="Synchroniser automatiquement vers un fichier sur le disque (Documents, OneDrive…). Survit à un wipe du navigateur." style="width:100%;margin-bottom:4px;">Synchroniser sur fichier</button>
      <button class="btn btn-sm btn-ghost" id="fs-load" data-tip="Charger un catalogue depuis un fichier puis activer la sync sur ce fichier" style="width:100%;font-size:11px;">Charger un fichier existant</button>
    `;
    document.getElementById('fs-connect').onclick = () => connectFile();
    document.getElementById('fs-load').onclick = () => loadFromFile();
  }
}

