/* =================== 记账弹层：收支切换 + 分类网格 + 数字键盘 =================== */
const sheet=document.getElementById('sheet');
const sheetInner=sheet.querySelector('.sheet-inner');
const curBtn=document.getElementById('curBtn');
const aiCurSlot=document.getElementById('aiCurSlot');
const curInlineSlot=document.getElementById('curInlineSlot');
const LS_LASTCUR='et_lastcur', LS_TPL='et_entry_templates';
let entryType='expense', entryCat=null, amtStr='0', entryDate=today(), entryCur='cny';
let editingId=null;   // null=新增，否则=正在编辑的记录 id
let entryTemplates = load(LS_TPL, []);
if(!Array.isArray(entryTemplates)) entryTemplates = [];
window.entryTemplates = entryTemplates;
let tplSaveOn = false;
const tplSaveBtn = document.getElementById('tplSave');

function placeCurBtn(inAiRow){
  (inAiRow ? aiCurSlot : curInlineSlot).appendChild(curBtn);
}

/* 记住上次用过的币种（仍在配置列表里才采用，否则回退人民币） */
function lastCur(){ const c=localStorage.getItem(LS_LASTCUR); return currencies.some(x=>x.code===c) ? c : 'cny'; }

/* 币种按钮：点一下切到下一个已配置币种；只有 1 种时隐藏 */
function updateCurBtn(){
  curBtn.textContent = curInfo(entryCur).symbol;
  curBtn.style.display = currencies.length>1 ? '' : 'none';
}
curBtn.onclick=()=>{
  const idx = currencies.findIndex(c=>c.code===entryCur);
  entryCur = currencies[(idx+1) % currencies.length].code;
  localStorage.setItem(LS_LASTCUR, entryCur);   // 记住选择
  updateCurBtn();
  updateAmt();   // 切币种立即刷新折算（相等时自动清空）
};

/* 连续记账：开后存完一笔不关弹层，接着记下一笔 */
let contMode = localStorage.getItem('et_cont')==='1';
const contToggle = document.getElementById('contToggle');
function renderContToggle(){ contToggle.classList.toggle('on', contMode); }
contToggle.onclick=()=>{ contMode=!contMode; localStorage.setItem('et_cont', contMode?'1':'0'); renderContToggle(); };
renderContToggle();

/* 点 + 自动聚焦语音输入：开后每次新增账目自动聚焦到「一句话记账」输入框，
   唤起键盘，用户直接点键盘上的 🎤 说话即可（默认关） */
let autoFocus = localStorage.getItem('et_autofocus')!=='0';   // 默认开启（仅显式关过才为关）
const autoFocusSw = document.getElementById('autoFocusSw');
function renderAutoFocusSw(){ if(autoFocusSw) autoFocusSw.classList.toggle('on', autoFocus); }
if(autoFocusSw) autoFocusSw.onclick=()=>{ autoFocus=!autoFocus; localStorage.setItem('et_autofocus', autoFocus?'1':'0'); renderAutoFocusSw(); };
renderAutoFocusSw();

/* 基础点击独立保留；voice.js 加载后只在此基础上增强长按快捷语音。 */
document.getElementById('tabAdd').onclick=()=>openSheet();
/* 传入 rec 进入编辑模式（预填该记录），不传则为新增 */
function openSheet(rec){
  editingId = rec ? rec.id : null;
  sheetInner.classList.toggle('editing', !!rec);
  placeCurBtn(!rec);
  setTemplateSaveOn(false);
  if(rec){
    entryDate = rec.date.slice(0,10);
    entryCur = rec.currency || 'cny';
    setType(rec.type);                 // 先重建分类网格
    entryCat = rec.categoryId; highlightCat();   // 再覆盖为该记录分类
    amtStr = String(rec.amount);
    document.getElementById('noteIn').value = rec.note || '';
  } else {
    entryType='expense'; amtStr='0'; entryDate=today(); entryCur=lastCur();
    document.getElementById('noteIn').value='';
    setType('expense');
  }
  updateAmt(); updateDateBtn(); updateCurBtn();
  sheet.classList.add('show');
  // 新增账目 + 已开自动聚焦 → 聚焦语音输入框唤起键盘（编辑模式不打扰）
  if(!rec && autoFocus){
    const ai = document.getElementById('aiInput');
    if(ai) setTimeout(()=>{ ai.focus(); }, 250);   // 待弹层动画就位再聚焦，键盘才稳定弹出
  }
}
function closeSheet(){
  if(sheet.classList.contains('show') && typeof cancelVoiceListening==='function') cancelVoiceListening();
  sheet.classList.remove('show');
}
sheet.onclick=e=>{ if(e.target===sheet) closeSheet(); };

