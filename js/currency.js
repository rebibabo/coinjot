/* =================== 币种管理 + 每日汇率 ===================
   汇率来源（免费、以人民币为基准）：
   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json
   返回 { date, cny:{ usd:0.14, ... } }，即「1 元 = 多少外币」。 */
const RATE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json';

/* ---- 设置页：币种增删 ---- */
function renderCurEditors(){
  const box = document.getElementById('curEdit');
  box.innerHTML = currencies.map(c=>{
    const info = curInfo(c.code);
    const rm = c.code==='cny' ? '' : `<span class="x" data-rmcur="${c.code}">×</span>`;
    return `<div class="cat-chip">${info.symbol} ${info.name}${rm}</div>`;
  }).join('') + `<div class="cat-chip add" data-addcur>＋ 添加</div>`;
  refreshRateStatus();
  refreshStatUnitLabel();
}

/* 统计单位：点一下在已配置币种间切换 */
function refreshStatUnitLabel(){
  const el = document.getElementById('statUnitLabel');
  if(el){ const i=curInfo(statUnit); el.textContent = `${i.symbol} ${i.name} ›`; }
}
document.getElementById('btnStatUnit').onclick = ()=>{
  const idx = currencies.findIndex(c=>c.code===statUnit);
  statUnit = currencies[(idx+1) % currencies.length].code;
  localStorage.setItem(LS_UNIT, statUnit);
  refreshStatUnitLabel(); renderAll();
};
document.getElementById('curEdit').addEventListener('click', e=>{
  if(e.target.closest('[data-addcur]')) return openCurModal();
  const rm = e.target.closest('[data-rmcur]');
  if(rm){ currencies = currencies.filter(c=>c.code!==rm.dataset.rmcur);
    if(!currencies.some(c=>c.code===statUnit)){ statUnit='cny'; localStorage.setItem(LS_UNIT, statUnit); }
    saveCur(); renderCurEditors(); renderAll(); if(window.updateCurBtn) updateCurBtn(); }
});

/* ---- 添加币种弹窗：常用一排可点，其它输代码 ---- */
function addCurrency(code){
  code = (code||'').trim().toLowerCase();
  if(!code || currencies.some(c=>c.code===code)) return;
  currencies.push(curInfo(code));                 // 用目录或代码兜底生成 {code,symbol,name}
  saveCur(); renderCurEditors();
  if(window.updateCurBtn) updateCurBtn();
  if(!rates || !rates.map || rates.map[code]==null) updateRates(true);   // 缺该币汇率则拉一次
}
const curModal = document.getElementById('curModal');
function renderCurOptions(){
  const have = new Set(currencies.map(c=>c.code));
  const opts = Object.keys(CUR_CATALOG).filter(c=>c!=='cny' && !have.has(c));
  document.getElementById('curOptions').innerHTML = opts.length
    ? opts.map(c=>`<span class="prov" data-addcode="${c}">${CUR_CATALOG[c].symbol} ${CUR_CATALOG[c].name}</span>`).join('')
    : '<span class="mdl-empty">常用币种都加完了，可在下面输代码</span>';
}
function openCurModal(){ renderCurOptions(); document.getElementById('curCodeIn').value=''; curModal.classList.add('show'); }
document.getElementById('curOptions').addEventListener('click', e=>{
  const c = e.target.closest('[data-addcode]'); if(!c) return;
  addCurrency(c.dataset.addcode); renderCurOptions();   // 加完刷新（已加的消失），可继续加
});
function addCustomCur(){
  const inp = document.getElementById('curCodeIn');
  addCurrency(inp.value); inp.value=''; inp.focus(); renderCurOptions();
}
document.getElementById('curCodeAdd').onclick = addCustomCur;
document.getElementById('curCodeIn').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addCustomCur(); } });
document.getElementById('curClose').onclick = ()=> curModal.classList.remove('show');
curModal.onclick = e=>{ if(e.target===curModal) curModal.classList.remove('show'); };

/* 明细页汇率警告：有外币记录/统计单位缺汇率时提示，点击更新 */
function renderRateWarn(){
  const el = document.getElementById('rateWarn'); if(!el) return;
  const miss = new Set();
  records.forEach(r=>{ if(r.currency && r.currency!=='cny' && rateOf(r.currency)==null) miss.add(r.currency); });
  if(statUnit!=='cny' && rateOf(statUnit)==null) miss.add(statUnit);
  if(miss.size){
    el.style.display='';
    el.textContent = '⚠️ 部分外币暂无汇率，金额可能不准 · 点此更新汇率';
  } else el.style.display='none';
}
document.getElementById('rateWarn').onclick = ()=> updateRates(true);

/* ---- 汇率：按日缓存，每天首次自动更新；也可手动 ---- */
function refreshRateStatus(){
  const el = document.getElementById('rateStatus');
  if(!el) return;
  el.textContent = (rates && rates.date) ? `更新于 ${rates.date} ›` : '未更新 ›';
}
document.getElementById('btnUpdateRate').onclick = async ()=>{
  await updateRates(true);                 // 强制拉最新
  if(rates && rates.map) openRateModal();  // 拉到了就弹面板
};

async function updateRates(force){
  if(!force && rates && rates.date===today()) return true;   // 今天已更新
  const btn = document.getElementById('btnUpdateRate');
  if(force){ btn.style.pointerEvents='none'; document.getElementById('rateStatus').textContent='更新中…'; }
  try{
    const res = await fetch(RATE_URL);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    rates = { date: today(), map: data.cny || {} };
    localStorage.setItem(LS_RATES, JSON.stringify(rates));
    refreshRateStatus(); renderAll();
    return true;
  }catch(err){
    refreshRateStatus();
    if(force) showAlert('汇率更新失败：' + (err.message || err));
    return false;
  }finally{
    if(force) btn.style.pointerEvents='';
  }
}

/* ---- 今日汇率面板：已配置币种 + 常用货币，方向「1 外币 = X 元」 ---- */
const RATE_COMMON = ['usd','eur','jpy','gbp','hkd','krw','twd','sgd','aud','cad'];
const rateModal = document.getElementById('rateModal');
function openRateModal(){
  document.getElementById('rmDate').textContent =
    (rates && rates.date ? `更新于 ${rates.date}` : '尚无汇率') + ' · 兑人民币';
  const codes = [];
  currencies.forEach(c=>{ if(c.code!=='cny') codes.push(c.code); });   // 先放你在用的
  RATE_COMMON.forEach(c=>{ if(!codes.includes(c)) codes.push(c); });   // 再补常用
  document.getElementById('rmList').innerHTML = codes.map(code=>{
    const info = curInfo(code), r = rateOf(code), cny = r ? 1/r : null;
    const val = cny==null ? '汇率缺失' : `1 = ${cny.toFixed(4)} 元`;
    const used = currencies.some(c=>c.code===code) ? '<span class="rm-used">在用</span>' : '';
    return `<div class="rm-row"><div class="rm-nm">${info.symbol} ${info.name}
      <span class="rm-code">${code.toUpperCase()}</span>${used}</div>
      <div class="rm-val">${val}</div></div>`;
  }).join('');
  rateModal.classList.add('show');
}
document.getElementById('rmClose').onclick = ()=> rateModal.classList.remove('show');
rateModal.onclick = e=>{ if(e.target===rateModal) rateModal.classList.remove('show'); };
