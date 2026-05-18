/* Client GitHub API minimal pour lire/ecrire data.json.
   - Lecture via raw.githubusercontent.com (pas d'auth, fonctionne tant que le repo est public)
   - Ecriture via PUT /repos/:owner/:repo/contents/:path (PAT requis)
   - Cache local en localStorage pour survivre aux ratees reseau */
(function () {
  const CFG = window.QA_CONFIG;

  function rawUrl() {
    // cache-buster: GitHub raw met en cache ~5min
    return `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${CFG.branch}/${CFG.dataPath}?t=${Date.now()}`;
  }

  function apiUrl() {
    return `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dataPath}?ref=${CFG.branch}`;
  }

  function getPat() {
    return localStorage.getItem(CFG.patKey) || '';
  }

  function setPat(token) {
    if (token) localStorage.setItem(CFG.patKey, token);
    else localStorage.removeItem(CFG.patKey);
  }

  function cacheGet() {
    try { return JSON.parse(localStorage.getItem(CFG.cacheKey) || 'null'); }
    catch (e) { return null; }
  }

  function cacheSet(data, sha) {
    localStorage.setItem(CFG.cacheKey, JSON.stringify({ data, sha, cachedAt: Date.now() }));
  }

  /* Lit data.json. Essaye API authentifiee si PAT (pour repos prives), sinon raw public. */
  async function fetchData() {
    const pat = getPat();
    const noCache = { cache: 'no-store' };
    try {
      if (pat) {
        const res = await fetch(apiUrl(), {
          ...noCache,
          headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' }
        });
        if (res.ok) {
          const json = await res.json();
          const content = atob(json.content.replace(/\n/g, ''));
          const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(content, c => c.charCodeAt(0))));
          cacheSet(data, json.sha);
          return { data, sha: json.sha, source: 'api' };
        }
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`GitHub API ${res.status}`);
        }
      }
      const res = await fetch(rawUrl(), noCache);
      if (!res.ok) throw new Error(`GET raw ${res.status}`);
      const data = await res.json();
      // sha unknown from raw - fetch separately via API (unauthed, works for public repos)
      let sha = null;
      try {
        const meta = await fetch(apiUrl(), {
          ...noCache,
          headers: { 'Accept': 'application/vnd.github+json' }
        });
        if (meta.ok) sha = (await meta.json()).sha;
      } catch (e) { /* ignore */ }
      cacheSet(data, sha);
      return { data, sha, source: 'raw' };
    } catch (e) {
      const cached = cacheGet();
      if (cached) {
        console.warn('Fetch GitHub echoue, fallback cache local', e);
        return { data: cached.data, sha: cached.sha, source: 'cache', error: e.message };
      }
      throw e;
    }
  }

  /* Ecrit data.json sur GitHub. Necessite un PAT avec scope "contents:write". */
  async function saveData(data, sha, message) {
    const pat = getPat();
    if (!pat) throw new Error('PAT GitHub requis pour ecrire');
    const content = JSON.stringify(data, null, 2);
    const b64 = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: message || `Update data.json (${new Date().toISOString()})`,
      content: b64,
      branch: CFG.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(apiUrl(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 401 || res.status === 403) throw new Error('PAT invalide ou sans droits ecriture');
      throw new Error(`GitHub PUT ${res.status}: ${txt}`);
    }
    const json = await res.json();
    cacheSet(data, json.content.sha);
    return json.content.sha;
  }

  /* Verifie qu'un PAT est valide et a acces en ecriture au repo. */
  async function checkPat(pat) {
    try {
      const res = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}`, {
        headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const json = await res.json();
      const canWrite = !!(json.permissions && (json.permissions.push || json.permissions.admin || json.permissions.maintain));
      return { ok: true, canWrite, repo: json.full_name };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  window.QAGitHub = { fetchData, saveData, getPat, setPat, checkPat, cacheGet };
})();
