/* Catalogue de tests — module « main.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ===== Init ===== */
function renderSessionBar() {
  const sess = QASession.get();
  const bar = document.getElementById('session-bar');
  if (!bar || !sess) return;
  const label = (window.QAPerm && QAPerm.roleLabel(sess.role)) || sess.role || 'user';
  bar.innerHTML = `
    <div class="who">
      <strong>${escapeHtml(sess.username)}</strong>
      <small>${escapeHtml(label)}</small>
    </div>
    <button class="logout" id="btn-logout" title="Se deconnecter">Sortir</button>
  `;
  document.getElementById('btn-logout').onclick = () => QASession.logout();
  if (window.QAPerm && QAPerm.canManageUsers()) {
    document.getElementById('admin-link').style.display = '';
  }
  if (sess.mustChangePassword) {
    toast('Pensez a changer votre mot de passe par defaut (Administration).');
  }
}

async function init() {
  renderSessionBar();
  // Demande au navigateur de NE PAS evincer le stockage de ce site (localStorage +
  // IndexedDB). Sans ca, Chrome/Edge peuvent purger le PAT et la session sous pression
  // disque ou apres inactivite. A accorder une fois; persiste ensuite pour l'origine.
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = navigator.storage.persisted && await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) { /* non bloquant */ }
  await load();
  buildNav();
  switchTab('dashboard');
  await updateStorageIndicator();
  updateFileBanner();

  // Sidebar shortcuts
  document.getElementById('sb-export').onclick = exportJSON;
  document.getElementById('sb-import').onclick = () => document.getElementById('sb-import-file').click();
  document.getElementById('sb-import-file').onchange = (e) => {
    importJSONFile(e.target.files[0]);
    e.target.value = '';
  };
  document.getElementById('btn-refresh-github').onclick = async () => {
    setSyncIndicator('busy', 'Rechargement…');
    // Vide le cache local pour forcer un fetch frais
    localStorage.removeItem(QA_CONFIG.cacheKey);
    await load();
    switchTab(currentTab || 'dashboard');
    toast('Donnees rechargees depuis GitHub');
  };
  // Applique les droits sur les boutons de la sidebar (export/import) une fois le DOM pret.
  if (window.QAPerm) QAPerm.applyPermissionGates(document);

  // Filet de securite: quand l'onglet se ferme/masque, pousse tout de suite les
  // changements en attente au lieu d'attendre le debounce. Meilleur effort — le
  // drapeau _dirty garantit de toute facon la re-synchro au prochain chargement.
  window.addEventListener('pagehide', () => {
    if (_dirty && window.QAGitHub && QAGitHub.getPat() && !_githubSyncBusy) {
      if (_githubSyncTimer) clearTimeout(_githubSyncTimer);
      pushToGitHub();
    }
  });
}
init();
