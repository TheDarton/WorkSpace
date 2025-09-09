import { readUsers, saveUsers } from "./storage.js";
import { hashDJB2 } from "./utils.js";

/* ===== Countries ===== */
export const SUPPORTED_COUNTRIES = [
  { code: "pl", label: "Poland" },
  { code: "ge", label: "Georgia" },
  { code: "co", label: "Colombia" },
  { code: "lv", label: "Latvia" },
  { code: "lt", label: "Lithuania" }
];

const ALLOWED_ACCOUNT_TYPES = ["sm", "dealer", "operation"];
const MIN_PASS = 4;
const ADMIN_LOGIN = "admin";
const DEFAULT_ADMIN_PASSWORD = "1234";

/* Helpers */
function norm(s){ return String(s || "").trim(); }
function nowISO(){ return new Date().toISOString(); }
function normCountry(c){
  return String(c || "")
    .trim()
    .toLowerCase()
    .replace(/^poland$/,'pl')
    .replace(/^georgia$/,'ge')
    .replace(/^colombia$/,'co')
    .replace(/^latvia$/,'lv')
    .replace(/^lithuania$/,'lt');
}
function isCountryCode(code){
  return SUPPORTED_COUNTRIES.some(c => c.code === code);
}

/* Migration legacy personal -> sm */
export function migrateAccountTypes(){
  const users = readUsers();
  let dirty = false;
  for (const u of users){
    if (u.role === "sm" && (u.accountType === "personal" || !u.accountType)){
      u.accountType = "sm";
      dirty = true;
    }
  }
  if (dirty) saveUsers(users);
}

/* Optional country normalizer (not auto-run) */
export function normalizeAllCountries(){
  const users = readUsers();
  let dirty = false;
  for (const u of users){
    if (u.role === "sm" || u.role === "admin"){
      const nc = normCountry(u.country);
      if (nc && u.country !== nc){
        u.country = nc;
        dirty = true;
      }
    }
  }
  if (dirty) saveUsers(users);
}

/* Single admin */
export function ensureRootAdmin(){
  const users = readUsers();
  if (users.some(u => u.role === "admin" && u.loginId === ADMIN_LOGIN)) return false;
  users.push({
    role: "admin",
    loginId: ADMIN_LOGIN,
    passwordHash: hashDJB2(DEFAULT_ADMIN_PASSWORD),
    createdAt: nowISO(),
    country: ""
  });
  saveUsers(users);
  return true;
}

export function prettyAccountType(t){
  if (t === "sm") return "SM";
  if (t === "dealer") return "Dealer";
  if (t === "operation") return "Operation";
  return t || "";
}

export function listAccounts(country){
  const c = normCountry(country);
  return readUsers()
    .filter(u => u.role === "sm" && (!c || normCountry(u.country) === c))
    .map(u => ({ ...u, accountType: u.accountType || "sm" }));
}

function loginExistsInCountry(users, loginId, countryCode){
  return users.some(u =>
    u.role === "sm" &&
    norm(u.loginId).toLowerCase() === norm(loginId).toLowerCase() &&
    normCountry(u.country) === countryCode
  );
}

export function createAccount({
  loginId,
  password,
  accountType = "sm",
  name = "",
  surname = "",
  country
}){
  loginId = norm(loginId);
  name = norm(name);
  surname = norm(surname);
  country = normCountry(country);

  if (!loginId) return { ok:false, reason:"Enter Login" };
  if (!password || password.length < MIN_PASS) return { ok:false, reason:`Password must be >= ${MIN_PASS}` };
  if (!ALLOWED_ACCOUNT_TYPES.includes(accountType)) return { ok:false, reason:"Invalid type" };
  if (!country || !isCountryCode(country)) return { ok:false, reason:"Country required" };

  if (accountType !== "operation" && (!name || !surname)){
    return { ok:false, reason:"Enter name & surname" };
  }

  const users = readUsers();
  if (loginExistsInCountry(users, loginId, country)){
    return { ok:false, reason:"Login exists in this country" };
  }

  users.push({
    role: "sm",
    accountType,
    loginId,
    passwordHash: hashDJB2(password),
    name: accountType !== "operation" ? name : undefined,
    surname: accountType !== "operation" ? surname : undefined,
    country,
    createdAt: nowISO()
  });
  saveUsers(users);
  return { ok:true };
}

