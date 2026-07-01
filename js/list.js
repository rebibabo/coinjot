/* =================== 明细页：顶部汇总 + 按日分组列表 =================== */
/* 今日已花：统计今天的支出合计（折算到统计单位） */
function renderTodaySpend(){
  const el = document.getElementById('todaySpend');
  if(!el) return;
  const td = today();
  let sum = 0;
  records.forEach(r=>{ if(r.type==='expense' && r.date.slice(0,10)===td) sum += toUnit(r.amount, r.currency); });
  el.textContent = '今天已花 ' + fmt(sum, unitSymbol());
}
function renderTop(){
  document.getElementById('monthLabel').textContent = `${viewYear}年${viewMonth+1}月`;
  let exp=0, inc=0;
  monthRecords().forEach(r=>{ const v=toUnit(r.amount, r.currency);
    r.type==='expense' ? exp+=v : inc+=v; });
  const sym = unitSymbol();
  const eE=document.getElementById('sumExpense'), eI=document.getElementById('sumIncome'), eB=document.getElementById('sumBalance');
  eE.textContent = fmt(exp, sym);
  eI.textContent = fmt(inc, sym);
  eB.textContent = fmt(inc-exp, sym);
  fitSummary([eB, eE, eI]);   // 三个数字统一字号，超长则一起等比缩小
}
/* 三个值用同一字号，从 52 往下缩，直到三个都不超出各自卡片 */
function fitSummary(els){
  let s = 52;
  els.forEach(el=>el.style.fontSize = s + 'px');
  while(s > 26 && els.some(el=>el.scrollWidth > el.clientWidth + 1)){
    s -= 2; els.forEach(el=>el.style.fontSize = s + 'px');
  }
}

/* 明细筛选：搜索词 q + 类型 type + 分类多选 catIds + 金额范围 amtMin/amtMax */
let listFilter = { q:'', type:null, catIds:[], amtMin:null, amtMax:null };
function isFiltered(){ return !!(listFilter.q||listFilter.type||listFilter.catIds.length||listFilter.amtMin!=null||listFilter.amtMax!=null); }
function updateFilterBtn(){
  const on = listFilter.type||listFilter.catIds.length||listFilter.amtMin!=null||listFilter.amtMax!=null;
  document.getElementById('filterBtn').classList.toggle('on', !!on);
}
function resetFilters(){
  listFilter = { q:'', type:null, catIds:[], amtMin:null, amtMax:null };
  document.getElementById('searchIn').value=''; updateFilterBtn(); renderList();
}
/* 从统计页钻取：按单个分类筛选 */
function setCatFilter(type, catId){
  listFilter = { q:'', type, catIds:[catId], amtMin:null, amtMax:null };
  document.getElementById('searchIn').value=''; updateFilterBtn(); renderList();
}
/* 筛选条：筛选中标记 + 清除 + 合计 */
function renderFilterBar(recs){
  const bar = document.getElementById('filterBar');
  if(!isFiltered()){ bar.innerHTML=''; return; }
  let exp=0, inc=0; recs.forEach(r=>{ const v=toUnit(r.amount, r.currency); r.type==='expense'?exp+=v:inc+=v; });
  const us=unitSymbol();
  const parts=[`共 ${recs.length} 笔`];
  if(exp) parts.push(`支 ${fmt(exp,us)}`);
  if(inc) parts.push(`收 ${fmt(inc,us)}`);
  bar.innerHTML = `<span class="fchip">筛选中 <span class="fx" id="clearFilter">✕</span></span><span class="fsum">${parts.join(' · ')}</span>`;
  document.getElementById('clearFilter').onclick = resetFilters;
}
document.getElementById('searchIn').addEventListener('input', e=>{ listFilter.q = e.target.value.trim(); renderList(); });