document.getElementById('sheetDel').onclick=()=>{
  if(!editingId) return;
  const idx = records.findIndex(r=>r.id===editingId);
  if(idx<0) return;
  const removed = records[idx];
  records.splice(idx,1); save(); closeSheet(); renderAll();
  if(window.noteRecordChanged) noteRecordChanged();
  showToast('已删除', '撤销', ()=>{ records.splice(idx,0,removed); save(); if(window.noteRecordChanged) noteRecordChanged(); renderAll(); });
};

document.querySelectorAll('.type-toggle button').forEach(b=>{
  b.onclick=()=>setType(b.dataset.type);
});
function setType(type){
  entryType=type;
  document.querySelectorAll('.type-toggle button').forEach(b=>{
    b.className=''; if(b.dataset.type===type) b.classList.add('on',type);
  });
  document.getElementById('keySave').classList.toggle('income', type==='income');
  renderCatGrid();
}
function renderCatGrid(){
  const grid=document.getElementById('catGrid');
  grid.innerHTML=cats[entryType].map(c=>`<div class="cat-cell" data-cid="${c.id}">
    <div class="cc-ico" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
    <div class="cc-nm">${c.name}</div></div>`).join('');
  entryCat = getDefaultCat(entryType) || cats[entryType][0]?.id || null;
  highlightCat();
  grid.querySelectorAll('.cat-cell').forEach(cell=>{
    cell.onclick=()=>{ entryCat=cell.dataset.cid; highlightCat(); };
  });
}
function highlightCat(){
  document.querySelectorAll('#catGrid .cat-cell').forEach(c=>
    c.classList.toggle('on', c.dataset.cid===entryCat));
}

