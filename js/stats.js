/* =================== 统计页：分类饼图 + 柱状条 =================== */
let statType = 'expense';
let statPickedCats = new Set();
const STAT_COLORS = ['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#6A3D9A',
  '#56B4E9','#E64B35','#4DBBD5','#00A087','#3C5488','#F39B7F'];

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
  const c = 120, large = end - start > 180 ? 1 : 0;
  const o1 = polar(c,c,outer,start), o2 = polar(c,c,outer,end);
  const i1 = polar(c,c,inner,start), i2 = polar(c,c,inner,end);
  return `M ${o1.x} ${o1.y} A ${outer} ${outer} 0 ${large} 1 ${o2.x} ${o2.y}
    L ${i2.x} ${i2.y} A ${inner} ${inner} 0 ${large} 0 ${i1.x} ${i1.y} Z`;
}
function renderPie(rows, total, us){
  let acc = 0;
  const slices = rows.map(r=>{
    const start = acc / total * 360, end = (acc + r.amt) / total * 360;
    acc += r.amt;
    const mid = (start + end) / 2;
    const picked = statPickedCats.has(r.id);
    const lift = picked && rows.length > 1;
    const dx = lift ? Math.cos((mid - 90) * Math.PI / 180) * 10 : 0;
    const dy = lift ? Math.sin((mid - 90) * Math.PI / 180) * 10 : 0;
    return `<path class="pie-slice${picked?' picked':''}" data-cat="${r.id}"
      d="${donutSlicePath(start,end,110,68)}" fill="${r.color}"
      style="transform:translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scale(${lift?'1.035':'1'})"></path>`;
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

function renderStats(){
  const box = document.getElementById('statsContent');
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
    const legend = rows.map(r=>`<div class="row${statPickedCats.has(r.id)?' picked':''}" data-cat="${r.id}">
        <span class="dot" style="background:${r.color}"></span>
        <div class="lg-info">
          <div class="nm">${r.c.icon} ${r.c.name}</div>
          <div class="pct">${(r.amt/total*100).toFixed(1)}% · ${fmt(r.amt,us)}</div>
        </div></div>`).join('');
    const bars = rows.map(r=>`<div class="bar-item" data-cat="${r.id}">
        <div class="bar-top"><span>${r.c.icon} ${r.c.name}</span><span>${fmt(r.amt,us)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.amt/rows[0].amt*100}%;background:${r.color}"></div></div>
      </div>`).join('');
    main = `<div class="card" style="margin-bottom:36px">
        <div class="pie-wrap">
          ${renderPie(rows,total,us)}
          <div class="legend">${legend}</div>
        </div></div>
        <div class="card"><div class="bars-hint">点击查看该分类下的明细</div><div class="bars">${bars}</div></div>`;
  }
  box.innerHTML = main + renderTrend();
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
  return `<div class="card trend"><div class="trend-title">7 月${statType==='expense'?'支出':'收入'}趋势</div>
    <div class="trend-bars">${months.map(x=>`
      <div class="tb${x.y===viewYear&&x.m===viewMonth?' on':''}" data-month="${x.y}-${x.m}">
        <div class="tb-val">${x.total ? Math.round(x.total) : ''}</div>
        <div class="tb-bar" style="height:${Math.round(x.total/max*220)+3}px;
          background:${x.y===viewYear&&x.m===viewMonth?'var(--accent)':'#c7d2fe'}"></div>
        <div class="tb-lbl">${x.label}</div></div>`).join('')}</div></div>`;
}

document.querySelectorAll('.stat-switch button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('.stat-switch button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); statType=b.dataset.stat; statPickedCats.clear(); renderStats(); };
});

/* 点分类（图例或柱条）→ 跳到明细并按该分类筛选 */
document.getElementById('statsContent').addEventListener('click', e=>{
  if(e.target.closest('[data-clear-stat]')){ statPickedCats.clear(); renderStats(); return; }
  const month = e.target.closest('[data-month]');
  if(month){
    const [y,m] = month.dataset.month.split('-').map(Number);
    viewYear = y; viewMonth = m; statPickedCats.clear(); renderAll(); scrollMainTo('bottom'); return;
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
/* 让图例/柱条看起来可点 */