/* ---- 筛选弹窗：类型 + 分类 + 金额范围 ---- */
const filterModal = document.getElementById('filterModal');
let fmDraft = { type:null, cats:new Set() };
document.getElementById('filterBtn').onclick = ()=>{
  fmDraft = { type:listFilter.type, cats:new Set(listFilter.catIds) };
  document.getElementById('fmMin').value = listFilter.amtMin!=null ? listFilter.amtMin : '';
  document.getElementById('fmMax').value = listFilter.amtMax!=null ? listFilter.amtMax : '';
  renderFmType(); renderFmCats(); filterModal.classList.add('show');
};
function renderFmType(){
  document.getElementById('fmType').innerHTML = [['','全部'],['expense','支出'],['income','收入']]
    .map(([v,l])=>`<span class="prov${(fmDraft.type||'')===v?' on':''}" data-ftype="${v}">${l}</span>`).join('');
}
function renderFmCats(){
  // 只列本月实际出现过的分类（且符合所选类型），按配置顺序排
  const present = new Set();
  monthRecords().forEach(r=>{ if(!fmDraft.type || r.type===fmDraft.type) present.add(r.categoryId); });
  const types = fmDraft.type ? [fmDraft.type] : ['expense','income'];
  const list = [];
  types.forEach(t=> cats[t].forEach(c=>{ if(present.has(c.id)) list.push(c); }));
  document.getElementById('fmCats').innerHTML =
    `<span class="prov${fmDraft.cats.size===0?' on':''}" data-fcat="">不限</span>` +
    (list.length
      ? list.map(c=>`<span class="prov${fmDraft.cats.has(c.id)?' on':''}" data-fcat="${c.id}">${c.icon} ${c.name}</span>`).join('')
      : '<span class="mdl-empty">本月暂无记录</span>');
}
document.getElementById('fmType').addEventListener('click', e=>{
  const c=e.target.closest('[data-ftype]'); if(!c) return;
  fmDraft.type = c.dataset.ftype || null;
  if(fmDraft.type){ const valid=new Set(cats[fmDraft.type].map(x=>x.id));   // 切类型后剔除不属于该类型的已选分类
    fmDraft.cats = new Set([...fmDraft.cats].filter(id=>valid.has(id))); }
  renderFmType(); renderFmCats();
});
document.getElementById('fmCats').addEventListener('click', e=>{
  const c=e.target.closest('[data-fcat]'); if(!c) return;
  const id=c.dataset.fcat;
  if(!id){ fmDraft.cats.clear(); }                       // 「不限」清空
  else if(fmDraft.cats.has(id)) fmDraft.cats.delete(id);  // 再点取消
  else fmDraft.cats.add(id);                              // 多选累加
  renderFmCats();
});
document.getElementById('fmReset').onclick = ()=>{ filterModal.classList.remove('show'); resetFilters(); };
document.getElementById('fmApply').onclick = ()=>{
  const min=parseFloat(document.getElementById('fmMin').value), max=parseFloat(document.getElementById('fmMax').value);
  listFilter.type=fmDraft.type; listFilter.catIds=[...fmDraft.cats];
  listFilter.amtMin = isFinite(min)?min:null; listFilter.amtMax = isFinite(max)?max:null;
  filterModal.classList.remove('show'); updateFilterBtn(); renderList();
};
filterModal.onclick = e=>{ if(e.target===filterModal) filterModal.classList.remove('show'); };

function renderList(){
  const box = document.getElementById('listContent');
  let recs = monthRecords();
  if(listFilter.type) recs = recs.filter(r=>r.type===listFilter.type);
  if(listFilter.catIds.length) recs = recs.filter(r=>listFilter.catIds.includes(r.categoryId));
  if(listFilter.amtMin!=null) recs = recs.filter(r=>r.amount>=listFilter.amtMin);
  if(listFilter.amtMax!=null) recs = recs.filter(r=>r.amount<=listFilter.amtMax);
  if(listFilter.q){ const q=listFilter.q.toLowerCase();
    recs = recs.filter(r=>{ const c=catById(r.type,r.categoryId);
      return (r.note||'').toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || String(r.amount).includes(q); });
  }
  recs = recs.sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  renderFilterBar(recs);
  if(!recs.length){
    box.innerHTML = isFiltered()
      ? '<div class="empty">没有匹配的记录</div>'
      : '<div class="empty">本月还没有记录<br>点下方 + 开始记账</div>';
    return;
  }
  // 按日期分组
  const groups = {};
  recs.forEach(r=>{ const day=r.date.slice(0,10); (groups[day]=groups[day]||[]).push(r); });
  let html = '';
  Object.keys(groups).sort().reverse().forEach(day=>{
    const list = groups[day];
    let dExp=0, dInc=0; list.forEach(r=>{ const v=toUnit(r.amount, r.currency);
      r.type==='expense'?dExp+=v:dInc+=v; });
    const us=unitSymbol();
    const sub = [dExp?`支 ${fmt(dExp,us)}`:'', dInc?`收 ${fmt(dInc,us)}`:''].filter(Boolean).join('  ');
    html += `<div class="day-group"><div class="day-head">
      <span class="d-date">${fmtDay(day)}</span><span>${sub}</span></div><div class="card">`;
    list.forEach(r=>{
      const c = catById(r.type, r.categoryId);
      const sym = curInfo(r.currency).symbol;
      const time = r.date.slice(11,16);   // HH:MM
      html += `<div class="rec" data-id="${r.id}">
        <div class="ico" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
        <div class="mid"><div class="cat">${c.name}</div>
          <div class="note">${time}${r.note?' · '+esc(r.note):''}</div></div>
        <div class="amt ${r.type}">${r.type==='expense'?'-':'+'}${fmt(r.amount, sym)}</div>
      </div>`;
    });
    html += `</div></div>`;
  });
  box.innerHTML = html;
}

function fmtDay(day){
  const d=new Date(day+'T00:00:00'), now=new Date();
  const same=(a,b)=>a.toDateString()===b.toDateString();
  const wk=['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  if(same(d,now)) return '今天 '+wk;
  const y=new Date(now); y.setDate(now.getDate()-1);
  if(same(d,y)) return '昨天 '+wk;
  return `${d.getMonth()+1}月${d.getDate()}日 ${wk}`;
}

/* 点击一条记录 → 打开编辑面板（openSheet 在 entry.js，运行时已就绪） */
document.getElementById('listContent').addEventListener('click', e=>{
  const row = e.target.closest('.rec');
  if(!row) return;
  const r = records.find(x=>x.id===row.dataset.id);
  if(r) openSheet(r);
});
