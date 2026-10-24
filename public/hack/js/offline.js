/* Armazenamento offline do credenciamento (IndexedDB), por pessoa.
   Guarda a cópia mínima do evento (hashes dos QRs, nome, equipe, presenças),
   a credencial do aparelho e a fila de leituras feitas sem rede.
   Exposto como window.HackOffline. */
(function () {
  'use strict';
  const DB = 'lepv-hack';
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('ops')) d.createObjectStore('ops', { keyPath: 'opId' });
      };
      req.onsuccess = () => {
        const d = req.result;
        // Outra aba pedindo para apagar o banco: fecha na hora, para a remoção
        // não ficar "adiada" e acontecer mais tarde em cima de leituras novas.
        d.onversionchange = () => { d.close(); dbp = null; };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const st = t.objectStore(store);
      let out;
      Promise.resolve(fn(st)).then((v) => { out = v; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  const get = (k) => tx('kv', 'readonly', (st) => reqP(st.get(k)));
  const set = (k, v) => tx('kv', 'readwrite', (st) => { st.put(v, k); });

  async function addOp(op) { await tx('ops', 'readwrite', (st) => { st.put(op); }); }
  async function listOps() { return tx('ops', 'readonly', (st) => reqP(st.getAll())); }
  async function removeOps(ids) { await tx('ops', 'readwrite', (st) => { ids.forEach((i) => st.delete(i)); }); }
  // null = não deu para ler a fila (não é o mesmo que "vazia").
  async function pendingCount() { try { return (await listOps()).length; } catch (e) { return null; } }

  // Apaga tudo deste aparelho (cópia, credencial e fila). Quem chama decide
  // quando: leituras pendentes NÃO são apagadas sem confirmação (sair pede
  // segundo clique; abrir a tela nunca apaga fila). Devolve true só se o banco
  // foi de fato apagado (bloqueado por outra aba ou erro = false).
  async function wipe() {
    try { if (dbp) (await dbp).close(); } catch (e) { /* segue */ }
    dbp = null;
    return new Promise((resolve) => {
      let r;
      try { r = indexedDB.deleteDatabase(DB); } catch (e) { resolve(false); return; }
      r.onsuccess = () => resolve(true);
      r.onerror = () => resolve(false);
      r.onblocked = () => resolve(false);
    });
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function newOpId() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  window.HackOffline = { get, set, addOp, listOps, removeOps, pendingCount, wipe, sha256Hex, newOpId };
})();