/* 记账模板：保存分类/金额/币种/备注，下次一键回填后可再调整金额 */
function saveEntryTemplates(){
  entryTemplates = entryTemplates.slice(0, 100);
  window.entryTemplates = entryTemplates;
  localStorage.setItem(LS_TPL, JSON.stringify(entryTemplates));
}
function setEntryTemplates(list){
  entryTemplates = Array.isArray(list) ? list.filter(t=>t && t.categoryId).slice(0, 100) : [];
  saveEntryTemplates();
}
window.setEntryTemplates = setEntryTemplates;
function fallbackCatId(type){
  const arr = cats[type] || [];
  return (arr.find(isOther) || arr[0] || {}).id || null;
}
function normalizeTemplate(t){
  const type = t.type==='income' ? 'income' : 'expense';
  const exists = (cats[type] || []).some(c=>c.id===t.categoryId);
  const curExists = currencies.some(c=>c.code===(t.currency || 'cny'));
  return {
    id:t.id || ('tpl'+Date.now()+Math.random().toString(36).slice(2,6)),
    type,
    categoryId:exists ? t.categoryId : fallbackCatId(type),
    amount:Math.round(Number(t.amount || 0)*100)/100,
    currency:curExists ? (t.currency || 'cny') : 'cny',
    note:String(t.note || '').slice(0,30),
    updatedAt:t.updatedAt || Date.now()
  };
}
function templateKey(t){
  return [t.type, t.categoryId, t.currency, t.note.trim()].join('|');
}
function templateTitle(t){
  const c = catById(t.type, t.categoryId);
  return (t.note ? t.note : c.name);
}
function renderTemplateList(){
  const box = document.getElementById('tplList');
  if(!box) return;
  if(!entryTemplates.length){
    box.innerHTML = '<div class="tpl-empty">还没有模板<br>先打开「存为模板」，提交一笔</div>';
    return;
  }
  box.innerHTML = entryTemplates.map(t=>{
    const nt = normalizeTemplate(t), c = catById(nt.type, nt.categoryId), cur = curInfo(nt.currency);
    return `<div class="tpl-item" data-tpl="${nt.id}">
      <div class="tpl-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      <div class="tpl-main">
        <div class="tpl-title">${esc(templateTitle(nt))}</div>
        <div class="tpl-sub">${nt.type==='expense'?'支出':'收入'} · ${esc(c.name)} · ${esc(cur.name)}</div>
      </div>
      <div class="tpl-amt">${fmt(nt.amount, cur.symbol)}</div>
      <span class="bk-del" data-tpl-del="${nt.id}">✕</span>
    </div>`;
  }).join('');
}
function renderTemplateSaveToggle(){
  if(!tplSaveBtn) return;
  tplSaveBtn.classList.toggle('on', tplSaveOn);
  tplSaveBtn.textContent = tplSaveOn ? '存模板：开' : '存模板：关';
}
function setTemplateSaveOn(on){
  tplSaveOn = !!on;
  renderTemplateSaveToggle();
}
window.entryTemplateSaveEnabled = ()=>tplSaveOn;
function openTemplateModal(){
  document.getElementById('aiInput')?.blur();
  document.getElementById('noteIn')?.blur();
  renderTemplateList();
  document.getElementById('tplModal').classList.add('show');
}
function closeTemplateModal(){ document.getElementById('tplModal').classList.remove('show'); }
function saveTemplateFromEntry(data, silent){
  const val = Math.round(Number(data ? data.amount : evalAmt())*100)/100;
  const categoryId = data ? data.categoryId : entryCat;
  if(!val || val<=0){ if(!silent) showAlert('先填写模板金额'); return false; }
  if(!categoryId){ if(!silent) showAlert('请选择分类'); return false; }
  const tpl = normalizeTemplate({
    type:data ? data.type : entryType,
    amount:val,
    categoryId,
    note:data ? (data.note || '') : document.getElementById('noteIn').value.trim(),
    currency:data ? (data.currency || 'cny') : entryCur,
    updatedAt:Date.now()
  });
  const key = templateKey(tpl);
  entryTemplates = [tpl, ...entryTemplates.filter(t=>templateKey(normalizeTemplate(t))!==key)];
  saveEntryTemplates();
  if(!silent) showToast('已保存模板');
  return true;
}
window.saveTemplateFromEntry = saveTemplateFromEntry;
function applyTemplate(tpl){
  const t = normalizeTemplate(tpl);
  setType(t.type);
  entryCat = t.categoryId || fallbackCatId(t.type);
  highlightCat();
  entryCur = t.currency;
  amtStr = String(t.amount || 0);
  document.getElementById('noteIn').value = t.note || '';
  localStorage.setItem(LS_LASTCUR, entryCur);
  updateCurBtn();
  updateAmt();
  closeTemplateModal();
  showToast('已套用模板');
}
document.getElementById('tplOpen').onclick = openTemplateModal;
tplSaveBtn.onclick = ()=>{
  setTemplateSaveOn(!tplSaveOn);
  showToast(tplSaveOn ? '提交时会保存模板' : '已关闭保存模板');
};
document.getElementById('tplCancel').onclick = closeTemplateModal;
document.getElementById('tplModal').onclick = e=>{ if(e.target.id==='tplModal') closeTemplateModal(); };
document.getElementById('tplList').onclick = e=>{
  const del = e.target.closest('[data-tpl-del]');
  if(del){
    e.stopPropagation();
    entryTemplates = entryTemplates.filter(t=>t.id!==del.dataset.tplDel);
    saveEntryTemplates();
    renderTemplateList();
    showToast('已删除模板');
    return;
  }
  const row = e.target.closest('[data-tpl]');
  if(!row) return;
  const tpl = entryTemplates.find(t=>t.id===row.dataset.tpl);
  if(tpl) applyTemplate(tpl);
};

