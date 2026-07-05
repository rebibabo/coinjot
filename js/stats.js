/* =================== 统计页：分类饼图 + 柱状条 =================== */
let statType = 'expense';
let statView = 'pie';
let statPickedCats = new Set();
const LS_DAY_TEMP = 'et_day_trend_temp';
let dayTrendTemp = Math.max(0, Math.min(1, parseFloat(localStorage.getItem(LS_DAY_TEMP) || '0.6') || 0.6));
const STAT_COLORS = ['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#6A3D9A',
  '#56B4E9','#E64B35','#4DBBD5','#00A087','#3C5488','#F39B7F'];
const PIE_CENTER = 120;
const PIE_OUTER = 110;
const PIE_INNER = 68;
const PIE_LIFT = 14;
const DAY_MAX_BAR_HEIGHT = 220;

function clearStatSelection(){
  statPickedCats.clear();
}

function applyStatColors(rows){
  let i = 0;
  return rows.map(r=>{
    const color = isOther(r.c) ? '#9aa0ad' : STAT_COLORS[i++ % STAT_COLORS.length];
    return {...r, color};
  });
}

function polar(cx, cy, r, deg){
  const a = (deg - 90) * Math.PI / 180;
  return {x:cx + r*Math.cos(a), y:cy + r*Math.sin(a)};
}
function donutSlicePath(start, end, outer, inner){
  if(end - start >= 359.99) end = start + 359.99;
  const large = end - start > 180 ? 1 : 0;
  const o1 = polar(PIE_CENTER,PIE_CENTER,outer,start), o2 = polar(PIE_CENTER,PIE_CENTER,outer,end);
  const i1 = polar(PIE_CENTER,PIE_CENTER,inner,start), i2 = polar(PIE_CENTER,PIE_CENTER,inner,end);
  return `M ${o1.x} ${o1.y} A ${outer} ${outer} 0 ${large} 1 ${o2.x} ${o2.y}
    L ${i2.x} ${i2.y} A ${inner} ${inner} 0 ${large} 0 ${i1.x} ${i1.y} Z`;
}

