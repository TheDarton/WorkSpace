// Shift Schedule — по два блока таблиц на каждый CSV (schedule1.csv, schedule2.csv), свернутые под кнопкой месяца.
//
// Обновления:
// - Полностью исключена колонка "последняя смена прошлого месяца" (ORIG 3).
// - Мобильная автоподгонка (auto-fit): на экранах <= 640px каждая таблица автомасштабируется, чтобы влезать по ширин[...]
//   Без панелей зума и без влияния на остальное приложение.
//
// Таблица A (основная): ORIGINAL индексы 2 (ФИО) + 4..35 (дневные). Полностью пустые дневные столбцы удаляются.
// Таблица B (сводка): ORIGINAL индексы 2 (ФИО) + последние 7 колонок (динамически от конца).
//
// Визуал:
// - Фиксированные ширины через <colgroup> (W_NAME, W_DAY, W_GAP, W_SUM).
// - В Таблице A Sat/Sun — светло-красные в thead.
// - В Таблице B: объединение "Shifts" и "Total hours" по горизонтали с пустыми соседями (colspan).
// - "Месяц" (ячейка в h1 над ФИО) — rowspan=2.
// - Покраска смен: только для ORIGINAL 4..34 (X -> / -> ! -> s -> V -> 08/14 -> 16 -> 20/02).
//
// Роли:
// - Operation/Admin: видят все строки.
// - Personal: шапка + только свою строку (по ФИО из users).
//
import { getScheduleOrder, setScheduleOrder, readUsers } from "./storage.js";

const NAME_ORIG_IDX = 2;            // ФИО
const DAY_ORIG_START = 4;           // дневные колонки (окраска смен)
const DAY_ORIG_END = 34;            // включительно
const MAIN_END_ORIG = 35;           // Таблица A заканчивается на 35
const SUMMARY_TAIL_COLS = 7;        // последние 7 — сводка

// Ширины (px)
const W_NAME = 220;
const W_DAY = 42;
const W_GAP = 8;
const W_SUM = 62;

// ====== utils ======
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function normalizeName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 2; }
        else { inQ = false; i += 1; }
      } else { cur += ch; i += 1; }
    } else {
      if (ch === '"') { inQ = true; i += 1; }
      else if (ch === ",") { row.push(cur); cur = ""; i += 1; }
      else if (ch === "\r") { i += 1; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i += 1; }
      else { cur += ch; i += 1; }
    }
  }
  row.push(cur); rows.push(row);
  while (rows.length && rows[rows.length - 1].every(c => String(c).trim() === "")) rows.pop();
  return rows;
}
async function fetchCsvRows(fileBase) {
  const url = `./public/${fileBase}.csv?ts=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${fileBase}.csv: HTTP ${resp.status}`);
  const text = await resp.text();
  return parseCSV(text);
}
function getMonthTitle(rows, fallback = "Schedule") {
  const t = String((rows[1] || [])[NAME_ORIG_IDX] ?? "").trim();
  return t || fallback;
}

// ====== coloring ======
function styleForShift(val) {
  const raw = String(val || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^\s*X/.test(upper)) {
    return "background-color: rgba(244, 63, 94, 0.30); color: #ffe4e6;";
  }
  if (/^\s*\//.test(raw)) {
    return "background-color: rgba(100, 116, 139, 0.28); color: #f8fafc;";
  }
  if (/\!$/.test(raw)) {
    return "background-color: rgba(217, 70, 239, 0.28); color: #fdf4ff;";
  }
  if (/^\s*s/i.test(raw)) {
    return "background-color: rgba(250, 204, 21, 0.60); color: #0f172a;";
  }
  if (upper === "V") {
    return "background-color: rgba(16, 185, 129, 0.28); color: #ecfdf5;";
  }
  const m = upper.match(/(02|08|14|16|20)/);
  if (m) {
    const code = m[1];
    if (code === "08" || code === "14") return "background-color: rgba(245, 158, 11, 0.22); color: #fff7ed;";
    if (code === "16")                   return "background-color: rgba(249, 115, 22, 0.24); color: #fff7ed;";
    if (code === "20" || code === "02") return "background-color: rgba(14, 165, 233, 0.28); color: #f0f9ff;";
  }
  return "";
}
function weekendHeaderStyle() {
  return "background-color: rgba(244, 63, 94, 0.14); color: #fecaca;";
}