/* 金额键盘 —— 支持 + / − / × / ÷ 简单运算 */
document.querySelectorAll('.keypad .key').forEach(k=>{
  k.onclick=()=>{
    if(k.id==='keySave'){ commitEntry(); return; }
    const op=k.dataset.op;
    if(op==='del'){ amtStr=amtStr.length>1?amtStr.slice(0,-1):'0'; }
    else if(op==='clear'){ amtStr='0'; }
    else if(op==='plus'||op==='minus'||op==='mul'||op==='div'){
      const sign = { plus:'+', minus:'-', mul:'×', div:'÷' }[op];
      const current = evalAmt();
      if((op==='mul'||op==='div') && (!Number.isFinite(Number(current)) || Number(current)===0)) return;
      amtStr = current;
      if(!/[+\-×÷]$/.test(amtStr)) amtStr += sign;
    }
    else { // 数字或小数点
      const ch=k.textContent;
      if(ch==='.'){ const seg=lastSeg(amtStr); if(seg.includes('.')) return; amtStr+='.'; }
      else { if(amtStr==='0') amtStr=ch; else amtStr+=ch; }
    }
    updateAmt();
  };
});
function lastSeg(s){ return s.split(/[+\-×÷]/).pop(); }
function evalAmt(){
  const hasOp = /[+\-×÷]/.test(amtStr);
  const raw = amtStr.replace(/[+\-×÷]$/,'') || '0';
  const expr = raw.replace(/×/g,'*').replace(/÷/g,'/');
  try{
    if(/[+\-*/]/.test(expr)){
      const v=Function('return '+expr)();
      if(Number.isFinite(v)) return String(Math.round(v*100)/100);
    }
  }catch(e){}
  return hasOp && /[+\-*/]/.test(expr) ? '0' : raw;
}
function updateAmt(){
  document.getElementById('showAmt').textContent = amtStr;
  const conv = document.getElementById('amtConv');
  const v = Number(evalAmt());
  conv.textContent = (v>0 && entryCur!==statUnit) ? '≈ ' + fmt(toUnit(v, entryCur, entryDate), unitSymbol()) : '';
}
function updateDateBtn(){
  const b=document.getElementById('dateBtn');
  b.textContent = entryDate===today() ? '今天' : entryDate.slice(5).replace('-','/');
}
/* 自定义中文日历 */
const dpick=document.getElementById('dpick');
const dpickCard=document.querySelector('#dpick .dpick-card');
const dpTitle=document.getElementById('dpTitle');
const dpMonthPanel=document.getElementById('dpMonthPanel');
let dpYear, dpMonth, dpValue=today(), dpPick=null;
function openDatePicker(value, onPick){
  dpValue = value || today();
  dpPick = typeof onPick==='function' ? onPick : null;
  const [y,m]=dpValue.split('-').map(Number);
  dpYear=y; dpMonth=m-1;
  setDateMonthMode(false);
  renderDateGrid();
  dpick.classList.add('show');
}
function closeDatePicker(){
  setDateMonthMode(false);
  dpick.classList.remove('show');
  dpPick = null;
}
window.openDatePicker = openDatePicker;
document.getElementById('dateBtn').onclick=()=>{
  openDatePicker(entryDate, d=>{ entryDate=d; updateDateBtn(); });
};
function renderDateGrid(){
  dpTitle.textContent = `${dpYear}年${dpMonth+1}月`;
  const first = new Date(dpYear, dpMonth, 1).getDay();
  const days  = new Date(dpYear, dpMonth+1, 0).getDate();
  let cells='';
  for(let i=0;i<first;i++) cells+='<span></span>';
  for(let d=1;d<=days;d++){
    const ds = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += `<span class="d${ds===dpValue?' on':''}${ds===today()?' today':''}" data-d="${ds}">${d}</span>`;
  }
  document.getElementById('dpGrid').innerHTML = cells;
}
function renderDateMonthGrid(){
  document.getElementById('dpYearLabel').textContent = `${dpYear}年`;
  document.getElementById('dpMonthGrid').innerHTML = Array.from({length:12}, (_,i)=>
    `<div class="m${i===dpMonth?' on':''}" data-dp-month="${i}">${i+1}月</div>`
  ).join('');
}
function setDateMonthMode(open){
  dpickCard.classList.toggle('month-mode', open);
  dpTitle.setAttribute('aria-expanded', String(open));
  if(open) renderDateMonthGrid();
}
function closeDateMonthPanel(){
  if(!dpickCard.classList.contains('month-mode')) return false;
  setDateMonthMode(false);
  return true;
}
window.closeDateMonthPanel = closeDateMonthPanel;
dpTitle.onclick=()=>setDateMonthMode(!dpickCard.classList.contains('month-mode'));
document.getElementById('dpYearPrev').onclick=()=>{ dpYear--; renderDateMonthGrid(); };
document.getElementById('dpYearNext').onclick=()=>{ dpYear++; renderDateMonthGrid(); };
dpMonthPanel.onclick=e=>{
  const cell=e.target.closest('[data-dp-month]');
  if(!cell) return;
  dpMonth=Number(cell.dataset.dpMonth);
  setDateMonthMode(false);
  renderDateGrid();
};
document.getElementById('dpPrev').onclick=()=>{ if(--dpMonth<0){dpMonth=11;dpYear--;} renderDateGrid(); };
document.getElementById('dpNext').onclick=()=>{ if(++dpMonth>11){dpMonth=0;dpYear++;} renderDateGrid(); };
document.getElementById('dpToday').onclick=()=>{
  const d=today();
  if(dpPick) dpPick(d);
  closeDatePicker();
};
dpick.onclick=e=>{
  if(e.target===dpick){ closeDatePicker(); return; }
  const cell=e.target.closest('[data-d]');
  if(cell){
    if(dpPick) dpPick(cell.dataset.d);
    closeDatePicker();
  }
};

