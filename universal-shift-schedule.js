// Универсальный модуль расписаний с поддержкой country-префикса.
// Формат имён CSV:
//   SM: <country>_sm_schedule1.csv, <country>_sm_schedule2.csv
//   Dealer: <country>_dealer_schedule1.csv, <country>_dealer_schedule2.csv
// Никаких админ-контролов порядка (фиксированные два файла на группу+страну).

const NAME_ORIG_IDX = 2;
const DAY_ORIG_START = 4;
const DAY_ORIG_END = 34;
const MAIN_END_ORIG = 35;
const SUMMARY_TAIL_COLS = 7;

const W_NAME = 220;
const W_DAY = 42;
const W_GAP = 8;
const W_SUM = 62;

function esc(s){
  return String(s??"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function normalizeName(s){
  return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
}

function parseCSV(text){
  const rows=[];let row=[];let cur="";let i=0;let inQ=false;
  while(i<text.length){
    const ch=text[i];
    if(inQ){
      if(ch === '"'){
        if(text[i+1]==='"'){cur+='"';i+=2;} else {inQ=false;i++;}
      } else {cur+=ch;i++;}
    } else {
      if(ch === '"'){inQ=true;i++;}
      else if(ch === ","){row.push(cur);cur="";i++;}
      else if(ch === "\r"){i++;}
      else if(ch === "\n"){row.push(cur);rows.push(row);row=[];cur="";i++;}
      else {cur+=ch;i++;}
    }
  }
  row.push(cur);rows.push(row);
  while(rows.length && rows[rows.length-1].every(c=>String(c).trim()==="")) rows.pop();
  return rows;
}

async function fetchCsvRows(fileBase){
  const url=`./public/${fileBase}.csv?ts=${Date.now()}`;
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error(`${fileBase}.csv: HTTP ${r.status}`);
  return parseCSV(await r.text());
}

function filesFor(group, country){
  // group: 'sm' | 'dealer'
  const prefix = group === "dealer" ? `${country}_dealer_schedule` : `${country}_sm_schedule`;
  return [`${prefix}1`, `${prefix}2`];
}

function getMonthTitle(rows,fallback){
  const t = String((rows[1]||[])[NAME_ORIG_IDX]??"").trim();
  return t || fallback;
}

function styleForShift(val){
  const raw=String(val||"").trim();
  if(!raw) return "";
  const u=raw.toUpperCase();
  if(/^X/.test(u)) return "background-color:rgba(244,63,94,0.30);color:#ffe4e6;";
  if(/^\//.test(raw)) return "background-color:rgba(100,116,139,0.28);color:#f8fafc;";
  if(/\!$/.test(raw)) return "background-color:rgba(217,70,239,0.28);color:#fdf4ff;";
  if(/^s/i.test(raw)) return "background-color:rgba(250,204,21,0.60);color:#0f172a;";
  if(u==="V") return "background-color:rgba(16,185,129,0.28);color:#ecfdf5;";
  const m=u.match(/(02|08|14|16|20)/);
  if(m){
    const code=m[1];
    if(code==="08"||code==="14") return "background-color:rgba(245,158,11,0.22);color:#fff7ed;";
    if(code==="16") return "background-color:rgba(249,115,22,0.24);color:#fff7ed;";
    if(code==="20"||code==="02") return "background-color:rgba(14,165,233,0.28);color:#f0f9ff;";
  }
  return "";
}
function weekendHeaderStyle(){
  return "background-color:rgba(244,63,94,0.14);color:#fecaca;";
}

function getTotalCols(rows){ return (rows[1]||[]).length; }

function filterEmptyDayColumns(origIndices, rows){
  const h1=rows[1]||[], h2=rows[2]||[];
  const keep=[];
  for(const idx of origIndices){
    if(idx < DAY_ORIG_START || idx > MAIN_END_ORIG){ keep.push(idx); continue; }
    const t1=String(h1[idx]??"").trim();
    const t2=String(h2[idx]??"").trim();
    if(t1!=="" || t2!==""){ keep.push(idx); continue; }
    let allEmpty=true;
    for(let r=3;r<rows.length;r++){
      if(String(rows[r]?.[idx]??"").trim()!==""){ allEmpty=false;break; }
    }
    if(!allEmpty) keep.push(idx);
  }
  return keep;
}

function buildMainIndices(rows){
  const totalCols=getTotalCols(rows);
  const summaryStart=Math.max(0,totalCols - SUMMARY_TAIL_COLS);
  const mainEnd=Math.min(MAIN_END_ORIG, summaryStart - 1);
  const base=[NAME_ORIG_IDX];
  for(let i=DAY_ORIG_START;i<=mainEnd;i++) base.push(i);
  return filterEmptyDayColumns(base,rows);
}
function buildSummaryIndices(rows){
  const totalCols=getTotalCols(rows);
  const start=Math.max(0,totalCols - SUMMARY_TAIL_COLS);
  const arr=[NAME_ORIG_IDX];
  for(let i=start;i<totalCols;i++) arr.push(i);
  return arr;
}

function buildColGroupMain(rows, origIndices){
  const h1=rows[1]||[];
  const cols=origIndices.map(i=>{
    if(i===NAME_ORIG_IDX) return W_NAME;
    if(i>=DAY_ORIG_START && i<=MAIN_END_ORIG){
      const numCell=String(h1[i]??"").trim();
      return numCell===""?W_GAP:W_DAY;
    }
    return W_DAY;
  });
  return "<colgroup>"+cols.map(w=>`<col style="width:${w}px">`).join("")+"</colgroup>";
}
function buildColGroupSummary(origIndices){
  const cols=origIndices.map(i=> i===NAME_ORIG_IDX?W_NAME:W_SUM );
  return "<colgroup>"+cols.map(w=>`<col style="width:${w}px">`).join("")+"</colgroup>";
}

function renderTheadMerged(rows,origIndices,{isMain}){
  const h1=rows[1]||[];
  const h2=rows[2]||[];
  const len=origIndices.length;
  const weekendIdx=new Set();
  if(isMain){
    for(let k=0;k<len;k++){
      const oi=origIndices[k];
      const dn=String(h2[oi]??"").trim().toLowerCase();
      if(oi>=DAY_ORIG_START && oi<=MAIN_END_ORIG){
        if(["sat","saturday","sun","sunday"].includes(dn)) weekendIdx.add(k);
      }
    }
  }
  const skip1=Array(len).fill(false);
  const rowspanAt=new Set();
  let row1="<tr>";
  for(let i=0;i<len;i++){
    if(skip1[i]) continue;
    const oi=origIndices[i];
    const t1=String(h1[oi]??"").trim();
    if(oi===NAME_ORIG_IDX && t1 && String(h2[oi]??"").trim()===""){
      row1+=`<th class="px-2 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" rowspan="2">${esc(t1)}</th>`;
      rowspanAt.add(i); continue;
    }
    if(t1){
      let colspan=1;let j=i+1;
      while(j<len){
        const t1n=String(h1[origIndices[j]]??"").trim();
        if(t1n!=="") break;
        colspan++;skip1[j]=true;j++;
      }
      const isW=weekendIdx.has(i);
      const style=isW?weekendHeaderStyle():"";
      row1+=`<th class="px-1 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" colspan="${colspan}" style="${style}">${esc(t1)}</th>`;
      continue;
    }
    const isW=weekendIdx.has(i);
    const style=isW?weekendHeaderStyle():"";
    row1+=`<th class="px-1 h-8 font-semibold text-center sticky top-0 z-30 bg-slate-900 border border-white/15" style="${style}"></th>`;
  }
  row1+="</tr>";
  let row2="<tr>";
  for(let i=0;i<len;i++){
    if(rowspanAt.has(i)) continue;
    const oi=origIndices[i];
    const t2=String(h2[oi]??"").trim();
    const isW=weekendIdx.has(i);
    const pad=(oi===NAME_ORIG_IDX)?"px-2":"px-1";
    const style=isW?weekendHeaderStyle():"";
    row2+=`<th class="${pad} h-8 font-medium text-center sticky top-0 z-30 bg-slate-900 border border-white/15" style="${style}">${esc(t2)}</th>`;
  }
  row2+="</tr>";
  return row1+row2;
}

function renderBody(dataRows,origIndices){
  return dataRows.map(r=>{
    const tds=origIndices.map(oi=>{
      const val=r[oi]??"";
      const pad=(oi===NAME_ORIG_IDX)?"px-2":"px-1";
      let style="";
      if(oi>=DAY_ORIG_START && oi<=DAY_ORIG_END) style=styleForShift(val);
      return `<td class="${pad} h-8 border border-white/15 text-center align-middle" style="${style}">${esc(val)}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
}

function buildTableHTML(rows,origIndices,{isMain}){
  const colgroup=isMain?buildColGroupMain(rows,origIndices):buildColGroupSummary(origIndices);
  const thead=renderTheadMerged(rows,origIndices,{isMain});
  return `
    <div class="rounded-xl ring-1 ring-white/10 bg-slate-900/30 overflow-x-auto">
      <table class="min-w-max w-auto text-[12px] border-separate border-spacing-0" style="table-layout:fixed">
        ${colgroup}
        <thead class="sticky top-0 z-30">${thead}</thead>
        <tbody></tbody>
      </table>
    </div>
  `;
}

function populateTable(container, dataRows, origIndices){
  const tbody=container.querySelector("tbody");
  if(!tbody) return;
  tbody.innerHTML=renderBody(dataRows,origIndices);
}

function buildScheduleBlock(rows, filterFn, { collapseId, monthTitle }){
  const dataRows=rows.slice(3);
  const filteredRows = (typeof filterFn==="function") ? dataRows.filter(filterFn) : dataRows;
  const mainIdx=buildMainIndices(rows);
  const sumIdx=buildSummaryIndices(rows);
  const mainHTML=buildTableHTML(rows,mainIdx,{isMain:true});
  const sumHTML=buildTableHTML(rows,sumIdx,{isMain:false});
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
      const btn=root.querySelector(`#btn-${collapseId}`);
      const content=root.querySelector(`#content-${collapseId}`);
      if(!btn||!content) return;
      let filled=false;
      btn.addEventListener("click", ()=>{
        const wasHidden=content.classList.contains("hidden");
        content.classList.toggle("hidden");
        if(wasHidden && !filled){
          const boxes=content.querySelectorAll("table");
          setTimeout(()=>{
            if(boxes[0]) populateTable(boxes[0].closest("div"), filteredRows, mainIdx);
            if(boxes[1]) populateTable(boxes[1].closest("div"), filteredRows, sumIdx);
            filled=true;
          },0);
        }
      });
    }
  };
}

export function renderGroupShiftScheduleView(ses,{ group }={}){
  if(!ses?.country){
    return `<div class="p-6 text-sm text-rose-300">Country is not set in session. Relogin.</div>`;
  }
  return `
    <div class="mb-4">
      <h2 class="text-xl font-semibold">${group==="dealer"?"Dealer Schedule":"SM Schedule"}</h2>
      <p class="text-xs opacity-60">Country: ${esc(ses.country)}</p>
    </div>
    <div id="gs-wrap" class="grid gap-6">
      <div id="gs-a"></div>
      <div id="gs-b"></div>
    </div>
  `;
}

export function mountGroupShiftSchedule(containerEl, ses,{ group }={}){
  if(!containerEl) return;
  if(!ses?.country){
    containerEl.innerHTML = `<div class="text-rose-300 text-sm">No country – relogin.</div>`;
    return;
  }
  const country = ses.country;
  const [fileA,fileB] = filesFor(group, country);

  // Кто видит все:
  const isAdmin = ses.role==="admin";
  const isOperation = isAdmin || ses.accountType==="operation";
  const usersRaw = readUsers();
  const me = usersRaw.find(u=>u.loginId===ses.loginId);
  const meFull = `${(me?.name||"").trim()} ${(me?.surname||"").trim()}`.trim();
  const meKey = normalizeName(meFull);
  const filterFn = isOperation ? null : (row => normalizeName(row[NAME_ORIG_IDX])===meKey);

  async function render(){
    const hostA=containerEl.querySelector("#gs-a");
    const hostB=containerEl.querySelector("#gs-b");
    if(!hostA||!hostB) return;
    hostA.innerHTML=hostB.innerHTML="";
    try{
      const [rowsA, rowsB] = await Promise.all([fetchCsvRows(fileA), fetchCsvRows(fileB)]);
      const monthA = getMonthTitle(rowsA, fileA);
      const monthB = getMonthTitle(rowsB, fileB);
      const blockA = buildScheduleBlock(rowsA, filterFn, { collapseId:`a-${Date.now()}`, monthTitle:monthA });
      const blockB = buildScheduleBlock(rowsB, filterFn, { collapseId:`b-${Date.now()}`, monthTitle:monthB });
      hostA.innerHTML = blockA.html;
      hostB.innerHTML = blockB.html;
      blockA.mount(hostA);
      blockB.mount(hostB);
    }catch(e){
      console.error(e);
      const err=`<div class="text-sm text-rose-300">Error: ${esc(e.message)}</div>`;
      const hostA=containerEl.querySelector("#gs-a");
      if(hostA && !hostA.innerHTML) hostA.innerHTML=err;
      else {
        const hostB=containerEl.querySelector("#gs-b");
        if(hostB) hostB.innerHTML=err;
      }
    }
  }
  render();
}

export const renderShiftScheduleView = (ses,opts)=>renderGroupShiftScheduleView(ses,{group:"sm",...(opts||{})});
export const mountShiftSchedule = (el,ses,opts)=>mountGroupShiftSchedule(el,ses,{group:"sm",...(opts||{})});

function readUsers(){
  try { return JSON.parse(localStorage.getItem("AH_USERS_V1")||"[]"); } catch { return []; }
}