function renderPie(rows, total, us){
  let acc = 0;
  const slices = rows.map((r, idx)=>{
    const start = acc / total * 360, end = (acc + r.amt) / total * 360;
    acc += r.amt;
    const picked = statPickedCats.has(r.id);
    const offset = picked ? PIE_LIFT : 0;
    return `<path class="pie-slice${picked?' picked':''}" data-cat="${r.id}"
      style="--delay:${idx * 38}ms"
      d="${donutSlicePath(start,end,PIE_OUTER+offset,PIE_INNER+offset)}" fill="${r.color}"></path>`;
  }).join('');
  const pickedRows = rows.filter(r=>statPickedCats.has(r.id));
  const pickedTotal = pickedRows.reduce((s,r)=>s+r.amt,0);
  const single = pickedRows.length===1 ? pickedRows[0] : null;
  const label = single ? `${single.c.icon} ${single.c.name}`
    : (pickedRows.length ? `已选 ${pickedRows.length} 类` : `总${statType==='expense'?'支出':'收入'}`);
  const val = fmt(pickedRows.length ? pickedTotal : total, us);
  const sub = pickedRows.length ? `${(pickedTotal/total*100).toFixed(1)}%` : '';
  return `<div class="pie">
    <svg class="pie-svg" viewBox="0 0 240 240" aria-label="分类占比">${slices}</svg>
    <div class="pie-total"><div class="t-lbl">${label}</div>
      <div class="t-val">${val}</div>${sub?`<div class="t-sub">${sub}</div><button class="pie-clear" data-clear-stat>清除</button>`:''}</div>
  </div>`;
}
function renderPiePanel(rows, total, us){
  const legend = rows.map((r, idx)=>`<div class="row${statPickedCats.has(r.id)?' picked':''}" data-cat="${r.id}" style="--delay:${idx * 42}ms">
      <span class="dot" style="background:${r.color}"></span>
      <div class="lg-info">
        <div class="nm">${r.c.icon} ${r.c.name}</div>
        <div class="pct">${(r.amt/total*100).toFixed(1)}% · ${fmt(r.amt,us)}</div>
      </div></div>`).join('');
  return `<div class="card pie-panel animating">
    <div class="pie-wrap">
      ${renderPie(rows,total,us)}
      <div class="legend">${legend}</div>
    </div></div>`;
}
function renderBarsPanel(rows, us){
  const total = rows.reduce((s,r)=>s+r.amt,0);
  const bars = rows.map((r, idx)=>`<div class="bar-item" data-cat="${r.id}" style="--delay:${idx * 46}ms">
      <div class="bar-top"><span class="bar-name">${r.c.icon} ${r.c.name}</span>
        <span class="bar-nums"><span class="bar-pct">${(r.amt/total*100).toFixed(1)}%</span> ${fmt(r.amt,us)}</span>
        <span class="bar-arrow">›</span></div>
      <div class="bar-track"><div class="bar-fill" style="--bar-w:${r.amt/rows[0].amt*100}%;width:var(--bar-w);background:${r.color}"></div></div>
    </div>`).join('');
  return `<div class="card bars-panel animating"><div class="bars-hint">点击查看该分类下的明细</div><div class="bars">${bars}</div></div>`;
}
function monthOffset(y, m, delta){
  const d = new Date(y, m + delta, 1);
  return { y:d.getFullYear(), m:d.getMonth(), label:(d.getMonth()+1)+'月' };
}
function monthSerial(y, m){ return y * 12 + m; }
function trendStartOffset(){
  const now = new Date();
  const latest = monthSerial(now.getFullYear(), now.getMonth());
  const viewed = monthSerial(viewYear, viewMonth);
  return viewed + 3 > latest ? latest - 6 - viewed : -3;
}
function dayTempText(){
  return dayTrendTemp.toFixed(1);
}
function scaledDayHeights(days, maxBarHeight){
  const positive = days.filter(x=>x.total > 0);
  const heights = new Map();
  if(!positive.length) return heights;
  const max = Math.max(...positive.map(x=>x.total));
  const exponent = 1 - dayTrendTemp * .7;
  positive.forEach(x=>{
    heights.set(x.date, Math.round(Math.pow(x.total / max, exponent) * maxBarHeight) + 3);
  });
  return heights;
}
function scaledDayRatio(total, max){
  if(!total || !max) return 0;
  const exponent = 1 - dayTrendTemp * .7;
  return Math.pow(total / max, exponent);
}
function scaledDayHeight(total, max, maxBarHeight){
  return total ? Math.round(scaledDayRatio(total, max) * maxBarHeight) + 3 : 3;
}
function dayBarColor(scaledRatio){
  if(scaledRatio <= 0) return '#e7efff';
  const mix = .18 + scaledRatio * .82;
  const lo = [159,189,255], hi = [60,125,255];
  const rgb = lo.map((v, i)=>Math.round(v + (hi[i] - v) * mix));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
function updateDailyTrendScale(){
  const trend = document.querySelector('.day-trend');
  if(!trend) return;
  const items = [...trend.querySelectorAll('[data-day]')];
  const totals = items.map(el=>parseFloat(el.dataset.total || '0') || 0);
  const max = Math.max(1, ...totals);
  const maxBarHeight = DAY_MAX_BAR_HEIGHT;
  const label = document.getElementById('dayTempVal');
  if(label) label.textContent = dayTempText();
  trend.classList.add('scaling');
  items.forEach((el, i)=>{
    const h = scaledDayHeight(totals[i], max, maxBarHeight);
    el.style.setProperty('--bar-h', h+'px');
    const bar = el.querySelector('.tb-bar');
    if(bar){
      bar.style.height = h+'px';
      bar.style.background = dayBarColor(scaledDayRatio(totals[i], max));
    }
  });
}

function renderStats(){
  const box = document.getElementById('statsContent');
  if(statView==='month'){
    box.innerHTML = renderDailyTrend() + renderTrend();
    return;
  }
  const recs = monthRecords().filter(r=>r.type===statType);
  const us = unitSymbol();
  let main;
  if(!recs.length){
    main = '<div class="empty" style="padding:90px 0">本月暂无'+(statType==='expense'?'支出':'收入')+'数据</div>';
  } else {
    const total = recs.reduce((s,r)=>s+toUnit(r.amount, r.currency, r.date.slice(0,10)),0);
    const byCat = {};
    recs.forEach(r=>{ byCat[r.categoryId]=(byCat[r.categoryId]||0)+toUnit(r.amount, r.currency, r.date.slice(0,10)); });
    const rows = applyStatColors(Object.entries(byCat).map(([id,amt])=>({id, c:catById(statType,id), amt}))
                       .sort((a,b)=>b.amt-a.amt));
    const validIds = new Set(rows.map(r=>r.id));
    statPickedCats = new Set([...statPickedCats].filter(id=>validIds.has(id)));
    main = statView==='bar' ? renderBarsPanel(rows, us) : renderPiePanel(rows, total, us);
  }
  box.innerHTML = main;
}

function renderDailyTrend(){
  const days = [];
  const count = new Date(viewYear, viewMonth + 1, 0).getDate();
  for(let i=1;i<=count;i++){
    const date = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    days.push({ d:i, date, total:0 });
  }
  records.forEach(r=>{
    if(r.type!==statType) return;
    const d = new Date(r.date);
    if(d.getFullYear()!==viewYear || d.getMonth()!==viewMonth) return;
    days[d.getDate()-1].total += toUnit(r.amount, r.currency, r.date.slice(0,10));
  });
  const maxBarHeight = DAY_MAX_BAR_HEIGHT;
  const maxTotal = Math.max(1, ...days.map(x=>x.total));
  const heights = scaledDayHeights(days, maxBarHeight);
  const heightOf = x => x.total ? (heights.get(x.date) || 3) : 3;
  const renderPart = (part, title, offset) => {
    return `<div class="day-half">
      <div class="day-half-title">${title}</div>
      <div class="trend-bars" style="--days:${part.length}">${part.map((x, idx)=>{
        const h = heightOf(x);
        const delay = (offset + idx) * 8;
        return `<div class="tb" data-day="${x.date}" data-total="${x.total}" style="--bar-h:${h}px;--delay:${delay}ms">
          <div class="tb-plot">
            <div class="tb-val">${x.total ? Math.round(x.total) : ''}</div>
            <div class="tb-bar" style="height:${h}px;background:${dayBarColor(scaledDayRatio(x.total, maxTotal))}"></div>
          </div>
          <div class="tb-lbl">${x.d}</div></div>`;
      }).join('')}</div></div>`;
  };
  const firstHalf = days.slice(0, 15);
  const secondHalf = days.slice(15);
  return `<div class="card trend day-trend animating"><div class="trend-head">
      <div class="trend-title">${viewMonth+1}月日度${statType==='expense'?'支出':'收入'}趋势</div>
      <div class="day-scale">
        <span>缩放系数</span>
        <input id="dayTempSlider" type="range" min="0" max="1" step="0.1" value="${dayTempText()}">
        <strong id="dayTempVal">${dayTempText()}</strong>
      </div>
    </div>
    ${renderPart(firstHalf, '1-15日', 0)}
    ${renderPart(secondHalf, `16-${count}日`, 15)}</div>`;
}

function restartDailyTrendAnimation(){
  restartTrendAnimations();
}

/* 7 月窗口趋势：最新月份靠右；看历史月份时当前月居中 */
function renderTrend(){
  const startOffset = trendStartOffset();
  const months=[];
  for(let i=0;i<7;i++) months.push({...monthOffset(viewYear, viewMonth, startOffset+i), total:0});
  records.forEach(r=>{ if(r.type!==statType) return; const d=new Date(r.date);
    const mm=months.find(x=>x.y===d.getFullYear() && x.m===d.getMonth());
    if(mm) mm.total += toUnit(r.amount, r.currency, r.date.slice(0,10)); });
  const max=Math.max(1, ...months.map(x=>x.total)), us=unitSymbol();
  return `<div class="card trend month-trend animating"><div class="trend-title">近 7 个月${statType==='expense'?'支出':'收入'}趋势</div>
    <div class="trend-bars">${months.map((x, idx)=>`
      <div class="tb${x.y===viewYear&&x.m===viewMonth?' on':''}" data-month="${x.y}-${x.m}" style="--delay:${idx * 42}ms">
        <div class="tb-plot" style="--bar-h:${Math.round(x.total/max*220)+3}px">
          <div class="tb-val">${x.total ? Math.round(x.total) : ''}</div>
          <div class="tb-bar" style="height:${Math.round(x.total/max*220)+3}px;
            background:${x.y===viewYear&&x.m===viewMonth?'var(--accent)':'#c7d2fe'}"></div>
        </div>
        <div class="tb-lbl">${x.label}</div></div>`).join('')}</div></div>`;
}

function restartTrendAnimations(){
  document.querySelectorAll('.day-trend, .month-trend').forEach(el=>{
    el.classList.remove('animating');
    void el.offsetWidth;
    el.classList.add('animating');
  });
}

document.querySelectorAll('.stat-switch button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('.stat-switch button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); statType=b.dataset.stat; clearStatSelection(); renderStats(); };
});
document.querySelectorAll('[data-stat-view]').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('[data-stat-view]').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); statView=b.dataset.statView; renderStats(); };
});