function commitEntry(){
  const val = Math.round(parseFloat(evalAmt())*100)/100;
  if(!val || val<=0){ showAlert('请输入金额'); return; }
  if(!entryCat){ showAlert('请选择分类'); return; }
  const note = document.getElementById('noteIn').value.trim();
  const wasEditing = !!editingId;
  let templateSaved = false;
  if(editingId){
    // 编辑：更新原记录，保留原有的时间部分
    const rec = records.find(r=>r.id===editingId);
    if(rec){
      rec.type=entryType; rec.amount=val; rec.categoryId=entryCat; rec.note=note; rec.currency=entryCur;
      rec.date = entryDate + 'T' + (rec.date.slice(11) || new Date().toTimeString().slice(0,8));
    }
  } else {
    const iso = entryDate + 'T' + new Date().toTimeString().slice(0,8);
    records.push({ id:'r'+Date.now()+Math.random().toString(36).slice(2,6),
      type:entryType, amount:val, categoryId:entryCat, note, currency:entryCur, date:iso, createdAt:Date.now() });
    localStorage.setItem(LS_LASTCUR, entryCur);   // 下次新记账默认沿用
  }
  if(tplSaveOn) templateSaved = saveTemplateFromEntry({ type:entryType, amount:val, categoryId:entryCat, note, currency:entryCur }, true);
  setTemplateSaveOn(false);
  save();
  if(window.noteRecordChanged) noteRecordChanged();
  // 跳到该笔所在月份
  const [jy,jm] = entryDate.split('-').map(Number);
  viewYear=jy; viewMonth=jm-1;
  clearStatSelection();
  renderAll();
  if(!editingId && contMode){          // 连续记账：清空金额/备注，保留分类/日期/币种，弹层不关
    amtStr='0'; document.getElementById('noteIn').value=''; updateAmt();
    showToast(templateSaved ? '已记一笔 · 已存模板 · 继续' : '已记一笔 · 继续');
  } else {
    closeSheet();
    if(templateSaved) showToast(wasEditing ? '已保存 · 已存模板' : '已记一笔 · 已存模板');
  }
}
