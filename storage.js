/* storage.js — хранилище профилей и проектов HIPIND на IndexedDB */
(function (global) {
  const DB_NAME = 'hipind_db';
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('userKey', 'userKey', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const API = {
    /* ---------- Пользователи ---------- */
    async getAllUsers() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('users', 'readonly');
        const req = t.objectStore('users').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async getUser(key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('users', 'readonly');
        const req = t.objectStore('users').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async putUser(user) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('users', 'readwrite');
        t.objectStore('users').put(user);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    },
    async deleteUser(key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('users', 'readwrite');
        t.objectStore('users').delete(key);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    },

    /* ---------- Проекты ---------- */
    async getProjectsByUser(userKey) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('projects', 'readonly');
        const idx = t.objectStore('projects').index('userKey');
        const req = idx.getAll(userKey);
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    },
    async putProject(project) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('projects', 'readwrite');
        t.objectStore('projects').put(project);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    },
    async deleteProject(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('projects', 'readwrite');
        t.objectStore('projects').delete(id);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    },
    async deleteProjectsByUser(userKey) {
      const list = await API.getProjectsByUser(userKey);
      for (const p of list) await API.deleteProject(p.id);
      return true;
    },

    /* ---------- Сессия ---------- */
    async getSession() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('meta', 'readonly');
        const req = t.objectStore('meta').get('session');
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
      });
    },
    async setSession(nick) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const t = db.transaction('meta', 'readwrite');
        const store = t.objectStore('meta');
        if (nick) store.put({ key: 'session', value: nick });
        else store.delete('session');
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    },

    /* ---------- Экспорт / импорт ---------- */
    async exportAll() {
      const users = await API.getAllUsers();
      const projects = [];
      for (const u of users) {
        const list = await API.getProjectsByUser(u.key);
        projects.push(...list);
      }
      return { version: 1, exportedAt: new Date().toISOString(), users, projects };
    },
    async importAll(payload) {
      if (!payload || !Array.isArray(payload.users) || !Array.isArray(payload.projects)) {
        throw new Error('Некорректный формат файла импорта');
      }
      for (const u of payload.users) await API.putUser(u);
      for (const p of payload.projects) await API.putProject(p);
      return { users: payload.users.length, projects: payload.projects.length };
    }
  };

  global.HipindStorage = API;
})(window);