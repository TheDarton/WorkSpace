/* updates.js
 * Расширенный модуль обновлений (pending/approved/archived + ACK + экспорт)
 * Единственный UI теперь "Advanced" (app.js использует только расширенный режим).
 */

const UPDATES_KEY = "AH_UPDATES_V1";
const LASTREAD_KEY_PREFIX = "AH_UPDATES_LASTREAD_V1_";
const USERS_KEY = "AH_USERS_V1";

function nowISO(){ return new Date().toISOString(); }
function norm(v){ return String(v||"").trim(); }
function genId(){ return "upd_"+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }

function readJson(key,fallback){
  try {
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  }catch{ return fallback; }
}
function writeJson(key,val){
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function readAllRaw(){
  const arr = readJson(UPDATES_KEY, []);
  return Array.isArray(arr)?arr:[];
}
function writeAll(arr){
  writeJson(UPDATES_KEY, Array.isArray(arr)?arr:[]);
}

/* ---------- Role helpers ---------- */
function isAdmin(s){ return s && s.role==="admin"; }
function isOperation(s){ return s && s.role==="sm" && (s.accountType||"") === "operation"; }

/* ---------- Sanitization ---------- */
function sanitizeHtml(html){
  if(!html) return "";
  const tmp=document.createElement("div");
  tmp.innerHTML=html;
  const ALLOWED = new Set(["B","I","U","STRONG","EM","BR"]);
  (function walk(node){
    [...node.childNodes].forEach(c=>{
      if(c.nodeType===1){
        if(!ALLOWED.has(c.tagName)){
          if(["SCRIPT","IFRAME","STYLE"].includes(c.tagName)){
            c.remove();
            return;
          }
          const frag=document.createDocumentFragment();
          while(c.firstChild) frag.appendChild(c.firstChild);
          c.replaceWith(frag);
          walk(frag);
        } else {
          walk(c);
        }
      }
    });
  })(tmp);
  return tmp.innerHTML.trim();
}

/* ---------- Migration / normalization ---------- */
function loadList(){
  const list = readAllRaw();
  for(const u of list){
    if(!u.status) u.status = "approved";
    if(u.html == null){
      u.html = (u.text||"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");
    }
    if(u.ack && typeof u.ack !== "object") u.ack = {};
  }
  return list;
}

function htmlToPlain(html){
  if(!html) return "";
  return html
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/?(b|i|u|strong|em)>/gi,"")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&amp;/g,"&");
}

/* ---------- Create ---------- */
export function createUpdate({ html="", text="", imageUrl="" }, session){
  if(!session?.country) return { ok:false, reason:"No session country" };
  if(!(isAdmin(session) || isOperation(session))) return { ok:false, reason:"Forbidden" };

  if(!html && text) html=text;
  html = sanitizeHtml(html);
  text = norm(text) || htmlToPlain(html);
  if(!text && !imageUrl) return { ok:false, reason:"Empty" };

  const status = isAdmin(session) ? "approved" : "pending";
  const now = nowISO();
  const upd = {
    id: genId(),
    country: session.country,
    html,
    text,
    imageUrl: norm(imageUrl),
    status,
    createdAt: now,
    createdBy: {
      loginId: session.loginId,
      role: session.role,
      accountType: session.accountType
    },
    authorLogin: session.loginId,
    ack: {}
  };
  if(status==="approved"){
    upd.approvedAt = now;
    upd.approvedBy = { loginId: session.loginId };
  }
  const list = loadList();
  list.unshift(upd);
  writeAll(list);
  return { ok:true, update: upd };
}

/* (Legacy compatibility — оставлено для unread подсчёта) */
export function addUpdate(session,{ text="" }={}){
  return createUpdate({ text }, session);
}

