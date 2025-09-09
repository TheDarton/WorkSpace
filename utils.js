// Общие утилиты
export function hashDJB2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i);
  return (hash >>> 0).toString(16);
}
export function genId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export function getMonthKey(isoDate) {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
export function formatMonthKey(monthKey) {
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { year: "numeric", month: "long" });
}