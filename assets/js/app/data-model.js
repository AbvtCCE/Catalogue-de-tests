/* Catalogue de tests — module « data-model.js ».
   Fait partie de l'application principale (index.html). L'ordre de chargement
   des <script> compte : voir index.html. Ne pas ouvrir isolément. */
/* ============================================================
   QA Catalog — single-file app
   Persistance localStorage. Aucune dépendance.
   ============================================================ */

/* ===== Icons (SVG sprites) ===== */
const ICON = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  env: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="6" rx="1"/><rect x="2" y="14" width="20" height="6" rx="1"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>',
  case: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  suite: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  plan: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  export: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  bot: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
  image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  link: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  print: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  checklist: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2"/><path d="M9 12l2 2 4-4"/></svg>',
  bug: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="6" ry="8"/><path d="M12 5V3"/><path d="M9 4l3 2 3-2"/><path d="M5 9L3 8"/><path d="M5 13H3"/><path d="M5 17l-2 1"/><path d="M19 9l2-1"/><path d="M19 13h2"/><path d="M19 17l2 1"/></svg>',
  alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  table: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  briefcase: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
  layers: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/><polyline points="2 11.5 12 18 22 11.5"/></svg>',
  list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  ticket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  externalLink: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  upload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  empty: '<svg width="64" height="64" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.4"/><path d="M22 28l6 6 14-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>',
};

/* ===== Test types catalog ===== */
const TEST_TYPES = [
  { id: 'fonctionnel',   label: 'Fonctionnel',
    desc: "Vérifie que chaque fonctionnalité respecte ses spécifications. On valide les calculs, règles métier et comportements attendus contre les exigences." },
  { id: 'integration',   label: 'Intégration',
    desc: "Teste les interactions entre composants ou systèmes (modules, API, bases de données). Cherche les défauts aux interfaces et dans les échanges de données." },
  { id: 'systeme',       label: 'Système',
    desc: "Valide le système complet et intégré contre les exigences globales, sur un environnement représentatif. Suit la phase d'intégration." },
  { id: 'acceptation',   label: 'Acceptation (UAT)',
    desc: "Réalisé par ou pour le métier pour confirmer que la solution répond aux besoins réels. Souvent la dernière phase avant la mise en production." },
  { id: 'regression',    label: 'Régression',
    desc: "Re-vérifie qu'une modification n'a pas cassé ce qui fonctionnait auparavant. Idéalement automatisé pour être rejoué fréquemment." },
  { id: 'smoke',         label: 'Smoke / Sanity',
    desc: "Vérification rapide qu'un build est globalement stable et utilisable. Joué après chaque déploiement avant les tests approfondis." },
  { id: 'performance',   label: 'Performance',
    desc: "Mesure les temps de réponse, le débit et la consommation de ressources. Inclut tests de charge, de stress et d'endurance." },
  { id: 'securite',      label: 'Sécurité',
    desc: "Cherche les vulnérabilités : authentification, autorisation, injection, exposition de données, configuration. Couvre les classiques OWASP." },
  { id: 'accessibilite', label: 'Accessibilité',
    desc: "Vérifie que le système est utilisable par les personnes en situation de handicap : conformité WCAG, lecteurs d'écran, contrastes, navigation clavier." },
  { id: 'compatibilite', label: 'Compatibilité',
    desc: "Valide le fonctionnement sur différents navigateurs, OS, résolutions et versions. Couvre aussi l'interopérabilité avec d'autres systèmes." },
  { id: 'api',           label: 'API',
    desc: "Teste les interfaces de programmation directement (REST, SOAP, etc.) sans passer par l'UI. Valide contrats, codes de retour, structures de données et authentification." },
  { id: 'e2e',           label: 'Bout en bout (E2E)',
    desc: "Simule un parcours utilisateur complet à travers tout le système et ses dépendances. Vérifie que le flux fonctionne dans un contexte réaliste." },
  { id: 'exploratoire',  label: 'Exploratoire',
    desc: "Conception et exécution simultanées, sans script préalable. Le testeur explore librement pour révéler des défauts non couverts par les tests scriptés." },
];