/* ---------- Edit ---------- */
export function editUpdate(id, changes, session){
  if(!session) return { ok:false, reason:"No session" };
  const list = loadList();
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return { ok:false, reason:"Not found" };
  const upd = list[idx];
  if(upd.country !== session.country) return { ok:false, reason:"Country mismatch" };

  const ownPending = isOperation(session)
    && upd.createdBy?.loginId===session.loginId
    && upd.status==="pending";

  if(!(isAdmin(session) || ownPending)){
    return { ok:false, reason:"Forbidden" };
  }

  if(changes.html != null){
    const newHtml = sanitizeHtml(changes.html);
    upd.html = newHtml;
    upd.text = htmlToPlain(newHtml);
  } else if(changes.text != null){
    upd.text = norm(changes.text);
    upd.html = sanitizeHtml(upd.text);
  }
  if(changes.imageUrl !== undefined){
    upd.imageUrl = norm(changes.imageUrl);
  }
  if(isAdmin(session) && changes.status){
    const next = changes.status;
    if(["pending","approved","archived"].includes(next)){
      if(next==="approved" && upd.status!=="approved"){
        upd.approvedAt = nowISO();
        upd.approvedBy = { loginId: session.loginId };
      }
      upd.status = next;
    }
  }
  upd.updatedAt = nowISO();
  upd.updatedBy = { loginId: session.loginId };
  list[idx]=upd;
  writeAll(list);
  return { ok:true, update: upd };
}

export function approveUpdate(id, session){
  if(!isAdmin(session)) return { ok:false, reason:"Forbidden" };
  const list = loadList();
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return { ok:false, reason:"Not found" };
  const upd=list[idx];
  if(upd.country !== session.country) return { ok:false, reason:"Country mismatch" };
  if(upd.status!=="approved"){
    upd.status="approved";
    upd.approvedAt=nowISO();
    upd.approvedBy={ loginId: session.loginId };
    upd.updatedAt=upd.approvedAt;
    upd.updatedBy={ loginId: session.loginId };
    list[idx]=upd;
    writeAll(list);
  }
  return { ok:true, update: upd };
}

export function deleteUpdate(session,id){
  if(!session) return { ok:false, reason:"No session" };
  const list = loadList();
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return { ok:false, reason:"Not found" };
  const upd=list[idx];
  if(upd.country !== session.country) return { ok:false, reason:"Country mismatch" };
  const ownPending = isOperation(session)
    && upd.createdBy?.loginId===session.loginId
    && upd.status==="pending";
  if(!(isAdmin(session) || ownPending)) return { ok:false, reason:"Forbidden" };
  list.splice(idx,1);
  writeAll(list);
  return { ok:true };
}

