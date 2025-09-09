// -------- Constants --------
const UPDATES_KEY = "AH_UPDATES_V1";

// -------- Internal Utils --------
function nowISO(){ return new Date().toISOString(); }
function norm(s){ return String(s||"").trim(); }

function readAllRaw(){
  try { return JSON.parse(localStorage.getItem(UPDATES_KEY) || "[]"); } catch { return []; }
}
function writeAll(arr){
  localStorage.setItem(UPDATES_KEY, JSON.stringify(arr));
}
function genId(){
  return "upd_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

// Ограниченно разрешаем простое форматирование (для Ctrl+B/I/U в UI)
function sanitizeHtml(html){
  if(!html) return "";
  const tmp=document.createElement("div");
  tmp.innerHTML=html;
  const allowed=new Set(["B","I","U","STRONG","EM","BR"]);
  (function walk(node){
    const children=[...node.childNodes];
    for(const c of children){
      if(c.nodeType===1){
        if(!allowed.has(c.tagName)){
          const frag=document.createDocumentFragment();
            while(c.firstChild) frag.appendChild(c.firstChild);
          c.replaceWith(frag);
          walk(frag);
        } else {
          walk(c);
        }
      }
    }
  })(tmp);
  return tmp.innerHTML.trim();
}

// -------- Role helpers --------
function isAdmin(session){ return session && session.role === "admin"; }
function isOperation(session){ return session && session.role === "operation"; }
function isSm(session){ return session && session.role === "sm"; }
function canCreate(session){ return (isAdmin(session) || isOperation(session)) && !!session.country; }
function canApprove(session){ return isAdmin(session); }
function sameCountry(session, upd){ return !!session?.country && upd.country === session.country; }

// -------- Migration-on-read (старые объекты без html) --------
function normalizeLoaded(list){
  for(const u of list){
    if(u.html == null){
      // старый формат
      const safe = norm(u.text||"");
      u.html = safe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }
    if(!u.status) u.status = "approved";
    if(!u.ack) u.ack = {};
  }
  return list;
}

// -------- Core create (расширенный) --------
export function createUpdate({ text = "", html = "", imageUrl = "" }, session){
  if(!canCreate(session)) return { ok:false, reason:"Forbidden" };
  if(!session.country) return { ok:false, reason:"No session country" };

  if(!html) html = text;
  html = sanitizeHtml(html);
  imageUrl = norm(imageUrl);

  if(!html && !imageUrl) return { ok:false, reason:"Add text or image" };

  const status = isAdmin(session) ? "approved" : "pending";
  const upd = {
    id: genId(),
    country: session.country,
    text: html.replace(/<br\s*\/?>/gi,"\n").replace(/<\/?(b|i|u|strong|em)>/gi,""), // для сохранения совместимости (plain fallback)
    html,
    imageUrl,
    status,
    createdAt: nowISO(),
    createdBy: { loginId: session.loginId, role: session.role },
    ack: {}
  };
  if(status === "approved"){
    upd.approvedAt = upd.createdAt;
    upd.approvedBy = { loginId: session.loginId };
  }
  const list = normalizeLoaded(readAllRaw());
  list.unshift(upd);
  writeAll(list);
  return { ok:true, update: upd };
}

// -------- Edit update --------
export function editUpdate(id, changes, session){
  const list = normalizeLoaded(readAllRaw());
  const idx = list.findIndex(u => u.id === id);
  if(idx === -1) return { ok:false, reason:"Not found" };
  const upd = list[idx];
  if(!sameCountry(session, upd)) return { ok:false, reason:"Country mismatch" };

  const isOwnPending = isOperation(session) && upd.createdBy?.loginId === session.loginId && upd.status === "pending";
  if(!(isAdmin(session) || isOwnPending)) return { ok:false, reason:"Forbidden" };

  if(changes.html != null || changes.text != null){
    const newHtml = sanitizeHtml(changes.html != null ? changes.html : changes.text);
    upd.html = newHtml;
    upd.text = newHtml.replace(/<br\s*\/?>/gi,"\n").replace(/<\/?(b|i|u|strong|em)>/gi,"");
  }
  if(changes.imageUrl !== undefined){
    upd.imageUrl = norm(changes.imageUrl);
  }
  if(isAdmin(session) && changes.status && ["pending","approved","archived"].includes(changes.status)){
    if(changes.status === "approved" && upd.status !== "approved"){
      upd.approvedAt = nowISO();
      upd.approvedBy = { loginId: session.loginId };
    }
    upd.status = changes.status;
  }
  upd.updatedAt = nowISO();
  upd.updatedBy = { loginId: session.loginId };
  list[idx] = upd;
  writeAll(list);
  return { ok:true, update: upd };
}

// -------- Approve (отдельной кнопкой) --------
export function approveUpdate(id, session){
  if(!canApprove(session)) return { ok:false, reason:"Forbidden" };
  const list = normalizeLoaded(readAllRaw());
  const idx = list.findIndex(u => u.id === id);
  if(idx === -1) return { ok:false, reason:"Not found" };
  const upd = list[idx];
  if(upd.status !== "approved"){
    upd.status = "approved";
    upd.approvedAt = nowISO();
    upd.approvedBy = { loginId: session.loginId };
    upd.updatedAt = upd.approvedAt;
    upd.updatedBy = { loginId: session.loginId };
    list[idx] = upd;
    writeAll(list);
  }
  return { ok:true, update: upd };
}

// -------- Delete --------
export function deleteUpdate(id, session){
  const list = normalizeLoaded(readAllRaw());
  const idx = list.findIndex(u => u.id === id);
  if(idx === -1) return { ok:false, reason:"Not found" };
  const upd = list[idx];
  const isOwnPending = isOperation(session) && upd.createdBy?.loginId === session.loginId && upd.status === "pending";
  if(!(isAdmin(session) || isOwnPending)) return { ok:false, reason:"Forbidden" };
  list.splice(idx,1);
  writeAll(list);
  return { ok:true };
}

// -------- Listing (approved only, как раньше) --------
export function listCountryUpdates(session){
  if(!session?.country) return [];
  return normalizeLoaded(readAllRaw())
    .filter(u => u.country === session.country && u.status === "approved")
    .sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

// -------- Расширенный список для таблицы --------
export function listAllUpdates(session, { includePending=false, includeArchived=false } = {}){
  if(!session?.country) return [];
  const all = normalizeLoaded(readAllRaw()).filter(u => u.country === session.country);
  if(isAdmin(session)) return all;
  if(isOperation(session)){
    return all.filter(u=>{
      if(u.status==="approved") return true;
      if(includePending && u.status==="pending") return true;
      if(includeArchived && u.status==="archived") return true;
      if(u.createdBy?.loginId === session.loginId && u.status==="pending") return true;
      return false;
    });
  }
  if(isSm(session)){
    return all.filter(u => u.status === "approved");
  }
  return [];
}

// ========== Backward Compatibility Layer ==========
export function addUpdate(session, { text = "" }) {
  return createUpdate({ text, html: text }, session);
}
export function listUpdates(session){
  return listCountryUpdates(session);
}

// -------- Acknowledgements --------
// acknowledgeUpdate(updateId, session, targetSmLogin?)
// sm: может отмечать только себя
// admin/operation: могут отметить любого sm (или себя)
export function acknowledgeUpdate(updateId, session, targetSmLogin){
  const list = normalizeLoaded(readAllRaw());
  const upd = list.find(u => u.id === updateId);
  if(!upd) return { ok:false, reason:"Not found" };
  if(upd.status !== "approved") return { ok:false, reason:"Not allowed (not approved)" };
  if(!sameCountry(session, upd)) return { ok:false, reason:"Country mismatch" };

  let target;
  if(isSm(session)){
    if(targetSmLogin && targetSmLogin !== session.loginId) return { ok:false, reason:"Forbidden" };
    target = session.loginId;
  } else if(isAdmin(session) || isOperation(session)){
    target = targetSmLogin || session.loginId;
  } else {
    return { ok:false, reason:"Forbidden" };
  }

  if(!upd.ack) upd.ack = {};
  upd.ack[target] = { at: nowISO(), by: session.loginId, role: session.role };
  writeAll(list);
  return { ok:true, ack: upd.ack[target] };
}

export function isAcknowledged(updateId, smLogin){
  const list = normalizeLoaded(readAllRaw());
  const upd = list.find(u=>u.id===updateId);
  if(!upd || !upd.ack) return false;
  return !!upd.ack[smLogin];
}

export function getUpdateAcks(updateId){
  const list = normalizeLoaded(readAllRaw());
  const upd = list.find(u=>u.id===updateId);
  return upd?.ack || {};
}

// getAckMatrix(session, smLogins[]) -> [{ update, acks: {smLogin: ackObj|null} }]
export function getAckMatrix(session, smLogins){
  const ups = listAllUpdates(session); // admin/operation могут видеть pending; sm только approved
  return ups.map(u=>{
    const row = { update: u, acks:{} };
    for(const sm of smLogins){
      row.acks[sm] = (u.ack && u.ack[sm]) ? u.ack[sm] : null;
    }
    return row;
  });
}

// -------- Last-read counters (оставляем как было для старой UI логики) --------
function lastReadKey(login, country){
  return `AH_UPDATES_LASTREAD_V1_${login}_${country}`;
}
export function getLastRead(session){
  if(!session?.loginId || !session.country) return null;
  try { return localStorage.getItem(lastReadKey(session.loginId, session.country)); } catch { return null; }
}
export function markAllRead(session){
  if(!session?.loginId || !session.country) return;
  try { localStorage.setItem(lastReadKey(session.loginId, session.country), nowISO()); } catch {}
}
export function getUnreadCount(session){
  if(!session?.country) return 0;
  const last = getLastRead(session);
  const ups = listCountryUpdates(session);
  if(!last) return ups.length;
  return ups.filter(u => u.createdAt > last).length;
}

// -------- CSV Export (расширен: html + status) --------
export function exportUpdatesCsv(session, month){
  if(!session?.country) return { ok:false, reason:"No session country" };
  const rows = listAllUpdates(session,{includePending:true,includeArchived:true})
    .filter(u => !month || u.createdAt.slice(0,7) === month);

  const headers = ["id","createdAt","country","status","createdBy","approvedAt","html","imageUrl"];
  const lines = [
    headers.join(","),
    ...rows.map(u => headers.map(h=>{
      let val = "";
      if(h==="createdBy") val = u.createdBy?.loginId || "";
      else val = u[h] || "";
      return `"${String(val).replace(/"/g,'""')}"`;
    }).join(","))
  ];
  return { ok:true, csv: lines.join("\n") };
}