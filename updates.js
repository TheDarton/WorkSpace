// updates.js — Country-scoped Updates
// Только admin: создаёт обновления (status="approved").
// SM и (при желании) Operation читают. Dealer не видит.
// ВОССТАНОВЛЕНЫ старые функции: addUpdate, listUpdates, getUnreadCount, markAllRead, getLastRead,
// чтобы не ломать существующий app.js.
//
// Хранение:
//  - Ключ AH_UPDATES_V1: массив объектов { id, country, text, imageUrl, status, createdAt, createdBy:{loginId} }
//  - Ключ AH_UPDATES_LASTREAD_V1_<login>_<country>: ISO время последнего посещения раздела Updates (для бейджа "NEW"/счётчика)
//
// Если позже понадобится "pending/approved/rejected" или ack поштучно — можно расширить.

// -------- Constants --------
const UPDATES_KEY = "AH_UPDATES_V1";

// -------- Internal Utils --------
function nowISO(){ return new Date().toISOString(); }
function norm(s){ return String(s||"").trim(); }

function readAll(){
  try { return JSON.parse(localStorage.getItem(UPDATES_KEY) || "[]"); } catch { return []; }
}
function writeAll(arr){
  localStorage.setItem(UPDATES_KEY, JSON.stringify(arr));
}
function genId(){
  return "upd_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

// -------- Core (new) API --------
export function createUpdate({ text = "", imageUrl = "" }, session){
  if(!session || session.role !== "admin") return { ok:false, reason:"Forbidden" };
  if(!session.country) return { ok:false, reason:"No session country" };
  text = norm(text);
  imageUrl = norm(imageUrl);
  if(!text && !imageUrl) return { ok:false, reason:"Add text or image" };

  const upd = {
    id: genId(),
    country: session.country,
    text,
    imageUrl,
    status: "approved",
    createdAt: nowISO(),
    createdBy: { loginId: session.loginId }
  };
  const list = readAll();
  list.unshift(upd);            // в начало
  writeAll(list);
  return { ok:true, update: upd };
}

export function deleteUpdate(id, session){
  if(!session || session.role !== "admin") return { ok:false, reason:"Forbidden" };
  const list = readAll();
  const idx = list.findIndex(u => u.id === id && u.country === session.country);
  if(idx === -1) return { ok:false, reason:"Not found" };
  list.splice(idx,1);
  writeAll(list);
  return { ok:true };
}

// -------- Country-scoped list --------
export function listCountryUpdates(session){
  if(!session?.country) return [];
  return readAll()
    .filter(u => u.country === session.country && u.status === "approved")
    .sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
}

// ========== Backward Compatibility Layer ==========
// Старый код вызывал addUpdate(session,{text}) и listUpdates(session)

export function addUpdate(session, { text = "" }) {
  // адаптер к createUpdate
  return createUpdate({ text }, session);
}

export function listUpdates(session){
  return listCountryUpdates(session);
}

// -------- Last-read counters (как в ранней версии) --------
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

// -------- Optional helper (CSV export by month) --------
// Месяц формата YYYY-MM (например 2025-09)
export function exportUpdatesCsv(session, month){
  if(!session?.country) return { ok:false, reason:"No session country" };
  const rows = listCountryUpdates(session)
    .filter(u => !month || (u.createdAt.slice(0,7) === month));
  const headers = ["id","createdAt","country","text","imageUrl","createdBy"];
  const lines = [
    headers.join(","),
    ...rows.map(u => headers.map(h=>{
      const val = h==="createdBy" ? (u.createdBy?.loginId||"") : (u[h]||"");
      return `"${String(val).replace(/"/g,'""')}"`;
    }).join(","))
  ];
  return { ok:true, csv: lines.join("\n") };
}

// -------- (Заглушки для будущего ack поштучно) --------
// Если захотите вернуть ACK каждого обновления (галочка):
// - Добавить отдельное хранилище acks
// - Дописать функции isAcked(updateId, loginId) и markAck(updateId, loginId)
// Сейчас всё реализовано через lastRead (странично)

// Конец файл