/* ===== Anomaly catalogs ===== */
const ANOMALY_TYPES = [
  { id: 'functional',     label: 'Fonctionnelle',  desc: "Le logiciel ne réalise pas correctement une fonction attendue ou produit un résultat incorrect." },
  { id: 'performance',    label: 'Performance',    desc: "Temps de réponse, débit ou consommation de ressources insuffisants par rapport aux exigences." },
  { id: 'compatibility',  label: 'Compatibilité',  desc: "Problème d'interopérabilité ou de coexistence avec d'autres systèmes, navigateurs ou versions." },
  { id: 'usability',      label: 'Ergonomie',      desc: "Difficulté d'utilisation, manque de clarté de l'interface, accessibilité insuffisante." },
  { id: 'reliability',    label: 'Fiabilité',      desc: "Plantages, perte de données, instabilité, manque de tolérance aux pannes." },
  { id: 'security',       label: 'Sécurité',       desc: "Faille de sécurité, accès non autorisé, fuite d'information, contournement d'authentification." },
  { id: 'maintainability',label: 'Maintenabilité', desc: "Code difficile à modifier, à analyser ou à tester, dette technique." },
  { id: 'portability',    label: 'Portabilité',    desc: "Problème d'adaptation à un autre environnement, d'installation ou de migration." },
  { id: 'data',           label: 'Données',        desc: "Corruption, perte, incohérence ou intégrité référentielle des données." },
  { id: 'documentation',  label: 'Documentation',  desc: "Documentation utilisateur ou technique manquante, erronée ou non synchronisée avec le produit." },
];

const ANOMALY_SEVERITIES = [
  { id: 'critical', label: 'Critique', desc: "Bloque une fonctionnalité métier majeure, pas de contournement viable." },
  { id: 'major',    label: 'Majeure',  desc: "Fonctionnalité dégradée, contournement possible mais coûteux." },
  { id: 'minor',    label: 'Mineure',  desc: "Gêne ponctuelle, contournement simple." },
  { id: 'trivial',  label: 'Triviale', desc: "Cosmétique ou très marginal." },
];

const ANOMALY_STATES = [
  { id: 'discovered',           label: 'Découverte',                       kind: 'open' },
  { id: 'in_progress',          label: 'En cours de résolution',           kind: 'open' },
  { id: 'workaround_pending',   label: 'Contournée — en attente correctif',kind: 'open' },
  { id: 'workaround_accepted',  label: 'Contournée — ROI nul de résolution',kind: 'closed' },
  { id: 'fixed',                label: 'Résolue',                          kind: 'closed' },
  { id: 'closed',               label: 'Fermée — vérifiée',                kind: 'closed' },
  { id: 'rejected',             label: 'Rejetée (non-anomalie)',           kind: 'closed' },
];

/* ===== CRUD operations =====
   Classification d'un cas de test selon l'opération métier qu'il vérifie.
   Permet de garantir la couverture complète Create/Read/Update/Delete par entité.
*/
const CRUD_OPS = [
  { id: 'create', label: 'Création',     short: 'C', desc: 'Le test crée un nouvel élément.' },
  { id: 'read',   label: 'Lecture',      short: 'R', desc: 'Le test consulte ou recherche un élément existant.' },
  { id: 'update', label: 'Mise à jour',  short: 'U', desc: 'Le test modifie un élément existant.' },
  { id: 'delete', label: 'Suppression',  short: 'D', desc: 'Le test supprime un élément.' },
];

/* ===== State ===== */
const STORAGE_KEY_LEGACY = 'qa-catalog-v1'; // for one-time migration
const DB_NAME = 'qa-catalog';
const DB_VERSION = 1;
const STORE = 'kv';

let state = {
  projects: [],
  environments: [],
  testCases: [],
  testSuites: [],
  testPlans: [],
  anomalies: [],
  testerLevels: [],
  testers: [],
  dataTables: [],
  businessDivisions: [],
  stepBlocks: [],
  settings: { jiraBaseUrl: '' },
};
let currentTab = 'dashboard';
let fileHandle = null;
const HAS_FILE_API = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

/* ===== IndexedDB wrapper =====
   Single-store key/value. We keep one persisted handle for the current
   data ('state') and one for the optional file sync handle ('fileHandle').
*/
let _dbPromise = null;
function getDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _dbPromise;
}
async function dbGet(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbSet(key, val) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
/* Ecrit plusieurs cles dans UNE seule transaction (atomique). Evite qu'un crash
   entre deux ecritures laisse un etat incoherent (ex: nouveau state + dirty=false). */
async function dbSetMany(obj) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const k in obj) os.put(obj[k], k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

