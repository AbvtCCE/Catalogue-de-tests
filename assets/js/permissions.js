/* RBAC declaratif - une seule source de verite cote client.
   '*' = tous droits. Sinon, dict { resource: ['create','read','update','delete'] }.
   Les anciens roles 'admin'/'user' restent supportes par mapping. */
(function () {
  const ROLES = {
    qa_manager: '*',
    fonctionnel: {
      dashboard: ['read'],
      testcases: ['create', 'read', 'update', 'delete'],
      testsuites: ['read'],
      testplans: ['create', 'read', 'update'],
      anomalies: ['create', 'read', 'update', 'delete'],
      projects: ['create', 'read', 'update', 'delete'],
      dataTables: ['create', 'read', 'update', 'delete'],
    },
    testeur: {
      dashboard: ['read'],
      testcases: ['create', 'read', 'update', 'delete'],
      anomalies: ['create', 'read', 'update', 'delete'],
      dataTables: ['create', 'read', 'update', 'delete'],
    },
    // Backward compat
    admin: '*',
    user: 'testeur',
  };

  const LABELS = {
    qa_manager: 'QA Manager',
    fonctionnel: 'Fonctionnel',
    testeur: 'Testeur',
    admin: 'QA Manager',
    user: 'Testeur',
  };

  function normalize(role) {
    if (role === 'admin') return 'qa_manager';
    if (role === 'user') return 'testeur';
    return role || 'testeur';
  }

  function roleLabel(role) {
    return LABELS[role] || role || 'Inconnu';
  }

  function permsFor(role) {
    let p = ROLES[role];
    while (typeof p === 'string' && p !== '*') p = ROLES[p];
    return p || {};
  }

  function currentRole() {
    const sess = window.QASession && window.QASession.get();
    return sess ? sess.role : null;
  }

  function can(action, resource) {
    const role = currentRole();
    if (!role) return false;
    const perms = permsFor(role);
    if (perms === '*') return true;
    const list = perms[resource] || [];
    return list.includes(action);
  }

  function canRead(resource) { return can('read', resource); }
  function canWrite(resource) {
    return can('create', resource) || can('update', resource) || can('delete', resource);
  }
  function canManageUsers() {
    const role = currentRole();
    return role === 'qa_manager' || role === 'admin';
  }

  /* Mapping des attributs deja presents dans le HTML existant
     vers la ressource RBAC correspondante. Evite de tagger manuellement
     chaque bouton edit/delete. */
  const ATTR_RESOURCE = {
    'data-edit-tc': 'testcases',         'data-delete-tc': 'testcases',
    'data-edit-suite': 'testsuites',     'data-delete-suite': 'testsuites',
    'data-edit-plan': 'testplans',       'data-delete-plan': 'testplans',
    'data-edit-env': 'environments',     'data-delete-env': 'environments',
    'data-edit-project': 'projects',     'data-delete-project': 'projects',
    'data-edit-block': 'stepblocks',     'data-delete-block': 'stepblocks',
    'data-edit-table': 'dataTables',     'data-delete-table': 'dataTables',
    'data-edit-anomaly': 'anomalies',    'data-delete-anomaly': 'anomalies',
    'data-level-edit': 'testers',        'data-level-delete': 'testers',
    'data-tester-edit': 'testers',       'data-tester-delete': 'testers',
    'data-division-edit': 'testers',     'data-division-delete': 'testers',
  };
  const ATTR_ACTION = {
    edit: 'update',
    delete: 'delete',
  };

  /* Parcourt le DOM et masque :
     - [data-perm="resource:action"] explicites
     - boutons edit/delete via leur attribut data-* connu
     Appeler apres chaque render. */
  function applyPermissionGates(root) {
    root = root || document;
    root.querySelectorAll('[data-perm]').forEach(el => {
      const [resource, action] = el.dataset.perm.split(':');
      if (!can(action, resource)) el.style.display = 'none';
    });
    Object.keys(ATTR_RESOURCE).forEach(attr => {
      const resource = ATTR_RESOURCE[attr];
      const verb = attr.includes('-delete') ? 'delete' : 'update';
      root.querySelectorAll('[' + attr + ']').forEach(el => {
        if (!can(verb, resource)) el.style.display = 'none';
      });
    });
  }

  /* Liste des roles disponibles (pour les dropdowns admin) */
  const ASSIGNABLE_ROLES = ['qa_manager', 'fonctionnel', 'testeur'];

  window.QAPerm = {
    can, canRead, canWrite, canManageUsers,
    applyPermissionGates, normalize, roleLabel,
    ROLES, LABELS, ASSIGNABLE_ROLES,
  };
})();