// ====== indices helpers ======
function pickByOrigIndices(row, origIndices) {
  return origIndices.map(idx => row[idx] ?? "");
}
function getTotalCols(rows) {
  return (rows[1] || []).length;
}

// Удаляем полностью пустые дневные столбцы (только в Таблице A)
function filterEmptyDayColumns(origIndices, rows) {
  const h1 = rows[1] || [];
  const h2 = rows[2] || [];
  const keep = [];
  for (const idx of origIndices) {
    if (idx < DAY_ORIG_START || idx > MAIN_END_ORIG) { keep.push(idx); continue; }
    const t1 = String(h1[idx] ?? "").trim();
    const t2 = String(h2[idx] ?? "").trim();
    if (t1 !== "" || t2 !== "") { keep.push(idx); continue; }
    // оба заголовка пустые — проверим данные
    let allEmpty = true;
    for (let r = 3; r < rows.length; r++) {
      if (String(rows[r]?.[idx] ?? "").trim() !== "") { allEmpty = false; break; }
    }
    if (!allEmpty) keep.push(idx);
  }
  return keep;
}

// ====== colgroup ======
function buildColGroupMain(rows, origIndices) {
  const h1 = rows[1] || [];
  const cols = origIndices.map((origIdx) => {
    if (origIdx === NAME_ORIG_IDX) return W_NAME;
    if (origIdx >= DAY_ORIG_START && origIdx <= MAIN_END_ORIG) {
      const numCell = String(h1[origIdx] ?? "").trim();
      return numCell === "" ? W_GAP : W_DAY;
    }
    return W_DAY;
  });
  return "<colgroup>" + cols.map(w => `<col style="width:${w}px">`).join("") + "</colgroup>";
}
function buildColGroupSummary(origIndices) {
  const cols = origIndices.map((origIdx) => {
    if (origIdx === NAME_ORIG_IDX) return W_NAME;
    return W_SUM;
  });
  return "<colgroup>" + cols.map(w => `<col style="width:${w}px">`).join("") + "</colgroup>";
}

// ====== THEAD (с объединениями) ======
function renderTheadMerged(rows, origIndices, { isMain }) {
  const h1 = rows[1] || [];
  const h2 = rows[2] || [];
  const len = origIndices.length;

  // выходные (только для дневной части в Таблице A)
  const weekendIdx = new Set();
  if (isMain) {
    for (let i = 0; i < len; i++) {
      const origIdx = origIndices[i];
      const dayName = String(h2[origIdx] ?? "").trim().toLowerCase();
      if (origIdx >= DAY_ORIG_START && origIdx <= MAIN_END_ORIG) {
        if (dayName === "sat" || dayName === "saturday" || dayName === "sun" || dayName === "sunday") {
          weekendIdx.add(i);
        }
      }
    }
  }

  // 1-я строка
  const skip1 = Array(len).fill(false);
  const rowspanAt = new Set();
  let row1 = "<tr>";
  for (let i = 0; i < len; i++) {
    if (skip1[i]) continue;
    const origIdx = origIndices[i];
    const t1 = String(h1[origIdx] ?? "").trim();

    // Месяц над ФИО: rowspan=2
    if (origIdx === NAME_ORIG_IDX && t1 && String(h2[origIdx] ?? "").trim() === "") {
      row1 += `<th class="px-2 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" rowspan="2">${esc(t1)}</th>`;
      rowspanAt.add(i);
      continue;
    }

    // Группы (актуально для сводки): объединяем t1 с последующими пустыми t1
    if (t1) {
      let colspan = 1;
      let j = i + 1;
      while (j < len) {
        const t1n = String(h1[origIndices[j]] ?? "").trim();
        if (t1n !== "") break;
        colspan++;
        skip1[j] = true;
        j++;
      }
      const isWeekend = weekendIdx.has(i);
      const style = isWeekend ? weekendHeaderStyle() : "";
      row1 += `<th class="px-1 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" colspan="${colspan}" style="${style}">${esc(t1)}</th>`;
      continue;
    }

    // Пустая ячейка 1-й строки
    const isWeekend = weekendIdx.has(i);
    const style = isWeekend ? weekendHeaderStyle() : "";
    row1 += `<th class="px-1 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" style="${style}"></th>`;
  }
  row1 += "</tr>";

  // 2-я строка: пропускаем ячейки, закрытые rowspan
  let row2 = "<tr>";
  for (let i = 0; i < len; i++) {
    if (rowspanAt.has(i)) continue;
    const origIdx = origIndices[i];
    const t2 = String(h2[origIdx] ?? "").trim();
    const isWeekend = weekendIdx.has(i);
    const pad = (origIdx === NAME_ORIG_IDX) ? "px-2" : "px-1";
    const style = isWeekend ? weekendHeaderStyle() : "";
    row2 += `<th class="${pad} h-8 font-medium text-center sticky top-0 z-30 bg-slate-900 border border-white/15" style="${style}">${esc(t2)}</th>`;
  }
  row2 += "</tr>";

  return row1 + row2;
}

