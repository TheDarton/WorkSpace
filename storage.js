// storage.js
// Локальное хранилище: пользователи, ACKи, обновления, порядок графика и сессия.
// Добавлено: country по умолчанию у seed admin ("PL") — можно потом переопределить/удалить.

import { hashDJB2 } from "./utils.js";

const USERS_KEY = "AH_USERS_V1";
const ACKS_KEY = "AH_ACKS_V1";
const UPDATES_KEY = "AH_UPDATES_V1";
const SCHEDULE_ORDER_KEY = "AH_SCHEDULE_ORDER_V1";
const SESSION_KEY = "AH_SESSION_V1";

/* -------------------- helpers -------------------- */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/* -------------------- Users -------------------- */
export function readUsers() {
  const arr = readJson(USERS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export function writeUsers(users) {
  writeJson(USERS_KEY, Array.isArray(users) ? users : []);
}

// Совместимость
export { writeUsers as saveUsers };

/**
 * ensureSeedAdmin — создаёт первого администратора (admin/admin), если его нет.
 */
export function ensureSeedAdmin({ loginId = "admin", password = "admin" } = {}) {
  const users = readUsers();

  if (users.some((u) => u.role === "admin")) {
    return { created: false, loginId, reason: "admin already exists" };
  }

  const adminUser = {
    role: "admin",
    loginId,
    passwordHash: hashDJB2(password),
    createdAt: new Date().toISOString(),
    country: "PL", // можно потом изменить вручную
  };
  users.push(adminUser);
  writeUsers(users);

  return { created: true, loginId };
}

/* -------------------- ACKs -------------------- */
export function readAcks() {
  const obj = readJson(ACKS_KEY, {});
  return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
}

export function writeAcks(acks) {
  writeJson(ACKS_KEY, acks && typeof acks === "object" ? acks : {});
}
export { writeAcks as saveAcks };

/* -------------------- Updates -------------------- */
export function readUpdates() {
  const v = readJson(UPDATES_KEY, []);
  return v ?? [];
}

export function writeUpdates(updates) {
  writeJson(UPDATES_KEY, updates ?? []);
}
export { writeUpdates as saveUpdates };

/* -------------------- Schedule order -------------------- */
export function getScheduleOrder() {
  const v = readJson(SCHEDULE_ORDER_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function setScheduleOrder(order) {
  writeJson(SCHEDULE_ORDER_KEY, Array.isArray(order) ? order : []);
}
export { getScheduleOrder as readScheduleOrder };
export { setScheduleOrder as saveScheduleOrder };

/* -------------------- Session -------------------- */
export function setSession(session, opts = {}) {
  const { ttlDays = null, useSessionStorage = false } = opts;

  if (!session) {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    return;
  }

  const data = { ...session };
  if (ttlDays && Number.isFinite(ttlDays)) {
    data.expiresAt = Date.now() + ttlDays * 864e5;
  } else {
    delete data.expiresAt;
  }

  const blob = JSON.stringify(data);
  try {
    if (useSessionStorage) {
      sessionStorage.setItem(SESSION_KEY, blob);
      try { localStorage.removeItem(SESSION_KEY); } catch {}
    } else {
      localStorage.setItem(SESSION_KEY, blob);
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }
  } catch {
    // ignore
  }
}

export function getSession() {
  const read = (store) => {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (!raw) return null;
      const ses = JSON.parse(raw);
      if (ses && ses.expiresAt && Date.now() > ses.expiresAt) {
        try { store.removeItem(SESSION_KEY); } catch {}
        return null;
      }
      return ses || null;
    } catch {
      return null;
    }
  };

  let ses = read(localStorage);
  if (ses) return ses;

  ses = read(sessionStorage);
  if (ses) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(ses)); } catch {}
    return ses;
  }
  return null;
}