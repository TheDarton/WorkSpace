import {
  migrateAccountTypes,
  ensureRootAdmin,
  authenticateAny,
  createAccountScoped,
  resetAccountPassword,
  deleteAccount,
  changeAccountPassword,
  changeAdminPassword,
  listAccounts,
  prettyAccountType,
  SUPPORTED_COUNTRIES
} from "./users.js";
import {
  renderGroupShiftScheduleView,
  mountGroupShiftSchedule
} from "./universal-shift-schedule.js";
import {
  listUpdates,
  addUpdate,
  deleteUpdate,
  getUnreadCount,
  markAllRead,
  getLastRead
} from "./updates.js";

const SESSION_KEY = "AH_SESSION_V1";
const APP_TITLE = "Amber-Studios Work Space";

let session = loadSession();
let rootEl, headerEl, sidebarEl, mainEl;

function loadSession(){ try { return JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); } catch { return null; } }
function saveSession(s){ if(!s) localStorage.removeItem(SESSION_KEY); else localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession(){ saveSession(null); session=null; }
function esc(s){ return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function accountLabel(t){ if(!t && session?.role==="admin") return "Admin"; if(t==="operation") return "Operation"; if(t==="dealer") return "Dealer"; if(t==="sm") return "SM"; return t||""; }

/* Удаление возможного legacy header */
function removeLegacyTopBar(){
  const sels=[ ".legacy-topbar","#legacy-topbar",".top-bar",".amber-old-header","header[data-legacy]",".old-app-header" ];
  sels.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove()));
  [...document.querySelectorAll("body > header")].forEach(h=>{
    if(!h.id || h.id!=="app-header"){
      if(/Shift Managers/i.test(h.textContent||"")) h.remove();
    }
  });
}

