/* Hash SHA-256 via Web Crypto. Salt + username + password pour eviter rainbow tables triviaux.
   Le tout reste cote client - protection cosmetique en attendant le repo prive. */
(function () {
  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function hashPassword(username, password) {
    const salt = (window.QA_CONFIG && window.QA_CONFIG.passwordSalt) || 'qa-catalog-salt';
    return sha256Hex(`${salt}:${username}:${password}`);
  }

  async function verifyPassword(username, password, expectedHash) {
    const got = await hashPassword(username, password);
    return got === expectedHash;
  }

  window.QACrypto = { sha256Hex, hashPassword, verifyPassword };
})();
