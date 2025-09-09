// auth.js
// Добавлено: поддержка стран (country) и множественных стран (countries[]).
// Сохраняем выбранную страну в сессии.

import { readUsers } from "./storage.js";
import { getSession, setSession } from "./storage.js";
import { hashDJB2 } from "./utils.js";

export const SUPPORTED_COUNTRIES = [
  { code: "PL", label: "Poland", flag: "🇵🇱" },
  { code: "GE", label: "Georgia", flag: "🇬🇪" },
  { code: "CO", label: "Colombia", flag: "🇨🇴" },
  { code: "LV", label: "Latvia", flag: "🇱🇻" },
  { code: "LT", label: "Lithuania", flag: "🇱🇹" },
];

/**
 * Аутентификация.
 * chosenCountry — страна, выбранная на форме логина (select).
 * Если у пользователя:
 *  - есть массив countries -> берём chosenCountry если он в списке, иначе первый.
 *  - есть одиночное поле country -> используем его, игнорируя chosenCountry если отличается.
 *  - нет страны -> fallback на chosenCountry или "PL".
 */
export function authenticateAny(loginId, password, { ttlDays = 180, chosenCountry } = {}) {
  const users = readUsers();
  const user = users.find((u) => u.loginId === loginId);
  if (!user) return { ok: false, reason: "User not found" };
  if (user.passwordHash !== hashDJB2(password)) return { ok: false, reason: "Invalid password" };

  const accountType = user.accountType || "personal";

  let country;
  if (Array.isArray(user.countries) && user.countries.length) {
    if (chosenCountry && user.countries.includes(chosenCountry)) {
      country = chosenCountry;
    } else {
      country = user.countries[0];
    }
  } else if (user.country) {
    country = user.country;
  } else {
    country = chosenCountry || "PL";
  }

  const ses = {
    role: user.role,
    accountType,
    loginId: user.loginId,
    country,
    signedInAt: Date.now(),
  };
  setSession(ses, { ttlDays }); // длительная сессия
  return { ok: true, role: user.role, accountType, country };
}

/**
 * Требование авторизации:
 * - Без role: просто нужна сессия
 * - С role: сверка роли
 * Отсутствие -> редирект на #/login
 */
export function requireAuth(role) {
  const ses = getSession();
  const here = window.location.hash || "#/";
  const gotoLogin = () => {
    const q = encodeURIComponent(here);
    if (!here.startsWith("#/login")) window.location.hash = `#/login?returnTo=${q}`;
  };
  if (!ses) { gotoLogin(); return null; }
  if (role && ses.role !== role) { gotoLogin(); return null; }
  return ses;
}

export function signOut() {
  setSession(null);
  window.location.hash = "#/login";
}

export function canAddUpdate(ses) {
  return ses && (ses.role === "admin" || (ses.role === "sm" && (ses.accountType || "personal") === "operation"));
}