/* Only ADMIN can create accounts now */
export function createAccountScoped(session, {
  loginId,
  password,
  accountType = "sm",
  name = "",
  surname = ""
}){
  if (!session || session.role !== "admin"){
    return { ok:false, reason:"Forbidden" };
  }
  if (!session.country){
    return { ok:false, reason:"Admin country not set (relogin)" };
  }
  const country = normCountry(session.country);
  return createAccount({
    loginId,
    password,
    accountType,
    name: accountType === "operation" ? "" : name,
    surname: accountType === "operation" ? "" : surname,
    country
  });
}

export function resetAccountPassword(loginId, newPassword){
  newPassword = norm(newPassword);
  if (!newPassword || newPassword.length < MIN_PASS) return { ok:false, reason:`Password must be >= ${MIN_PASS}` };
  const users = readUsers();
  const idx = users.findIndex(u => u.role === "sm" && u.loginId === loginId);
  if (idx === -1) return { ok:false, reason:"Account not found" };
  users[idx].passwordHash = hashDJB2(newPassword);
  users[idx].updatedAt = nowISO();
  saveUsers(users);
  return { ok:true };
}

export function deleteAccount(loginId){
  const users = readUsers();
  const filtered = users.filter(u => !(u.role === "sm" && u.loginId === loginId));
  if (filtered.length === users.length) return { ok:false, reason:"Account not found" };
  saveUsers(filtered);
  return { ok:true };
}

export function changeAccountPassword(loginId, oldPassword, newPassword){
  const users = readUsers();
  const idx = users.findIndex(u => u.role === "sm" && u.loginId === loginId);
  if (idx === -1) return { ok:false, reason:"User not found" };
  const u = users[idx];
  if (u.accountType === "operation") return { ok:false, reason:"Operation password via admin" };
  if (u.passwordHash !== hashDJB2(oldPassword)) return { ok:false, reason:"Current password incorrect" };
  if (!newPassword || newPassword.length < MIN_PASS) return { ok:false, reason:`New password must be >= ${MIN_PASS}` };
  u.passwordHash = hashDJB2(newPassword);
  u.updatedAt = nowISO();
  saveUsers(users);
  return { ok:true };
}

export function changeAdminPassword(oldPassword, newPassword){
  const users = readUsers();
  const idx = users.findIndex(u => u.role === "admin" && u.loginId === ADMIN_LOGIN);
  if (idx === -1) return { ok:false, reason:"Admin missing" };
  if (users[idx].passwordHash !== hashDJB2(oldPassword)) return { ok:false, reason:"Current password incorrect" };
  if (!newPassword || newPassword.length < MIN_PASS) return { ok:false, reason:`New password must be >= ${MIN_PASS}` };
  users[idx].passwordHash = hashDJB2(newPassword);
  users[idx].updatedAt = nowISO();
  saveUsers(users);
  return { ok:true };
}

export function authenticateAny(loginId, password, { chosenCountry } = {}){
  loginId = norm(loginId);
  const users = readUsers();
  const u = users.find(x => x.loginId === loginId);
  if (!u) return { ok:false, reason:"User not found" };
  if (u.passwordHash !== hashDJB2(password || "")) return { ok:false, reason:"Invalid password" };

  if (u.role === "admin"){
    const chosen = normCountry(chosenCountry);
    if (!chosen) return { ok:false, reason:"Select country" };
    if (!isCountryCode(chosen)) return { ok:false, reason:"Invalid country" };
    return { ok:true, role:"admin", loginId: u.loginId, country: chosen };
  }

  if (u.role === "sm"){
    const chosen = normCountry(chosenCountry);
    const stored = normCountry(u.country);
    if (!stored && chosen){
      u.country = chosen;
      saveUsers(users);
    } else if (chosen && stored && stored !== chosen){
      return { ok:false, reason:"Wrong country" };
    }
    return {
      ok:true,
      role:"sm",
      accountType: u.accountType || "sm",
      loginId: u.loginId,
      name: u.name || "",
      surname: u.surname || "",
      country: u.country
    };
  }

  return { ok:false, reason:"Unsupported role" };
}