/* ---------- Listing (approved only — для unread) ---------- */
export function listUpdates(session){
  if(!session?.country) return [];
  return loadList()
    .filter(u=>u.country===session.country && u.status==="approved")
    .sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

/* Полный список (advanced UI) */
export function listAllUpdates(session,{
  includePending=false,
  includeArchived=false,
  includeApproved=true,
  ownPendingAlways=true
} = {}){
  if(!session?.country) return [];
  const list=loadList().filter(u=>u.country===session.country);
  return list.filter(u=>{
    if(u.status==="approved" && includeApproved) return true;
    if(u.status==="pending"){
      if(includePending) return true;
      if(ownPendingAlways && isOperation(session) && u.createdBy?.loginId===session.loginId) return true;
      return false;
    }
    if(u.status==="archived") return includeArchived;
    return false;
  }).sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

/* ---------- ACK ---------- */
export function acknowledgeUpdate(id, session, targetSm){
  if(!session) return { ok:false, reason:"No session" };
  const list = loadList();
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return { ok:false, reason:"Not found" };
  const upd = list[idx];
  if(upd.country !== session.country) return { ok:false, reason:"Country mismatch" };
  // ACK только для approved (кроме admin/operation — можно и pending, если нужно)
  if(upd.status!=="approved" && !(isAdmin(session)||isOperation(session))){
    return { ok:false, reason:"Cannot ACK non-approved" };
  }
  let target = session.loginId;
  if(targetSm && (isAdmin(session)||isOperation(session))){
    target = targetSm;
  }
  if(!upd.ack) upd.ack = {};
  upd.ack[target] = { at: nowISO(), by: session.loginId, role: session.role };
  upd.updatedAt = nowISO();
  list[idx]=upd;
  writeAll(list);
  return { ok:true, ack: upd.ack[target] };
}

export function getAckMatrix(session, smLogins,{
  includePending=false,
  includeArchived=false
} = {}){
  const ups = listAllUpdates(session,{
    includePending,
    includeArchived,
    includeApproved:true,
    ownPendingAlways:true
  });
  return ups.map(u=>{
    const row={ update:u, acks:{} };
    for(const login of smLogins){
      row.acks[login] = u.ack?.[login] || null;
    }
    return row;
  });
}

/* ---------- SM helpers ---------- */
export function getSmLogins(session){
  // Исключаем operation и dealer
  if(!session?.country) return [];
  let users=[];
  try { users = JSON.parse(localStorage.getItem(USERS_KEY)||"[]"); } catch {}
  return users
    .filter(u=>u.role==="sm"
      && u.country===session.country
      && u.accountType!=="dealer"
      && u.accountType!=="operation")
    .map(u=>u.loginId);
}

export function getSmUsers(session){
  if(!session?.country) return [];
  let users=[];
  try { users = JSON.parse(localStorage.getItem(USERS_KEY)||"[]"); } catch {}
  return users
    .filter(u=>u.role==="sm"
      && u.country===session.country
      && u.accountType!=="dealer"
      && u.accountType!=="operation")
    .map(u=>({
      loginId: u.loginId,
      name: (u.name||"").trim(),
      surname: (u.surname||"").trim()
    }));
}

/* ---------- Unread ---------- */
function lastReadKey(login,country){ return `${LASTREAD_KEY_PREFIX}${login}_${country}`; }
export function getLastRead(session){
  if(!session?.loginId||!session.country) return null;
  try { return localStorage.getItem(lastReadKey(session.loginId, session.country)); } catch { return null; }
}
export function markAllRead(session){
  if(!session?.loginId||!session.country) return;
  try { localStorage.setItem(lastReadKey(session.loginId, session.country), nowISO()); } catch {}
}
export function getUnreadCount(session){
  if(!session?.country) return 0;
  const last = getLastRead(session);
  const ups = listUpdates(session);
  if(!last) return ups.length;
  return ups.filter(u=>u.createdAt > last).length;
}

/* ---------- Export CSV ---------- */
export function exportUpdatesCsv(session, month){
  if(!isAdmin(session)) return { ok:false, reason:"Forbidden" };
  const all = listAllUpdates(session,{
    includePending:true,
    includeArchived:true,
    includeApproved:true
  });
  const rows = month ? all.filter(u=>u.createdAt.slice(0,7)===month) : all;
  const headers = [
    "id","createdAt","status","country","author","approvedAt","approvedBy",
    "updatedAt","image","text","ackCount"
  ];
  const lines = [
    headers.join(","),
    ...rows.map(u=>{
      const ackCount = u.ack ? Object.keys(u.ack).length : 0;
      const line = headers.map(h=>{
        let v="";
        switch(h){
          case "id": v=u.id; break;
          case "createdAt": v=u.createdAt; break;
          case "status": v=u.status; break;
          case "country": v=u.country; break;
          case "author": v=u.createdBy?.loginId||""; break;
          case "approvedAt": v=u.approvedAt||""; break;
          case "approvedBy": v=u.approvedBy?.loginId||""; break;
          case "updatedAt": v=u.updatedAt||""; break;
          case "image": v=u.imageUrl? "yes":"no"; break;
          case "text": v=u.text||""; break;
          case "ackCount": v=ackCount; break;
        }
        return `"${String(v).replace(/"/g,'""')}"`;
      }).join(",");
      return line;
    })
  ];
  return { ok:true, csv: lines.join("\n") };
}

export function archiveUpdate(id, session){
  return editUpdate(id,{status:"archived"},session);
}