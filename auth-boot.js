// auth-boot.js
// Подключите ПОСЛЕ app.js. Делает поведение:
// - Если сессии нет и открыли "", "#", "#/", "#/home", "#/welcome" -> редиректим на "#/login"
// - Если сессия есть и вы на "#/login" или "#/welcome" -> редиректим на dashboard (отредактируйте маршрут ниже)

import { getSession } from "./storage.js";

function isHomeLike(h) {
  return h === "" || h === "#" || h === "#/" || h === "#/home" || h === "#/welcome";
}
function isLogin(h) {
  return h.startsWith("#/login");
}
function getDefaultRouteForRole(role) {
  // Подставьте свои маршруты по ролям, если нужно
  // Например: admin -> "#/admin", sm -> "#/dashboard"
  switch (role) {
    case "admin": return "#/dashboard";
    case "sm": return "#/dashboard";
    default: return "#/dashboard";
  }
}

function routeOnBoot() {
  const ses = getSession();
  const h = window.location.hash || "#/";
  if (!ses && isHomeLike(h)) {
    window.location.replace("#/login");
    return;
  }
  if (ses && (isHomeLike(h) || isLogin(h))) {
    window.location.replace(getDefaultRouteForRole(ses.role));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", routeOnBoot);
} else {
  routeOnBoot();
}
window.addEventListener("hashchange", () => {
  const ses = getSession();
  const h = window.location.hash || "#/";
  if (!ses && isHomeLike(h)) {
    window.location.replace("#/login");
  }
});