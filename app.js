/* app.js — версия без обычного Updates.
 * Единственный экран обновлений: #/updates (advanced).
 * В матрице ACK показываются только персональные SM (без operation / dealer), колонка — ФИО.
 * Если хочешь убрать unread badge — можно удалить getUnreadCount() вызовы и бейдж.
 */

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
  // оставляем для бейджа unread
  listUpdates,
  getUnreadCount,
  markAllRead,
  getLastRead,
  // расширенные
  listAllUpdates,
  createUpdate,
  approveUpdate,
  editUpdate,
  acknowledgeUpdate,
  getAckMatrix,
  getSmUsers,
  exportUpdatesCsv,
  archiveUpdate,
  deleteUpdate
} from "./updates.js";

const SESSION_KEY = "AH_SESSION_V1";
const APP_TITLE = "Amber-Studios Work Space";

let session = loadSession();
let rootEl, headerEl, sidebarEl, mainEl;

/* ===== Utils ===== */
function loadSession(){ try { return JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); } catch { return null; } }
function saveSession(s){ if(!s) localStorage.removeItem(SESSION_KEY); else localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession(){ saveSession(null); session=null; }
function esc(s){ return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function accountLabel(t){
  if(!t && session?.role==="admin") return "Admin";
  if(t==="operation") return "Operation";
  if(t==="dealer") return "Dealer";
  if(t==="sm") return "SM";
  return t||"";
}

/* ===== Init ===== */
init();
function init(){
  migrateAccountTypes();
  ensureRootAdmin();
  removeLegacyTopBar();
  renderShell();
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

function removeLegacyTopBar(){
  const sels=[ ".legacy-topbar","#legacy-topbar",".top-bar",".amber-old-header","header[data-legacy]",".old-app-header" ];
  sels.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.remove()));
  [...document.querySelectorAll("body > header")].forEach(h=>{
    if(!h.id || h.id!=="app-header"){
      if(/Shift Managers/i.test(h.textContent||"")) h.remove();
    }
  });
}

/* ===== Shell ===== */
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
        ${session?`<span class="inline-flex items-center justify-center h-7 px-3 rounded-md text-[11px] font-medium bg-cyan-600/20 text-cyan-200 ring-1 ring-cyan-400/30">${esc(accountLabel(session.accountType||session.role||""))}</span>`:""}
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

/* ===== Login ===== */
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

/* ===== Schedule ===== */
function viewSchedule(group){
  if(!requireAuth()) return;
  mainEl.innerHTML=renderGroupShiftScheduleView(session,{group});
  mountGroupShiftSchedule(mainEl,session,{group});
}

/* ===== Advanced Updates (единственный экран) ===== */
function viewUpdates(){
  if(!requireAuth()) return;
  const isAdmin = session.role==="admin";
  const isOp = (session.accountType||"")==="operation";
  const isSm = session.accountType==="sm";
  if(!(isAdmin||isOp||isSm)){
    mainEl.innerHTML=`<div class="p-6 text-sm text-rose-300">403: Access denied.</div>`;
    return;
  }

  mainEl.innerHTML=`
    <style>
      .ack-btn{cursor:pointer;font-size:11px;display:inline-block;min-width:1.2rem;text-align:center;padding:2px 4px;border-radius:4px;}
      .ack-yes{background:#16a34a33;color:#4ade80;}
      .ack-no{background:#334155;color:#94a3b8;}
      .upd-fullscreen{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.85);z-index:1000;}
      .upd-fullscreen img{max-width:90%;max-height:90%;border:1px solid #fff2;border-radius:8px;}
      .upd-editor-toolbar button{font-size:11px;padding:2px 6px;border-radius:4px;background:#1e293b;color:#cbd5e1;}
      .upd-editor-toolbar button:hover{background:#334155;}
      .upd-editor-area{min-height:80px;padding:6px;outline:none;border-radius:6px;border:1px solid #334155;background:#0f172a;font-size:13px;}
      .upd-matrix th,.upd-matrix td{border:1px solid #ffffff14;padding:6px;font-size:11px;vertical-align:top;}
      .upd-matrix th{background:#1e293b;font-weight:600;position:sticky;top:0;z-index:2;}
      .upd-status-badge{display:inline-block;font-size:10px;line-height:1;padding:2px 6px;border-radius:6px;background:#334155;color:#cbd5e1;}
      .upd-status-badge.pending{background:#d9770633;color:#fbbf24;}
      .upd-status-badge.archived{background:#64748b33;color:#94a3b8;text-decoration:line-through;}
      .upd-actions button{font-size:10px;padding:2px 6px;border-radius:4px;background:#1e293b;color:#cbd5e1;}
      .upd-actions button:hover{background:#334155;}
      .upd-html{font-size:12px;line-height:1.35;white-space:normal;word-break:break-word;}
      .upd-thumb{max-height:70px;margin-top:4px;border:1px solid #ffffff1a;border-radius:4px;cursor:pointer;}
      .upd-meta{font-size:10px;opacity:.55;margin-top:4px;}
      .upd-cell{min-width:240px;}
      .upd-editor-wrap{position:sticky;top:0;z-index:5;}
      .filter-bar input[type=checkbox]{accent-color:#0ea5e9;}
    </style>
    <div class="p-6 space-y-6">
      <div class="flex items-center gap-3 flex-wrap filter-bar">
        <h2 class="text-xl font-semibold">Updates (${esc(session.country||"")})</h2>
        <button id="btn-refresh" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Refresh</button>
        <button id="btn-export" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 ${isAdmin?"":"hidden"}">Export CSV</button>
        <label class="text-xs flex items-center gap-1">
          <input type="checkbox" id="chk-pending" checked>
          <span>Show pending</span>
        </label>
        <label class="text-xs flex items-center gap-1">
          <input type="checkbox" id="chk-archived">
          <span>Show archived</span>
        </label>
      </div>

      <div id="updEditorWrap" class="upd-editor-wrap max-w-xl ${(isAdmin||isOp)?"":"hidden"}">
        <div class="space-y-2 bg-white/5 p-4 rounded-xl ring-1 ring-white/10 backdrop-blur">
          <div class="upd-editor-toolbar flex gap-2">
            <button type="button" data-cmd="bold"><b>B</b></button>
            <button type="button" data-cmd="italic"><i>I</i></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <input type="file" accept="image/*" id="updImg" class="text-[10px]">
          </div>
          <div id="updEditor" class="upd-editor-area" contenteditable="true"></div>
          <div class="flex items-center gap-2">
            <button id="updSave" class="text-xs px-3 py-1 rounded bg-brand hover:bg-brand/80 text-white">Save</button>
            <button id="updCancel" class="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">Cancel</button>
            <p id="updErr" class="text-xs text-rose-400 flex-1"></p>
          </div>
          <img id="updPreview" class="max-h-40 rounded border border-white/10 hidden">
        </div>
      </div>

      <div>
        <div class="overflow-auto max-w-full">
          <table class="upd-matrix w-full" id="ackTable"></table>
        </div>
        <p class="text-[10px] opacity-50 mt-1">👁 = acknowledged</p>
      </div>
    </div>
    <div class="upd-fullscreen" id="updFs"><img></div>
  `;

  // ---- State ----
  let editId=null;
  let imageData="";
  let currentUpdates=[]; // сохраняем для поиска при редактировании

  const editor=document.getElementById("updEditor");
  const imgInput=document.getElementById("updImg");
  const preview=document.getElementById("updPreview");

  // Toolbar
  document.querySelectorAll(".upd-editor-toolbar button[data-cmd]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.execCommand(btn.getAttribute("data-cmd"));
      editor.focus();
    });
  });
  imgInput?.addEventListener("change", e=>{
    const f=e.target.files[0];
    if(f){
      const r=new FileReader();
      r.onload=ev=>{
        imageData=ev.target.result;
        preview.src=imageData;
        preview.classList.remove("hidden");
      };
      r.readAsDataURL(f);
    }
  });

  document.getElementById("updSave").addEventListener("click", ()=>{
    const html=editor.innerHTML.trim();
    if(!html && !imageData){ setErr("Empty"); return; }
    if(editId){
      const r=editUpdate(editId,{html,imageUrl:imageData},session);
      if(!r.ok) setErr(r.reason||"Err"); else { resetEditor(); refresh(); }
    } else {
      const r=createUpdate({html,imageUrl:imageData},session);
      if(!r.ok) setErr(r.reason||"Err"); else { resetEditor(); refresh(); }
    }
  });
  document.getElementById("updCancel").addEventListener("click", resetEditor);

  function resetEditor(){
    editId=null;
    imageData="";
    editor.innerHTML="";
    preview.src="";
    preview.classList.add("hidden");
    setErr("");
  }
  function setErr(m){ document.getElementById("updErr").textContent=m||""; }

  document.getElementById("btn-refresh").addEventListener("click", refresh);
  document.getElementById("chk-pending").addEventListener("change", refresh);
  document.getElementById("chk-archived").addEventListener("change", refresh);
  document.getElementById("btn-export")?.addEventListener("click", ()=>{
    const month=prompt("Month filter (YYYY-MM) or blank");
    const r=exportUpdatesCsv(session, month||undefined);
    if(!r.ok){ alert(r.reason||"Export failed"); return; }
    const blob=new Blob([r.csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`updates_${session.country}${month?`_${month}`:""}.csv`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),400);
  });

  document.getElementById("updFs").addEventListener("click", e=>{
    e.currentTarget.style.display="none";
  });

  function openEdit(id){
    const u=currentUpdates.find(x=>x.id===id);
    if(!u) return;
    editId=u.id;
    editor.innerHTML=u.html;
    imageData=u.imageUrl||"";
    if(imageData){ preview.src=imageData; preview.classList.remove("hidden"); }
    else preview.classList.add("hidden");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function smUsers(){
    // Только персональные SM (без operation/dealer)
    let users=[];
    try { users = JSON.parse(localStorage.getItem("AH_USERS_V1")||"[]"); } catch {}
    return users
      .filter(u=>u.role==="sm" && u.country===session.country && u.accountType!=="dealer" && u.accountType!=="operation")
      .map(u=>({
        loginId:u.loginId,
        name:(u.name||"").trim(),
        surname:(u.surname||"").trim()
      }));
  }

  function renderMatrix(){
    const table=document.getElementById("ackTable");
    const includePending=document.getElementById("chk-pending").checked;
    const includeArchived=document.getElementById("chk-archived").checked;

    currentUpdates = listAllUpdates(session,{
      includePending,
      includeArchived,
      includeApproved:true,
      ownPendingAlways:true
    });

    const users=smUsers();
    const smLogins=users.map(u=>u.loginId);
    // Строим матрицу
    const matrix = getAckMatrix(session, smLogins, {
      includePending,
      includeArchived
    });

    const head = `
      <thead>
        <tr>
          <th style="min-width:260px;">Update</th>
          ${users.map(u=>{
            const fio=(u.name||u.surname)?`${esc(u.name)} ${esc(u.surname)}`.trim():esc(u.loginId);
            return `<th>${fio}</th>`;
          }).join("")}
        </tr>
      </thead>
    `;

    const body = matrix.map(row=>{
      const u=row.update;
      const statusCls = `upd-status-badge ${u.status}`;
      const badge = u.status!=="approved"
        ? `<span class="${statusCls}">${esc(u.status)}</span>`
        : "";
      const canEdit = (isAdmin || (isOp && u.createdBy?.loginId===session.loginId && u.status==="pending"));
      const actions = canEdit ? `
        <div class="upd-actions flex flex-wrap gap-1 mt-2">
          ${(isAdmin && u.status==="pending")?`<button data-approve="${u.id}">Approve</button>`:""}
          ${(isAdmin && u.status==="approved")?`<button data-archive="${u.id}">Archive</button>`:""}
          <button data-edit="${u.id}">Edit</button>
          <button data-del="${u.id}">Del</button>
        </div>`:"";
      const img = u.imageUrl ? `<img src="${u.imageUrl}" data-img="${u.imageUrl}" class="upd-thumb">`:"";
      const cell = `
        <div class="upd-cell">
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span>${esc(new Date(u.createdAt).toLocaleString())}</span>
            ${badge}
            <span class="opacity-60">by ${esc(u.createdBy?.loginId||"")}</span>
          </div>
          <div class="upd-html mt-1">${u.html}</div>
          ${img}
          <div class="upd-meta">${u.updatedAt?`upd ${esc(u.updatedAt)}`:""}</div>
          ${actions}
        </div>
      `;

      const ackCells = smLogins.map(login=>{
        const ack = row.acks[login];
        const yes = !!ack;
        const canMark = (session.loginId===login) || isAdmin || isOp;
        return `<td style="text-align:center;">
          <span class="ack-btn ${yes?"ack-yes":"ack-no"}"
            data-ack="${u.id}::${login}"
            data-enabled="${canMark?1:0}"
            title="${yes?esc(ack.at):'Mark'}">${yes?"👁":"○"}</span>
        </td>`;
      }).join("");

      return `<tr class="${u.status}"><td>${cell}</td>${ackCells}</tr>`;
    }).join("");

    table.innerHTML = head + `<tbody>${body || `<tr><td colspan="${1+smLogins.length}" class="text-center text-xs opacity-50">No updates</td></tr>`}</tbody>`;

    // Bind actions:
    table.querySelectorAll("[data-edit]").forEach(b=>{
      b.addEventListener("click", ()=>openEdit(b.getAttribute("data-edit")));
    });
    table.querySelectorAll("[data-del]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id=b.getAttribute("data-del");
        if(!confirm("Delete?")) return;
        const r=deleteUpdate(session,id);
        if(!r.ok) alert(r.reason); else refresh();
      });
    });
    table.querySelectorAll("[data-approve]").forEach(b=>{
      b.addEventListener("click", ()=>{
        approveUpdate(b.getAttribute("data-approve"), session);
        refresh();
      });
    });
    table.querySelectorAll("[data-archive]").forEach(b=>{
      b.addEventListener("click", ()=>{
        if(!confirm("Archive?")) return;
        archiveUpdate(b.getAttribute("data-archive"), session);
        refresh();
      });
    });
    table.querySelectorAll("[data-img]").forEach(img=>{
      img.addEventListener("click", ()=>{
        const fs=document.getElementById("updFs");
        fs.style.display="flex";
        fs.querySelector("img").src=img.getAttribute("data-img");
      });
    });
    table.querySelectorAll("[data-ack]").forEach(span=>{
      span.addEventListener("click", ()=>{
        if(span.getAttribute("data-enabled")!=="1") return;
        const [id,login]=span.getAttribute("data-ack").split("::");
        acknowledgeUpdate(id, session, (isAdmin||isOp)?login:undefined);
        // частичный апдейт ячейки:
        refreshMatrixOnly();
      });
    });
  }

  function refresh(){
    renderMatrix();
    markAllRead(session);     // обновляем счётчик
    renderSidebar();          // чтобы badge исчез
  }
  function refreshMatrixOnly(){
    renderMatrix();
  }

  // Shortcuts
  editor.addEventListener("keydown", e=>{
    if(!e.ctrlKey) return;
    const k=e.key.toLowerCase();
    const map={b:"bold",i:"italic",u:"underline"};
    if(map[k]){ document.execCommand(map[k]); e.preventDefault(); }
  });

  refresh();
}

  function refresh(){
    const includePending = document.getElementById("chk-pending").checked;
    const includeArchived = document.getElementById("chk-archived").checked;
    const ups = listAllUpdates(session,{
      includePending,
      includeArchived,
      includeApproved:true,
      ownPendingAlways:true
    });
    renderUpdates(ups);
    refreshMatrixOnly();
    markAllRead(session); // считаем approved как прочитанные
    renderSidebar();
  }

  function refreshMatrixOnly(){
    const smUsers = getSmUsers(session); // персональные SM
    const includePending = document.getElementById("chk-pending").checked;
    const includeArchived = document.getElementById("chk-archived").checked;
    const ups = listAllUpdates(session,{
      includePending,
      includeArchived,
      includeApproved:true,
      ownPendingAlways:true
    });
    renderMatrix(ups, smUsers);
  }

  editor.addEventListener("keydown", e=>{
    if(!e.ctrlKey) return;
    const k=e.key.toLowerCase();
    if(["b","i","u"].includes(k)){
      const map={b:"bold",i:"italic",u:"underline"}; document.execCommand(map[k]); e.preventDefault();
    }
  });

  refresh();

/* ===== Users / Password views (оставь свои прежние реализации) =====
   Ниже — упрощённые заглушки; замени на свои существующие функции при необходимости.
*/
function viewAdminPassword(){ mainEl.innerHTML=`<div class="p-6 text-sm opacity-60">Admin password screen (unchanged).</div>`; }
function viewAccountPassword(){ mainEl.innerHTML=`<div class="p-6 text-sm opacity-60">Account password screen (unchanged).</div>`; }
function viewUsers(){ mainEl.innerHTML=`<div class="p-6 text-sm opacity-60">Users screen (unchanged).</div>`; }

/* ===== Router ===== */
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
    else viewUpdates();
  }
  renderHeader();
  renderSidebar();
}