// ====== TBODY ======
function renderBodyMapped(dataRows, origIndices) {
  return dataRows.map(r => {
    const tds = origIndices.map((origIdx) => {
      const val = r[origIdx] ?? "";
      const pad = (origIdx === NAME_ORIG_IDX) ? "px-2" : "px-1";
      let style = "";
      if (origIdx >= DAY_ORIG_START && origIdx <= DAY_ORIG_END) {
        style = styleForShift(val);
      }
      return `<td class="${pad} h-8 border border-white/15 text-center align-middle" style="${style}">${esc(val)}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
}

// ====== индексы для A и B ======
function buildMainIndices(rows) {
  const totalCols = getTotalCols(rows);
  const summaryStart = Math.max(0, totalCols - SUMMARY_TAIL_COLS);
  const mainEnd = Math.min(MAIN_END_ORIG, summaryStart - 1);
  const base = [NAME_ORIG_IDX];
  for (let i = DAY_ORIG_START; i <= mainEnd; i++) base.push(i); // 4..35
  return filterEmptyDayColumns(base, rows);
}
function buildSummaryIndices(rows) {
  const totalCols = getTotalCols(rows);
  const start = Math.max(0, totalCols - SUMMARY_TAIL_COLS);
  const arr = [NAME_ORIG_IDX]; // без колонки 3
  for (let i = start; i < totalCols; i++) arr.push(i);
  return arr;
}

// ====== авто-подгонка таблиц на мобильных ======
const AUTO_FIT_MIN_SCALE = 0.55;
const MOBILE_MAX_WIDTH = 640; // <= 640px — мобильный

const autoFitTargets = new Set();

function measureTableNaturalHeight(table) {
  const prev = table.style.transform;
  table.style.transform = "scale(1)";
  const h = table.getBoundingClientRect().height;
  table.style.transform = prev || "";
  return h;
}

function applyAutoFit(container) {
  try {
    const table = container.querySelector("table");
    if (!table) return;

    // На десктопах — сброс
    if (window.innerWidth > MOBILE_MAX_WIDTH) {
      table.style.transform = "";
      table.style.transformOrigin = "";
      container.style.height = "";
      container.style.overflowX = "auto";
      return;
    }

    // На мобильных пытаемся уместить всю таблицу по ширине контейнера
    const avail = container.clientWidth - 4; // небольшой внутренний отступ
    const contentWidth = table.scrollWidth;

    // Если и так помещается — сброс
    if (contentWidth <= avail) {
      table.style.transform = "";
      table.style.transformOrigin = "";
      container.style.height = "";
      container.style.overflowX = "auto";
      return;
    }

    let scale = Math.max(AUTO_FIT_MIN_SCALE, Math.min(1, avail / contentWidth));
    table.style.transformOrigin = "top left";
    table.style.transform = `scale(${scale}) translateZ(0)`;

    const h = measureTableNaturalHeight(table);
    container.style.height = `${h * scale}px`;
    // чтобы не было двойного скролла по оси X
    container.style.overflowX = "hidden";
  } catch (e) {
    // в случае ошибки — безопасный сброс
    container.style.height = "";
    container.style.overflowX = "auto";
    const table = container.querySelector("table");
    if (table) table.style.transform = "";
  }
}

function watchAutoFit(container) {
  if (!container) return;
  autoFitTargets.add(container);
  applyAutoFit(container);
  // Один общий обработчик на окно
  if (!window.__ssAutoFitBound) {
    const handler = () => {
      autoFitTargets.forEach(applyAutoFit);
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    window.__ssAutoFitBound = true;
  }
}

// ====== строители таблиц ======
function buildTableHTML(rows, origIndices, { isMain }) {
  const colgroup = isMain
    ? buildColGroupMain(rows, origIndices)
    : buildColGroupSummary(origIndices);

  const thead = renderTheadMerged(rows, origIndices, { isMain });

  // data-autofit — маркер контейнера, к которому применим авто-подгонку
  return `
    <div class="rounded-xl ring-1 ring-white/10 bg-slate-900/30 overflow-x-auto" data-autofit>
      <table class="min-w-max w-auto text-[12px] border-separate border-spacing-0" style="table-layout:fixed">
        ${colgroup}
        <thead class="sticky top-0 z-30">${thead}</thead>
        <tbody></tbody>
      </table>
    </div>
  `;
}
function populateTable(container, dataRows, origIndices) {
  const tbody = container.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = renderBodyMapped(dataRows, origIndices);
  // После заполнения данных — применим авто‑подгонку
  watchAutoFit(container.closest("[data-autofit]") || container);
}

// ====== collapsible блок для одного CSV ======
function buildScheduleBlock(rows, filterFn, { collapseId, monthTitle }) {
  const dataRows = rows.slice(3);
  const filteredRows = typeof filterFn === "function" ? dataRows.filter(filterFn) : dataRows;

  const mainIdx = buildMainIndices(rows);
  const sumIdx = buildSummaryIndices(rows);

  const mainHTML = buildTableHTML(rows, mainIdx, { isMain: true });
  const sumHTML = buildTableHTML(rows, sumIdx, { isMain: false });

  return {
    html: `
      <section class="space-y-2 rounded-2xl ring-1 ring-white/10 bg-white/5">
        <button id="btn-${collapseId}" class="w-full flex items-center justify-between px-3 py-2 text-left rounded-t-2xl bg-slate-800/60 hover:bg-slate-700/60">
          <span class="font-semibold">${esc(monthTitle)}</span>
          <span class="text-xs text-slate-300">Show/Hide</span>
        </button>
        <div id="content-${collapseId}" class="p-3 hidden">
          <div class="space-y-3">
            ${mainHTML}
            ${sumHTML}
          </div>
        </div>
      </section>
    `,
    mount: (root) => {
      const btn = root.querySelector(`#btn-${collapseId}`);
      const content = root.querySelector(`#content-${collapseId}`);
      if (!btn || !content) return;

      // Заполнение при первом раскрытии
      let filled = false;
      btn.addEventListener("click", () => {
        const wasHidden = content.classList.contains("hidden");
        content.classList.toggle("hidden");
        if (wasHidden && !filled) {
          const boxes = content.querySelectorAll("[data-autofit]");
          const [mainBox, sumBox] = [boxes[0], boxes[1]];
          const tbodyFill = () => {
            if (mainBox) populateTable(mainBox, filteredRows, mainIdx);
            if (sumBox) populateTable(sumBox, filteredRows, sumIdx);
            filled = true;
          };
          // Небольшая задержка, чтобы контейнер получил реальную ширину
            setTimeout(tbodyFill, 0);
        } else if (!wasHidden) {
          // сворачиваем — ничего не делаем
        } else {
          // повторное раскрытие — пересчёт авто‑подгонки
          content.querySelectorAll("[data-autofit]").forEach(applyAutoFit);
        }
      });
    }
  };
}

// ====== админ-контролы (порядок файлов) ======
function controlsHtml(order) {
  const [a, b] = order;
  return `
    <section id="ss-admin" class="space-y-3 p-3 rounded-lg ring-1 ring-white/10 bg-white/10">
      <div class="text-sm font-medium">Администрирование — Shift Schedule</div>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-xs">
          <div class="mb-1 text-slate-300">Первый файл</div>
          <select id="ss-primary" class="w-full bg-slate-800 border border-white/10 rounded px-2 py-1">
            <option value="schedule1"${a === "schedule1" ? " selected" : ""}>schedule1.csv</option>
            <option value="schedule2"${a === "schedule2" ? " selected" : ""}>schedule2.csv</option>
          </select>
        </label>
        <label class="text-xs">
          <div class="mb-1 text-slate-300">Второй файл</div>
          <select id="ss-secondary" class="w-full bg-slate-800 border border-white/10 rounded px-2 py-1">
            <option value="schedule1"${b === "schedule1" ? " selected" : ""}>schedule1.csv</option>
            <option value="schedule2"${b === "schedule2" ? " selected" : ""}>schedule2.csv</option>
          </select>
        </label>
      </div>
      <div class="flex gap-2">
        <button id="ss-swap" class="px-3 py-1 rounded bg-brand hover:bg-brand/80 text-white text-sm">Поменять местами</button>
        <button id="ss-save" class="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-sm">Сохранить</button>
      </div>
    </section>
  `;
}

// ====== Public API ======
export function renderShiftScheduleView(ses, { readOnly = false } = {}) {
  const order = getScheduleOrder();
  const isAdmin = !readOnly && (ses?.role === "admin");

  return `
    ${isAdmin ? controlsHtml(order) : ""}
    <div id="ss-wrap" class="grid gap-6">
      <div id="ss-a"></div>
      <div id="ss-b"></div>
    </div>
  `;
}

export function mountShiftSchedule(containerEl, ses, { readOnly = false } = {}) {
  if (!containerEl) return;

  const isAdmin = !readOnly && (ses?.role === "admin");
  const isOperation = isAdmin || ((ses?.accountType || "personal") === "operation");

  // ФИО для персонала
  const users = readUsers();
  const me = users.find(u => u.loginId === ses?.loginId);
  const fullName = `${(me?.name || "").trim()} ${(me?.surname || "").trim()}`.trim();
  const fullNameKey = normalizeName(fullName);

  let order = getScheduleOrder();

  if (isAdmin) {
    const adminBox = containerEl.querySelector("#ss-admin");
    if (adminBox) {
      const selA = adminBox.querySelector("#ss-primary");
      const selB = adminBox.querySelector("#ss-secondary");
      const btnSwap = adminBox.querySelector("#ss-swap");
      const btnSave = adminBox.querySelector("#ss-save");

      btnSwap?.addEventListener("click", () => {
        const t = selA.value; selA.value = selB.value; selB.value = t;
      });
      btnSave?.addEventListener("click", async () => {
        if (selA.value === selB.value) {
          alert("Первый и второй файл должны различаться.");
          return;
        }
        const newOrder = [selA.value, selB.value];
        setScheduleOrder(newOrder);
        order = newOrder;
        await renderTables();
      });
    }
  }

  async function renderTables() {
    const hostA = containerEl.querySelector("#ss-a");
    const hostB = containerEl.querySelector("#ss-b");
    if (!hostA || !hostB) return;

    hostA.innerHTML = hostB.innerHTML = "";

    try {
      const [fa, fb] = order;
      const [rowsA, rowsB] = await Promise.all([fetchCsvRows(fa), fetchCsvRows(fb)]);

      const personalFilter = (row) => normalizeName(row[NAME_ORIG_IDX]) === fullNameKey;
      const filterFn = isOperation ? null : personalFilter;

      const monthA = getMonthTitle(rowsA, fa);
      const monthB = getMonthTitle(rowsB, fb);

      const blockA = buildScheduleBlock(rowsA, filterFn, { collapseId: `a-${Date.now()}`, monthTitle: monthA });
      const blockB = buildScheduleBlock(rowsB, filterFn, { collapseId: `b-${Date.now()}`, monthTitle: monthB });

      hostA.innerHTML = blockA.html;
      hostB.innerHTML = blockB.html;

      blockA.mount(hostA);
      blockB.mount(hostB);
    } catch (e) {
      console.error(e);
      const err = `<div class="text-sm text-rose-300">Ошибка: ${esc(e.message)}</div>`;
      if (!hostA.innerHTML) hostA.innerHTML = err; else hostB.innerHTML = err;
    }
  }

  renderTables();
}