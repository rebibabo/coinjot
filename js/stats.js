/* =================== 统计页：分类饼图 + 柱状条 =================== */
let statType = 'expense';

function renderStats(){
  const box = document.getElementById('statsContent');
  const recs = monthRecords().filter(r=>r.type===statType);
  const us = unitSymbol();
  let main;
  if(!recs.length){
    main = '<div class="empty" style="padding:90px 0">本月暂无'+(statType==='expense'?'支出':'收入')+'数据</div>';
  } else {
    const total = recs.reduce((s,r)=>s+toUnit(r.amount, r.currency),0);
    const byCat = {};
    recs.forEach(r=>{ byCat[r.categoryId]=(byCat[r.categoryId]||0)+toUnit(r.amount, r.currency); });
    const rows = Object.entries(byCat).map(([id,amt])=>({id, c:catById(statType,id), amt}))
                       .sort((a,b)=>b.amt-a.amt);
    let acc=0, segs=[];
    rows.forEach(r=>{ const a=acc/total*360, b=(acc+r.amt)/total*360;
      segs.push(`${r.c.color} ${a}deg ${b}deg`); acc+=r.amt; });
    const legend = rows.map(r=>`<div class="row" data-cat="${r.id}">
        <span class="dot" style="background:${r.c.color}"></span>
        <div class="lg-info">
          <div class="nm">${r.c.icon} ${r.c.name}</div>
          <div class="pct">${(r.amt/total*100).toFixed(1)}% · ${fmt(r.amt,us)}</div>
        </div></div>`).join('');
    const bars = rows.map(r=>`<div class="bar-item" data-cat="${r.id}">
        <div class="bar-top"><span>${r.c.icon} ${r.c.name}</span><span>${fmt(r.amt,us)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.amt/rows[0].amt*100}%;background:${r.c.color}"></div></div>
      </div>`).join('');
    main = `<div class="card" style="margin-bottom:36px">
        <div class="pie-wrap">
          <div class="pie" style="background:conic-gradient(${segs.join(',')})">
            <div class="pie-total"><div class="t-lbl">总${statType==='expense'?'支出':'收入'}</div>
            <div class="t-val">${fmt(total,us)}</div></div>
          </div>
          <div class="legend">${legend}</div>
        </div></div>
        <div class="card"><div class="bars">${bars}</div></div>`;
  }
  box.innerHTML = main + renderTrend();
}

/* 近 6 月趋势（按当前收支类型，折算统计单位） */
function renderTrend(){
  const months=[];
  for(let i=5;i>=0;i--){ let y=viewYear, m=viewMonth-i; while(m<0){ m+=12; y--; }
    months.push({y,m,label:(m+1)+'月',total:0}); }
  records.forEach(r=>{ if(r.type!==statType) return; const d=new Date(r.date);
    const mm=months.find(x=>x.y===d.getFullYear() && x.m===d.getMonth());
    if(mm) mm.total += toUnit(r.amount, r.currency); });
  const max=Math.max(1, ...months.map(x=>x.total)), us=unitSymbol();
  return `<div class="card trend"><div class="trend-title">近 6 月${statType==='expense'?'支出':'收入'}趋势</div>
    <div class="trend-bars">${months.map(x=>`
      <div class="tb">
        <div class="tb-val">${x.total ? Math.round(x.total) : ''}</div>
        <div class="tb-bar" style="height:${Math.round(x.total/max*220)+3}px;
          background:${x.y===viewYear&&x.m===viewMonth?'var(--accent)':'#c7d2fe'}"></div>
        <div class="tb-lbl">${x.label}</div></div>`).join('')}</div></div>`;
}

document.querySelectorAll('.stat-switch button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('.stat-switch button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); statType=b.dataset.stat; renderStats(); };
});

/* 点分类（图例或柱条）→ 跳到明细并按该分类筛选 */
document.getElementById('statsContent').addEventListener('click', e=>{
  const el = e.target.closest('[data-cat]'); if(!el) return;
  setCatFilter(statType, el.dataset.cat);
  goTab('list');
});
/* 让图例/柱条看起来可点 */