init();
function init(){
  migrateAccountTypes();
  ensureRootAdmin();
  removeLegacyTopBar();
  renderShell();
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

function renderShell(){
  rootEl = document.getElementById("app");
  if(!session){
    rootEl.innerHTML = `<main id="login-root"></main>`;
    headerEl=null; sidebarEl=null; mainEl=document.getElementById("login-root");
    viewLogin();
    return;
  }
  rootEl.innerHTML=`
    <div class="flex flex-col h-screen">
      <header id="app-header"></header>
      <div class="flex flex-1 min-h-0">
        <aside id="app-sidebar" class="w-60 border-r border-white/10 bg-slate-900/40 overflow-y-auto"></aside>
        <main id="app-main" class="flex-1 overflow-y-auto bg-slate-950/70"></main>
      </div>
    </div>
  `;
  headerEl=document.getElementById("app-header");
  sidebarEl=document.getElementById("app-sidebar");
  mainEl=document.getElementById("app-main");
  renderHeader();
  renderSidebar();
}

function renderHeader(){
  if(!headerEl) return;
  headerEl.innerHTML=`
    <div class="flex items-center gap-6 px-4 h-14 border-b border-white/10 bg-slate-900/80 backdrop-blur">
      <div class="flex items-center gap-3 min-w-0">
        ${session?`<span class="inline-flex items-center justify-center h-7 px-3 rounded-md text-[11px] font-medium bg-cyan-600/20 text-cyan-200 ring-1 ring-cyan-400/30">${esc(accountLabel(session.accountType))}</span>`:""}
        <h1 class="whitespace-nowrap text-base md:text-lg font-semibold tracking-wide">${esc(APP_TITLE)}</h1>
      </div>
      <div class="flex-1"></div>
      ${session?`
        <div class="flex items-center gap-3 text-sm">
          <div class="hidden md:flex items-center gap-2">
            <span class="font-medium">${esc(session.loginId)}</span>
            ${session.country?`<span class="opacity-70">· ${esc(session.country)}</span>`:""}
            ${session.role==="admin"?`<span class="px-2 py-0.5 rounded bg-white/10 text-[11px] uppercase tracking-wide">Admin</span>`:""}
          </div>
          <button id="btn-logout" class="px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 hover:bg-white/20 transition">Logout</button>
        </div>
      `:""}
    </div>
  `;
  headerEl.querySelector("#btn-logout")?.addEventListener("click", ()=>{
    clearSession();
    renderShell();
    window.location.hash="#/login";
  });
}

function linksForSession(){
  if(!session) return [];
  const isAdmin = session.role==="admin";
  const type = session.accountType;
  const arr=[];
  if(isAdmin){
    arr.push({href:"#/schedule/sm",label:"SM Schedule"});
    arr.push({href:"#/schedule/dealer",label:"Dealer Schedule"});
    arr.push({href:"#/updates",label:"Updates", unread:getUnreadCount(session)});
    arr.push({href:"#/admin/users",label:"Users"});
    arr.push({href:"#/admin/password",label:"Admin Password"});
  } else if(type==="operation"){
    // Operation может читать обновления? Если НЕ нужно — закомментировать следующую строку
    arr.push({href:"#/schedule/sm",label:"SM Schedule"});
    arr.push({href:"#/schedule/dealer",label:"Dealer Schedule"});
    arr.push({href:"#/updates",label:"Updates", unread:getUnreadCount(session)});
    arr.push({href:"#/account/password",label:"Password"});
  } else if(type==="sm"){
    arr.push({href:"#/schedule/sm",label:"SM Schedule"});
    arr.push({href:"#/updates",label:"Updates", unread:getUnreadCount(session)});
    arr.push({href:"#/account/password",label:"Password"});
  } else if(type==="dealer"){
    arr.push({href:"#/schedule/dealer",label:"Dealer Schedule"});
    arr.push({href:"#/account/password",label:"Password"});
  }
  return arr;
}

function renderSidebar(){
  if(!sidebarEl) return;
  if(!session){ sidebarEl.innerHTML=""; return; }
  const cur=window.location.hash;
  const links=linksForSession();
  sidebarEl.innerHTML=`
    <nav class="p-4 flex flex-col gap-1">
      ${links.map(l=>{
        const active=cur.startsWith(l.href);
        const badge = l.unread ? `<span class="ml-auto inline-block min-w-[1.25rem] text-center text-[10px] px-1 py-[2px] rounded bg-rose-500/80 text-white">${l.unread}</span>` : "";
        return `<a href="${l.href}" class="flex items-center gap-2 px-3 py-2 rounded text-sm ${active?"bg-brand/80 text-white":"hover:bg-white/10"}">${esc(l.label)}${badge}</a>`;
      }).join("")}
    </nav>
  `;
}

function requireAuth(){
  if(!session){
    window.location.hash="#/login";
    return false;
  }
  return true;
}

/* ================= LOGIN ================= */
function viewLogin(){
  const countryOptions=SUPPORTED_COUNTRIES.map(c=>`<option value="${c.code}">${esc(c.label)}</option>`).join("");
  mainEl.innerHTML=`
    <section class="min-h-screen grid place-items-center px-4">
      <div class="w-full max-w-md">
        <div class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-8">
          <h2 class="text-xl font-semibold mb-6">${esc(APP_TITLE)}</h2>
          <form id="loginForm" class="grid gap-4">
            <label class="grid gap-1">
              <span class="text-sm opacity-80">Country</span>
              <select name="country" class="px-3 py-2 rounded-lg bg-slate-900/50 ring-1 ring-white/10 focus:ring-brand outline-none">${countryOptions}</select>
            </label>
            <label class="grid gap-1">
              <span class="text-sm opacity-80">Login ID</span>
              <input name="login" required class="px-3 py-2 rounded-lg bg-slate-900/50 ring-1 ring-white/10 focus:ring-brand outline-none"/>
            </label>
            <label class="grid gap-1">
              <span class="text-sm opacity-80">Password</span>
              <input type="password" name="password" required class="px-3 py-2 rounded-lg bg-slate-900/50 ring-1 ring-white/10 focus:ring-brand outline-none"/>
            </label>
            <button class="rounded-lg bg-brand hover:bg-brand/80 px-4 py-2 font-medium text-sm">Sign in</button>
            <p id="loginError" class="text-rose-400 text-sm min-h-[1.5rem]"></p>
          </form>
        </div>
      </div>
    </section>
  `;
  document.getElementById("loginForm").addEventListener("submit", e=>{
    e.preventDefault();
    const f=e.currentTarget;
    const res=authenticateAny(f.login.value.trim(), f.password.value, { chosenCountry: f.country.value });
    const err=document.getElementById("loginError");
    if(!res.ok){ err.textContent=res.reason||"Login failed"; }
    else{
      session=res;
      if(session.role==="admin") session.country=f.country.value;
      saveSession(session);
      renderShell();
      if(session.role==="admin" || session.accountType==="operation") window.location.hash="#/schedule/sm";
      else if(session.accountType==="dealer") window.location.hash="#/schedule/dealer";
      else window.location.hash="#/schedule/sm";
    }
  });
}

/* ================= SCHEDULE ================= */
function viewSchedule(group){
  if(!requireAuth()) return;
  mainEl.innerHTML=renderGroupShiftScheduleView(session,{group});
  mountGroupShiftSchedule(mainEl,session,{group});
}

/* ================= ADMIN PASSWORD ================= */
function viewAdminPassword(){
  if(!requireAuth()) return;
  if(session.role!=="admin"){
    mainEl.innerHTML=`<div class="p-6 text-sm text-rose-300">403: Access denied.</div>`;
    return;
  }
  mainEl.innerHTML=`
    <div class="p-6 max-w-md space-y-6">
      <h2 class="text-xl font-semibold">Change Admin Password</h2>
      <form id="admPwForm" class="flex flex-col gap-4 bg-white/5 p-4 rounded-xl ring-1 ring-white/10">
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">Current</span>
          <input name="old" type="password" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">New</span>
          <input name="new" type="password" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <button class="bg-brand hover:bg-brand/80 text-sm px-4 py-2 rounded text-white">Update</button>
        <p id="admPwErr" class="text-xs text-rose-400 min-h-[1rem]"></p>
      </form>
    </div>
  `;
  document.getElementById("admPwForm").addEventListener("submit", e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const r=changeAdminPassword(fd.get("old"), fd.get("new"));
    document.getElementById("admPwErr").textContent = r.ok ? "Updated" : (r.reason||"Failed");
  });
}