/* 点分类（图例或柱条）→ 跳到明细并按该分类筛选 */
document.getElementById('statsContent').addEventListener('click', e=>{
  if(e.target.closest('[data-clear-stat]')){ clearStatSelection(); renderStats(); return; }
  const day = e.target.closest('[data-day]');
  if(day){
    setDateFilter(statType, day.dataset.day);
    goTab('list');
    return;
  }
  const month = e.target.closest('[data-month]');
  if(month){
    const [y,m] = month.dataset.month.split('-').map(Number);
    viewYear = y; viewMonth = m; clearStatSelection(); renderAll(); scrollMainTo('bottom'); return;
  }
  const pick = e.target.closest('.pie-slice, .legend .row');
  if(pick){
    const id = pick.dataset.cat;
    statPickedCats.has(id) ? statPickedCats.delete(id) : statPickedCats.add(id);
    renderStats(); return;
  }
  const el = e.target.closest('[data-cat]'); if(!el) return;
  setCatFilter(statType, el.dataset.cat);
  goTab('list');
});
document.getElementById('statsContent').addEventListener('input', e=>{
  if(e.target.id!=='dayTempSlider') return;
  dayTrendTemp = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
  localStorage.setItem(LS_DAY_TEMP, String(dayTrendTemp));
  updateDailyTrendScale();
});
/* 让图例/柱条看起来可点 */