/* ================= ACCOUNT PASSWORD ================= */
function viewAccountPassword(){
  if(!requireAuth()) return;
  if(session.role==="admin"){ viewAdminPassword(); return; }
  if(session.accountType==="operation"){
    mainEl.innerHTML=`<div class="p-6 text-sm opacity-80">Operation password via admin.</div>`;
    return;
  }
  mainEl.innerHTML=`
    <div class="p-6 max-w-md space-y-6">
      <h2 class="text-xl font-semibold">Change Password</h2>
      <form id="acctPwForm" class="flex flex-col gap-4 bg-white/5 p-4 rounded-xl ring-1 ring-white/10">
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">Current</span>
          <input name="old" type="password" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">New</span>
          <input name="new" type="password" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <button class="bg-brand hover:bg-brand/80 text-sm px-4 py-2 rounded text-white">Update</button>
        <p id="acctPwErr" class="text-xs text-rose-400 min-h-[1rem]"></p>
      </form>
    </div>
  `;
  document.getElementById("acctPwForm").addEventListener("submit", e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const r=changeAccountPassword(session.loginId, fd.get("old"), fd.get("new"));
    document.getElementById("acctPwErr").textContent = r.ok ? "Updated" : (r.reason||"Failed");
  });
}

/* ================= USERS (ADMIN) ================= */
function viewUsers(){
  if(!requireAuth()) return;
  if(session.role!=="admin"){
    mainEl.innerHTML=`<div class="p-6 text-sm text-rose-300">403: Access denied.</div>`;
    return;
  }
  const country=session.country||"";
  const accounts=listAccounts(country);
  const rows=accounts.map(u=>`
    <tr class="border-b border-white/5">
      <td class="px-2 py-1 text-xs">${esc(u.loginId)}</td>
      <td class="px-2 py-1 text-xs">${esc(prettyAccountType(u.accountType))}</td>
      <td class="px-2 py-1 text-xs">${esc(u.name||"")}</td>
      <td class="px-2 py-1 text-xs">${esc(u.surname||"")}</td>
      <td class="px-2 py-1 text-xs">${esc(u.country||"")}</td>
      <td class="px-2 py-1 text-xs">
        <button data-reset="${u.loginId}" class="text-indigo-300 hover:underline mr-2">Reset PW</button>
        <button data-del="${u.loginId}" class="text-rose-300 hover:underline">Delete</button>
      </td>
    </tr>`).join("");
  mainEl.innerHTML=`
    <div class="p-6 space-y-6">
      <h2 class="text-xl font-semibold">Accounts (country: ${esc(country)})</h2>
      <form id="addAccountForm" class="flex flex-col gap-4 bg-white/5 p-4 rounded-xl ring-1 ring-white/10 max-w-md">
        <div class="text-sm font-medium opacity-80">Create Account</div>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">Login ID</span>
          <input name="loginId" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">Password</span>
          <input name="password" type="password" required class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs opacity-60">Type</span>
          <select name="accountType" id="acctTypeSel" class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm">
            <option value="sm">SM</option>
            <option value="dealer">Dealer</option>
            <option value="operation">Operation</option>
          </select>
        </label>
        <div id="nameFields" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs opacity-60">Name</span>
            <input name="name" class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs opacity-60">Surname</span>
            <input name="surname" class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm"/>
          </label>
        </div>
        <button class="bg-brand hover:bg-brand/80 text-white text-sm px-4 py-2 rounded">Add</button>
        <p id="addAccountError" class="text-xs text-rose-400 min-h-[1rem]"></p>
      </form>
      <div class="overflow-auto rounded-xl ring-1 ring-white/10">
        <table class="w-full text-xs">
          <thead class="bg-slate-800/60">
            <tr>
              <th class="text-left px-2 py-2 font-semibold">Login</th>
              <th class="text-left px-2 py-2 font-semibold">Type</th>
              <th class="text-left px-2 py-2 font-semibold">Name</th>
              <th class="text-left px-2 py-2 font-semibold">Surname</th>
              <th class="text-left px-2 py-2 font-semibold">Country</th>
              <th class="text-left px-2 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" class="text-center text-slate-400 py-4">No accounts</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
  const typeSel=document.getElementById("acctTypeSel");
  const nameFields=document.getElementById("nameFields");
  function updateNameVisibility(){
    if(typeSel.value==="operation"){
      nameFields.classList.add("hidden");
      nameFields.querySelectorAll("input").forEach(i=>i.value="");
    } else nameFields.classList.remove("hidden");
  }
  typeSel.addEventListener("change", updateNameVisibility);
  updateNameVisibility();

  document.getElementById("addAccountForm").addEventListener("submit", e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const res=createAccountScoped(session,{
      loginId:fd.get("loginId"),
      password:fd.get("password"),
      accountType:fd.get("accountType"),
      name:fd.get("name"),
      surname:fd.get("surname")
    });
    const err=document.getElementById("addAccountError");
    if(!res.ok) err.textContent=res.reason||"Failed"; else viewUsers();
  });

  mainEl.querySelectorAll("[data-reset]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=btn.getAttribute("data-reset");
      const np=prompt("New password (>=4 chars)"); if(!np) return;
      const r=resetAccountPassword(id,np);
      if(!r.ok) alert(r.reason); else alert("Updated");
    });
  });
  mainEl.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=btn.getAttribute("data-del");
      if(!confirm(`Delete account ${id}?`)) return;
      const r=deleteAccount(id);
      if(!r.ok) alert(r.reason); else viewUsers();
    });
  });
}

/* ================= UPDATES ================= */
function viewUpdates(){
  if(!requireAuth()) return;
  // Кто видит: admin, operation (если оставили), sm. Dealer — нет.
  const canView = session.role==="admin" || session.accountType==="operation" || session.accountType==="sm";
  if(!canView){
    mainEl.innerHTML=`<div class="p-6 text-sm text-rose-300">403: Access denied.</div>`;
    return;
  }
  const isAdmin = session.role==="admin";
  const updates = listUpdates(session);
  const lastRead = getLastRead(session);
  const itemsHtml = updates.map(u=>{
    const isNew = !lastRead || u.createdAt > lastRead;
    return `
      <div class="relative rounded-lg ring-1 ring-white/10 bg-white/5 p-3 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <span class="text-xs opacity-60">${esc(new Date(u.createdAt).toLocaleString())}</span>
            ${isNew?`<span class="px-2 py-0.5 rounded bg-rose-500/30 text-rose-100 text-[10px] font-semibold">NEW</span>`:""}
          </div>
          ${isAdmin?`<button data-del="${u.id}" class="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-200 hover:bg-rose-500/30">Delete</button>`:""}
        </div>
        <div class="text-sm leading-snug whitespace-pre-wrap break-words">${esc(u.text)}</div>
        <div class="text-[10px] opacity-40">by ${esc(u.authorLogin)}</div>
      </div>
    `;
  }).join("");

  mainEl.innerHTML=`
    <div class="p-6 space-y-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-semibold">Updates (${esc(session.country||"")})</h2>
        <p class="text-xs opacity-60">
          ${isAdmin
            ?"Admin: может добавлять и удалять обновления для своей страны."
            :"Read only."}
        </p>
      </div>
      ${isAdmin?`
        <form id="updForm" class="flex flex-col gap-3 bg-white/5 p-4 rounded-xl ring-1 ring-white/10 max-w-xl">
          <textarea name="text" rows="3" placeholder="Новое обновление..." class="px-3 py-2 rounded bg-slate-900/50 ring-1 ring-white/10 text-sm resize-y" required></textarea>
          <div class="flex items-center gap-3">
            <button class="bg-brand hover:bg-brand/80 text-white text-sm px-4 py-2 rounded">Post</button>
            <p id="updErr" class="text-xs text-rose-400 min-h-[1rem] flex-1"></p>
          </div>
        </form>
      `:""}
      <div class="space-y-3" id="updList">
        ${updates.length ? itemsHtml : `<div class="text-sm opacity-50">Нет обновлений.</div>`}
      </div>
    </div>
  `;

  if(isAdmin){
    document.getElementById("updForm").addEventListener("submit", e=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const r=addUpdate(session,{ text: fd.get("text") });
      const err=document.getElementById("updErr");
      if(!r.ok) err.textContent=r.reason||"Failed";
      else viewUpdates();
    });
  }

  mainEl.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=btn.getAttribute("data-del");
      if(!confirm("Delete this update?")) return;
      const r=deleteUpdate(session,id);
      if(!r.ok) alert(r.reason); else viewUpdates();
    });
  });

  // После отображения помечаем прочитанными (чтобы NEW исчезло при следующем заходе)
  markAllRead(session);
  // Обновляем сайдбар (счётчик)
  renderSidebar();
}

/* ================= ROUTER ================= */
function handleRoute(){
  const h=window.location.hash||"#/login";
  if(h.startsWith("#/login")){
    if(session){
      if(session.role==="admin" || session.accountType==="operation") window.location.hash="#/schedule/sm";
      else if(session.accountType==="dealer") window.location.hash="#/schedule/dealer";
      else window.location.hash="#/schedule/sm";
      return;
    }
    viewLogin();
    return;
  }
  if(!session){ window.location.hash="#/login"; return; }

  if(h.startsWith("#/schedule/sm")) viewSchedule("sm");
  else if(h.startsWith("#/schedule/dealer")) viewSchedule("dealer");
  else if(h.startsWith("#/updates")) viewUpdates();
  else if(h.startsWith("#/admin/users")) viewUsers();
  else if(h.startsWith("#/admin/password")) viewAdminPassword();
  else if(h.startsWith("#/account/password")) viewAccountPassword();
  else {
    if(session.role==="admin" || session.accountType==="operation") viewSchedule("sm");
    else if(session.accountType==="dealer") viewSchedule("dealer");
    else viewSchedule("sm");
  }
  renderHeader();
  renderSidebar();
}